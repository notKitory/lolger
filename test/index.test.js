import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import {
	closeLogger,
	configureLogger,
	consoleTransport,
	fileTransport,
	flushLogger,
	getLogger,
	LogLevel,
	Lolger,
	lolger,
} from "../dist/index.js";

const require = createRequire(import.meta.url);

afterEach(async () => {
	delete globalThis.Deno;
	await closeLogger();
	configureLogger({
		level: LogLevel.LOG,
		timestamp: "time",
		format: "pretty",
		baseFields: undefined,
		transports: [],
	});
});

test("logger.log respects LogLevel.LOG threshold", async () => {
	const writes = [];

	configureLogger({
		level: LogLevel.LOG,
		transports: [
			{
				name: "memory",
				write(record, rendered) {
					writes.push({ record, rendered });
				},
			},
		],
	});

	const logger = getLogger("threshold");
	logger.debug("hidden");
	logger.log("shown");
	logger.info("also shown");
	await flushLogger();

	assert.equal(writes.length, 2);
	assert.equal(writes[0].record.level, "LOG");
	assert.equal(writes[1].record.level, "INFO");
});

test("pretty console writes formatted line first and native errors separately", async () => {
	const consoleMock = mockConsole();

	configureLogger({
		level: LogLevel.DEBUG,
		transports: [consoleTransport({ colors: false })],
	});

	const logger = getLogger("browser");
	const error = new Error("boom");

	logger.warn("Heads up", error);
	await flushLogger();

	consoleMock.restore();

	assert.equal(consoleMock.calls.warn.length, 1);
	assert.match(
		consoleMock.calls.warn[0][0],
		/\d{2}:\d{2}:\d{2}\s+\[WARN\] \(browser\) Heads up Error$/,
	);
	assert.equal(consoleMock.calls.log.length, 1);
	assert.equal(consoleMock.calls.log[0][0], error);
});

test("pretty file mode inlines serialized errors into a single record", async () => {
	const tempDir = await mkdtemp(path.join(os.tmpdir(), "lolger-pretty-file-"));

	try {
		const filePath = path.join(tempDir, "app.log");

		configureLogger({
			level: LogLevel.DEBUG,
			transports: [fileTransport({ path: filePath, format: "pretty" })],
		});

		const logger = getLogger("file");
		logger.error("Failure", new Error("broken"));
		await flushLogger();

		const text = await readFile(filePath, "utf8");
		assert.match(text, /\[ERROR\] \(file\) Failure Error/);
		assert.match(text, /"message": "broken"/);
		assert.match(text, /"stack":/);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("jsonl output includes structured fields and serialized errors", async () => {
	const writes = [];

	configureLogger({
		level: LogLevel.DEBUG,
		timestamp: "iso",
		baseFields: {
			service: "api",
			meta: { env: "test" },
		},
		transports: [
			{
				name: "memory-jsonl",
				format: "jsonl",
				write(record, rendered) {
					writes.push({ record, rendered });
				},
			},
		],
	});

	const logger = getLogger("structured");
	logger.info("Request complete", { ok: true }, new Error("boom"));
	await flushLogger();

	assert.equal(writes.length, 1);

	const payload = JSON.parse(writes[0].rendered);
	assert.equal(payload.level, "INFO");
	assert.equal(payload.namespace, "structured");
	assert.equal(payload.fields.service, "api");
	assert.deepEqual(payload.fields.meta, { env: "test" });
	assert.equal(payload.errors[0].message, "boom");
	assert.equal(payload.args[1].ok, true);
});

test("functions are rendered with name, kind, and arity", async () => {
	const writes = [];

	configureLogger({
		level: LogLevel.DEBUG,
		timestamp: "iso",
		transports: [
			{
				name: "memory-functions",
				format: "jsonl",
				write(record, rendered) {
					writes.push({ record, rendered });
				},
			},
		],
	});

	function handler(first, second) {
		return `${first}:${second}`;
	}

	async function fetchUser(id) {
		return id;
	}

	getLogger("fn").info(handler, fetchUser);
	await flushLogger();

	const payload = JSON.parse(writes[0].rendered);
	assert.equal(
		payload.message,
		"[Function: handler/2] [AsyncFunction: fetchUser/1]",
	);
	assert.equal(payload.args[0], "[Function: handler/2]");
	assert.equal(payload.args[1], "[AsyncFunction: fetchUser/1]");
});

test("logfmt escapes strings and JSON-stringifies complex values", async () => {
	const writes = [];

	configureLogger({
		level: LogLevel.DEBUG,
		timestamp: "iso",
		baseFields: {
			service: "backend",
			context: { env: "test" },
			"request id": 42,
		},
		transports: [
			{
				name: "memory-logfmt",
				format: "logfmt",
				write(record, rendered) {
					writes.push({ record, rendered });
				},
			},
		],
	});

	// Keep the message simple so assertions stay focused on logfmt encoding.
	getLogger("fmt").info("hello world");
	await flushLogger();

	const line = writes[0].rendered;
	assert.match(line, /ts=/);
	assert.match(line, /level=INFO/);
	assert.match(line, /ns=fmt/);
	assert.match(line, /msg="hello world"/);
	assert.match(line, /service=backend/);
	assert.match(line, /request_id=42/);
	assert.match(line, /context="\{\\"env\\":\\"test\\"\}"/);
	assert.match(line, /args="\[\\"hello world\\"\]"/);
});

test("mixed transports can write pretty console output and jsonl file output together", async () => {
	const consoleMock = mockConsole();
	const tempDir = await mkdtemp(path.join(os.tmpdir(), "lolger-mixed-"));

	try {
		const filePath = path.join(tempDir, "mixed.log");

		configureLogger({
			level: LogLevel.DEBUG,
			timestamp: "iso",
			transports: [
				consoleTransport({ colors: false }),
				fileTransport({ path: filePath, format: "jsonl" }),
			],
		});

		getLogger("mix").info("Hello", { ok: true });
		await flushLogger();

		consoleMock.restore();

		assert.equal(consoleMock.calls.info.length, 1);
		assert.match(consoleMock.calls.info[0][0], /\[INFO\] \(mix\) Hello \{/);

		const fileText = await readFile(filePath, "utf8");
		const payload = JSON.parse(fileText.trim());

		assert.equal(payload.level, "INFO");
		assert.equal(payload.namespace, "mix");
		assert.equal(payload.args[1].ok, true);
	} finally {
		consoleMock.restore();
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("file rotation with maxFiles > 1 keeps numbered archives", async () => {
	const tempDir = await mkdtemp(path.join(os.tmpdir(), "lolger-rotate-"));

	try {
		const filePath = path.join(tempDir, "rotate.log");

		configureLogger({
			level: LogLevel.DEBUG,
			timestamp: "iso",
			transports: [
				fileTransport({
					path: filePath,
					format: "jsonl",
					rotate: {
						maxBytes: 1,
						maxFiles: 3,
					},
				}),
			],
		});

		const logger = getLogger("rotate");
		logger.info("first");
		await flushLogger();
		logger.info("second");
		await flushLogger();
		logger.info("third");
		await flushLogger();

		const current = JSON.parse((await readFile(filePath, "utf8")).trim());
		const archive1 = JSON.parse(
			(await readFile(`${filePath}.1`, "utf8")).trim(),
		);
		const archive2 = JSON.parse(
			(await readFile(`${filePath}.2`, "utf8")).trim(),
		);

		assert.equal(current.message, "third");
		assert.equal(archive1.message, "second");
		assert.equal(archive2.message, "first");
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("single-file retention for line-oriented formats drops oldest lines from the top", async () => {
	const tempDir = await mkdtemp(path.join(os.tmpdir(), "lolger-retain-"));

	try {
		const filePath = path.join(tempDir, "retain.log");
		const preview = [];

		configureLogger({
			level: LogLevel.DEBUG,
			timestamp: "iso",
			transports: [
				{
					name: "preview",
					format: "jsonl",
					write(record, rendered) {
						preview.push({ record, rendered });
					},
				},
			],
		});

		getLogger("retain").info("one");
		await flushLogger();

		const lineSize = getByteLength(`${preview[0].rendered}\n`);

		configureLogger({
			level: LogLevel.DEBUG,
			timestamp: "iso",
			transports: [
				fileTransport({
					path: filePath,
					format: "jsonl",
					rotate: {
						maxBytes: lineSize * 2 + 4,
						maxFiles: 1,
					},
				}),
			],
		});

		const logger = getLogger("retain");
		logger.info("one");
		await flushLogger();
		logger.info("two");
		await flushLogger();
		logger.info("three");
		await flushLogger();

		const lines = (await readFile(filePath, "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));

		assert.equal(lines.length, 2);
		assert.equal(lines[0].message, "two");
		assert.equal(lines[1].message, "three");
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("single-file retention keeps an oversize line-oriented record whole", async () => {
	const tempDir = await mkdtemp(path.join(os.tmpdir(), "lolger-oversize-"));

	try {
		const filePath = path.join(tempDir, "oversize.log");

		configureLogger({
			level: LogLevel.DEBUG,
			timestamp: "iso",
			transports: [
				fileTransport({
					path: filePath,
					format: "logfmt",
					rotate: {
						maxBytes: 10,
						maxFiles: 1,
					},
				}),
			],
		});

		getLogger("oversize").info(
			"this message is definitely bigger than ten bytes",
		);
		await flushLogger();

		const text = await readFile(filePath, "utf8");
		assert.match(text, /this message is definitely bigger than ten bytes/);
		assert.ok(getByteLength(text) > 10);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("non-line-oriented maxFiles=1 replaces the file with the newest record", async () => {
	const tempDir = await mkdtemp(path.join(os.tmpdir(), "lolger-replace-"));

	try {
		const filePath = path.join(tempDir, "replace.log");

		configureLogger({
			level: LogLevel.DEBUG,
			transports: [
				fileTransport({
					path: filePath,
					format: "pretty",
					rotate: {
						maxBytes: 1,
						maxFiles: 1,
					},
				}),
			],
		});

		const logger = getLogger("replace");
		logger.info("first");
		await flushLogger();
		logger.info("second");
		await flushLogger();

		const text = await readFile(filePath, "utf8");
		assert.doesNotMatch(text, /first/);
		assert.match(text, /second/);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});

test("flushLogger and closeLogger wait for async transports", async () => {
	const writes = [];
	let closeCalls = 0;

	configureLogger({
		transports: [
			{
				name: "async",
				async write(record, rendered) {
					await delay(20);
					writes.push({ record, rendered });
				},
				async close() {
					closeCalls += 1;
				},
			},
		],
	});

	// The write is intentionally async, so nothing should be observable before flush.
	getLogger("async").info("queued");
	assert.equal(writes.length, 0);

	await flushLogger();
	assert.equal(writes.length, 1);

	await closeLogger();
	assert.equal(closeCalls, 1);
});

test("a failing transport is disabled after the first error and emits one diagnostic", async () => {
	const consoleMock = mockConsole();
	const successfulWrites = [];
	let failingWrites = 0;

	configureLogger({
		level: LogLevel.DEBUG,
		transports: [
			{
				name: "broken",
				write() {
					failingWrites += 1;
					throw new Error("nope");
				},
			},
			{
				name: "healthy",
				write(record, rendered) {
					successfulWrites.push({ record, rendered });
				},
			},
		],
	});

	const logger = getLogger("failure");
	logger.info("first");
	logger.info("second");
	await flushLogger();

	consoleMock.restore();

	assert.equal(failingWrites, 1);
	assert.equal(successfulWrites.length, 2);
	assert.equal(consoleMock.calls.error.length, 1);
	assert.match(consoleMock.calls.error[0][0], /transport "broken" failed/);
});

test("file transport prefers the Deno runtime branch when Deno is available", async () => {
	const denoMock = createDenoMock();
	globalThis.Deno = denoMock;

	configureLogger({
		level: LogLevel.DEBUG,
		timestamp: "iso",
		transports: [
			fileTransport({
				path: "/virtual/app.log",
				format: "jsonl",
				rotate: {
					maxBytes: 1024,
					maxFiles: 2,
				},
			}),
		],
	});

	getLogger("deno").info("from deno");
	await flushLogger();

	const stored = denoMock.readStored("/virtual/app.log");
	const payload = JSON.parse(stored.trim());

	assert.equal(payload.namespace, "deno");
	assert.equal(payload.message, "from deno");
});

test("file transport falls back to Deno.writeTextFile append mode", async () => {
	const denoMock = createDenoMock({ omitAppendTextFile: true });
	globalThis.Deno = denoMock;

	configureLogger({
		level: LogLevel.DEBUG,
		timestamp: "iso",
		transports: [
			fileTransport({
				path: "/virtual/fallback.log",
				format: "jsonl",
			}),
		],
	});

	getLogger("deno-fallback").info("fallback works");
	await flushLogger();

	const stored = denoMock.readStored("/virtual/fallback.log");
	const payload = JSON.parse(stored.trim());

	assert.equal(payload.namespace, "deno-fallback");
	assert.equal(payload.message, "fallback works");
});

test("built output keeps Node file system access out of static imports", async () => {
	const builtSource = await readFile(
		new URL("../dist/index.js", import.meta.url),
		"utf8",
	);

	assert.doesNotMatch(builtSource, /^import .*node:fs\/promises/m);
	assert.doesNotMatch(builtSource, /^import .*node:fs$/m);
});

test("commonjs consumers can require the package root", async () => {
	const cjsModule = require("..");
	const writes = [];

	assert.equal(typeof cjsModule.getLogger, "function");
	assert.equal(cjsModule.LogLevel.INFO, LogLevel.INFO);
	assert.equal(cjsModule.lolger.constructor, cjsModule.Lolger);

	const cjsLolger = new cjsModule.Lolger({
		level: cjsModule.LogLevel.DEBUG,
		transports: [
			{
				name: "cjs-memory",
				format: "jsonl",
				write(record, rendered) {
					writes.push({ record, rendered });
				},
			},
		],
	});

	cjsLolger.getLogger("cjs").info("from require");
	await cjsLolger.flushLogger();

	assert.equal(writes.length, 1);
	assert.equal(JSON.parse(writes[0].rendered).message, "from require");

	await cjsLolger.closeLogger();
});

test("custom Lolger instances stay isolated from the global singleton", async () => {
	const globalWrites = [];
	const customWrites = [];

	configureLogger({
		level: LogLevel.DEBUG,
		transports: [
			{
				name: "global-memory",
				format: "jsonl",
				write(record, rendered) {
					globalWrites.push({ record, rendered });
				},
			},
		],
	});

	const customLolger = new Lolger({
		level: LogLevel.DEBUG,
		transports: [
			{
				name: "custom-memory",
				format: "jsonl",
				write(record, rendered) {
					customWrites.push({ record, rendered });
				},
			},
		],
	});

	assert.equal(lolger.constructor, Lolger);

	getLogger("global").info("from global");
	customLolger.getLogger("custom").info("from custom");

	await flushLogger();
	await customLolger.flushLogger();

	assert.equal(globalWrites.length, 1);
	assert.equal(customWrites.length, 1);
	assert.equal(globalWrites[0].record.namespace, "global");
	assert.equal(customWrites[0].record.namespace, "custom");
	assert.equal(globalWrites[0].record.message, "from global");
	assert.equal(customWrites[0].record.message, "from custom");

	await customLolger.closeLogger();
});

function mockConsole() {
	const original = {
		debug: console.debug,
		error: console.error,
		info: console.info,
		log: console.log,
		warn: console.warn,
	};

	const calls = {
		debug: [],
		error: [],
		info: [],
		log: [],
		warn: [],
	};

	console.debug = (...args) => {
		calls.debug.push(args);
	};
	console.error = (...args) => {
		calls.error.push(args);
	};
	console.info = (...args) => {
		calls.info.push(args);
	};
	console.log = (...args) => {
		calls.log.push(args);
	};
	console.warn = (...args) => {
		calls.warn.push(args);
	};

	return {
		calls,
		restore() {
			console.debug = original.debug;
			console.error = original.error;
			console.info = original.info;
			console.log = original.log;
			console.warn = original.warn;
		},
	};
}

function getByteLength(text) {
	return new TextEncoder().encode(text).length;
}

function createDenoMock(options = {}) {
	class DenoNotFound extends Error {}
	class DenoAlreadyExists extends Error {}

	const files = new Map();
	const omitAppendTextFile = options.omitAppendTextFile === true;

	const deno = {
		errors: {
			AlreadyExists: DenoAlreadyExists,
			NotFound: DenoNotFound,
		},
		mkdir() {
			return Promise.resolve();
		},
		readTextFile(filePath) {
			if (!files.has(filePath)) {
				return Promise.reject(new DenoNotFound(filePath));
			}
			return Promise.resolve(files.get(filePath));
		},
		remove(filePath) {
			if (!files.has(filePath)) {
				return Promise.reject(new DenoNotFound(filePath));
			}
			files.delete(filePath);
			return Promise.resolve();
		},
		rename(oldPath, newPath) {
			if (!files.has(oldPath)) {
				return Promise.reject(new DenoNotFound(oldPath));
			}
			files.set(newPath, files.get(oldPath));
			files.delete(oldPath);
			return Promise.resolve();
		},
		stat(filePath) {
			if (!files.has(filePath)) {
				return Promise.reject(new DenoNotFound(filePath));
			}
			return Promise.resolve({ size: getByteLength(files.get(filePath)) });
		},
		writeTextFile(filePath, data, options = {}) {
			if (options.append) {
				files.set(filePath, `${files.get(filePath) ?? ""}${data}`);
				return Promise.resolve();
			}

			files.set(filePath, data);
			return Promise.resolve();
		},
		readStored(filePath) {
			return files.get(filePath) ?? "";
		},
	};

	if (!omitAppendTextFile) {
		deno.appendTextFile = (filePath, data) => {
			files.set(filePath, `${files.get(filePath) ?? ""}${data}`);
			return Promise.resolve();
		};
	}

	return deno;
}
