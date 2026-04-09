// SPDX-License-Identifier: Apache-2.0

import chalk from "chalk";
import stringify from "json-stringify-safe";

type ChalkType = typeof chalk;

enum LogLevel {
	DEBUG = 0,
	LOG = 1,
	INFO = 2,
	WARN = 3,
	ERROR = 4,
}

type LogLevelName = "DEBUG" | "LOG" | "INFO" | "WARN" | "ERROR";
type LogFormat = "pretty" | "json" | "jsonl" | "logfmt";
type TimestampFormat = "time" | "iso";

interface SerializedError {
	name: string;
	message: string;
	stack?: string;
	[key: string]: unknown;
}

interface LogRecord {
	timestamp: string;
	level: LogLevelName;
	namespace: string;
	message: string;
	args: unknown[];
	fields?: Record<string, unknown>;
	errors?: SerializedError[];
}

interface Transport {
	name: string;
	format?: LogFormat;
	write(record: LogRecord, rendered: string): void | Promise<void>;
	flush?(): Promise<void>;
	close?(): Promise<void>;
}

interface ConfigureLoggerOptions {
	level?: LogLevel;
	timestamp?: TimestampFormat;
	baseFields?: Record<string, unknown>;
	format?: LogFormat;
	transports?: Transport[];
}

interface ConsoleTransportOptions {
	format?: LogFormat;
	colors?: boolean;
	stderrLevels?: LogLevel[];
}

interface RotationOptions {
	maxBytes: number;
	maxFiles: number;
}

interface FileTransportOptions {
	path: string;
	format?: LogFormat;
	rotate?: RotationOptions;
	mkdir?: boolean;
}

type InternalTransportKind = "console" | "file" | "custom";

interface InternalLogRecord extends LogRecord {
	levelValue: LogLevel;
	rawErrors: Error[];
}

interface TransportMeta {
	kind: InternalTransportKind;
	colors: boolean;
	stderrLevels: Set<LogLevel>;
}

interface TransportState {
	transport: InternalTransport;
	meta: TransportMeta;
	pending: Promise<void>;
	failed: boolean;
	diagnosticEmitted: boolean;
}

interface NodeFsRuntime {
	appendFile(path: string, data: string, encoding: "utf8"): Promise<void>;
	mkdir(path: string, options: { recursive: boolean }): Promise<void>;
	readFile(path: string, encoding: "utf8"): Promise<string>;
	rename(oldPath: string, newPath: string): Promise<void>;
	rm(path: string, options?: { force?: boolean }): Promise<void>;
	stat(path: string): Promise<{ size: number }>;
	writeFile(path: string, data: string, encoding: "utf8"): Promise<void>;
}

interface DenoLike {
	appendTextFile(path: string, data: string): Promise<void>;
	mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
	readTextFile(path: string): Promise<string>;
	remove(path: string): Promise<void>;
	rename(oldPath: string, newPath: string): Promise<void>;
	stat(path: string): Promise<{ size: number }>;
	writeTextFile(path: string, data: string): Promise<void>;
	errors?: {
		AlreadyExists?: new (...args: unknown[]) => Error;
		NotFound?: new (...args: unknown[]) => Error;
	};
}

interface FileRuntime {
	appendText(path: string, data: string): Promise<void>;
	mkdir(path: string): Promise<void>;
	readText(path: string): Promise<string>;
	remove(path: string): Promise<void>;
	rename(oldPath: string, newPath: string): Promise<void>;
	stat(path: string): Promise<{ size: number } | null>;
	writeText(path: string, data: string): Promise<void>;
}

type InternalTransport = Transport & {
	[TRANSPORT_META]?: TransportMeta;
};

const TRANSPORT_META = Symbol("lolger.transport-meta");

const LOG_LEVEL_NAMES: Record<LogLevel, LogLevelName> = {
	[LogLevel.DEBUG]: "DEBUG",
	[LogLevel.LOG]: "LOG",
	[LogLevel.INFO]: "INFO",
	[LogLevel.WARN]: "WARN",
	[LogLevel.ERROR]: "ERROR",
};

const DEFAULT_STDERR_LEVELS = new Set<LogLevel>([LogLevel.WARN, LogLevel.ERROR]);
const LEVEL_CHALK: Record<LogLevelName, ChalkType> = {
	DEBUG: chalk.magenta.bold,
	LOG: chalk.cyan.bold,
	INFO: chalk.blue.bold,
	WARN: chalk.yellow.bold,
	ERROR: chalk.red.bold,
};

const loggerState: {
	level: LogLevel;
	timestamp: TimestampFormat;
	format: LogFormat;
	baseFields?: Record<string, unknown>;
	transports: TransportState[];
} = {
	level: LogLevel.LOG,
	timestamp: "time",
	format: "pretty",
	baseFields: undefined,
	transports: [],
};

let nodeFsRuntimePromise: Promise<NodeFsRuntime> | null = null;

class Logger {
	public static namespaceColors: string[] = [
		"#D46A6A",
		"#6AD4A1",
		"#6A8ED4",
		"#D46ABF",
		"#D4A26A",
		"#6AD0D4",
		"#A16AD4",
		"#6AD49F",
		"#D46A94",
		"#6AABD4",
	];

	public static get level(): LogLevel {
		return loggerState.level;
	}

	public static set level(level: LogLevel) {
		loggerState.level = level;
	}

	private namespace: string;

	constructor(namespace: string) {
		this.namespace = namespace;
	}

	public debug = (...msgs: unknown[]) => {
		this.emit(LogLevel.DEBUG, msgs);
	};

	public log = (...msgs: unknown[]) => {
		this.emit(LogLevel.LOG, msgs);
	};

	public info = (...msgs: unknown[]) => {
		this.emit(LogLevel.INFO, msgs);
	};

	public warn = (...msgs: unknown[]) => {
		this.emit(LogLevel.WARN, msgs);
	};

	public error = (...msgs: unknown[]) => {
		this.emit(LogLevel.ERROR, msgs);
	};

	private emit(level: LogLevel, msgs: unknown[]) {
		if (loggerState.level > level) {
			return;
		}

		const record = createLogRecord(this.namespace, level, msgs);
		const states = loggerState.transports.slice();

		for (const state of states) {
			dispatchToTransport(state, record);
		}
	}
}

function configureLogger(options: ConfigureLoggerOptions): void {
	if (hasOwn(options, "level") && options.level !== undefined) {
		loggerState.level = options.level;
	}

	if (hasOwn(options, "timestamp") && options.timestamp !== undefined) {
		loggerState.timestamp = options.timestamp;
	}

	if (hasOwn(options, "format") && options.format !== undefined) {
		loggerState.format = options.format;
	}

	if (hasOwn(options, "baseFields")) {
		loggerState.baseFields = options.baseFields
			? { ...options.baseFields }
			: undefined;
	}

	if (hasOwn(options, "transports")) {
		const previousStates = loggerState.transports.slice();
		loggerState.transports = (options.transports ?? []).map(createTransportState);
		void closeTransportStates(previousStates);
	}
}

function getLogger(namespace: string): Logger {
	return new Logger(namespace);
}

function setLogLevel(level: LogLevel): void {
	loggerState.level = level;
}

async function flushLogger(): Promise<void> {
	const states = loggerState.transports.slice();

	await Promise.all(states.map(async (state) => {
		await state.pending;
		if (state.failed) {
			return;
		}

		if (state.transport.flush) {
			try {
				await state.transport.flush();
			} catch (error) {
				reportTransportFailure(state, error);
			}
		}
	}));
}

async function closeLogger(): Promise<void> {
	const states = loggerState.transports.slice();

	await Promise.all(states.map(async (state) => {
		await state.pending;

		if (!state.failed && state.transport.flush) {
			try {
				await state.transport.flush();
			} catch (error) {
				reportTransportFailure(state, error);
			}
		}

		if (state.transport.close) {
			try {
				await state.transport.close();
			} catch (error) {
				reportTransportFailure(state, error);
			}
		}
	}));
}

function consoleTransport(options: ConsoleTransportOptions = {}): Transport {
	const stderrLevels = new Set(options.stderrLevels ?? Array.from(DEFAULT_STDERR_LEVELS));
	const transport: InternalTransport = {
		name: "console",
		format: options.format,
		write(record: LogRecord, rendered: string) {
			const internalRecord = record as InternalLogRecord;
			const writer = getConsoleWriter(internalRecord.levelValue, stderrLevels);
			writer(rendered);
		},
	};

	transport[TRANSPORT_META] = {
		kind: "console",
		colors: options.colors ?? true,
		stderrLevels,
	};

	return transport;
}

function fileTransport(options: FileTransportOptions): Transport {
	validateFileTransportOptions(options);

	if (!hasDenoRuntime() && !hasNodeRuntime()) {
		throw new Error("fileTransport is only available in Node.js and Deno");
	}

	const runtimePromise = getFileRuntime();
	let prepared = false;

	const transport: InternalTransport = {
		name: `file:${options.path}`,
		format: options.format,
		async write(_record: LogRecord, rendered: string) {
			const runtime = await runtimePromise;
			await ensureParentDirectory(runtime);
			await writeWithRotation(runtime, options, rendered);
		},
	};

	transport[TRANSPORT_META] = {
		kind: "file",
		colors: false,
		stderrLevels: new Set(DEFAULT_STDERR_LEVELS),
	};

	return transport;

	async function ensureParentDirectory(runtime: FileRuntime): Promise<void> {
		if (prepared || options.mkdir === false) {
			return;
		}

		const directory = getDirectoryName(options.path);
		if (directory !== "." && directory !== "") {
			await runtime.mkdir(directory);
		}
		prepared = true;
	}
}

function createTransportState(transport: Transport): TransportState {
	const internalTransport = transport as InternalTransport;
	const meta = internalTransport[TRANSPORT_META] ?? {
		kind: "custom" as const,
		colors: false,
		stderrLevels: new Set(DEFAULT_STDERR_LEVELS),
	};

	return {
		transport: internalTransport,
		meta,
		pending: Promise.resolve(),
		failed: false,
		diagnosticEmitted: false,
	};
}

function dispatchToTransport(state: TransportState, record: InternalLogRecord): void {
	if (state.failed) {
		return;
	}

	const format = state.transport.format ?? loggerState.format;
	const rendered = renderRecord(record, format, state.meta);

	state.pending = state.pending
		.then(async () => {
			if (state.failed) {
				return;
			}

			await state.transport.write(record, rendered);

			if (state.meta.kind === "console" && format === "pretty") {
				emitNativeErrors(record.rawErrors);
			}
		})
		.catch((error) => {
			reportTransportFailure(state, error);
		});
}

function createLogRecord(namespace: string, level: LogLevel, msgs: unknown[]): InternalLogRecord {
	const rawErrors = msgs.filter((msg): msg is Error => msg instanceof Error);
	const normalizedFields = loggerState.baseFields
		? normalizeFields(loggerState.baseFields)
		: undefined;

	return {
		timestamp: formatTimestamp(new Date(), loggerState.timestamp),
		level: LOG_LEVEL_NAMES[level],
		levelValue: level,
		namespace,
		message: msgs.map(messagePart).join(" "),
		args: msgs.map((msg) => normalizeUnknown(msg)),
		fields: normalizedFields,
		errors: rawErrors.length > 0 ? rawErrors.map((error) => serializeError(error)) : undefined,
		rawErrors,
	};
}

function renderRecord(record: InternalLogRecord, format: LogFormat, meta: TransportMeta): string {
	switch (format) {
		case "json":
			return JSON.stringify(toStructuredPayload(record), null, 2);
		case "jsonl":
			return JSON.stringify(toStructuredPayload(record));
		case "logfmt":
			return renderLogfmt(record);
		case "pretty":
		default:
			return renderPretty(record, {
				colors: meta.colors,
				inlineErrors: meta.kind !== "console",
			});
	}
}

function toStructuredPayload(record: InternalLogRecord): LogRecord {
	const payload: LogRecord = {
		timestamp: record.timestamp,
		level: record.level,
		namespace: record.namespace,
		message: record.message,
		args: record.args,
	};

	if (record.fields && Object.keys(record.fields).length > 0) {
		payload.fields = record.fields;
	}

	if (record.errors && record.errors.length > 0) {
		payload.errors = record.errors;
	}

	return payload;
}

function renderPretty(
	record: InternalLogRecord,
	options: {
		colors: boolean;
		inlineErrors: boolean;
	},
): string {
	const levelStr = `${" ".repeat(Math.max(0, 5 - record.level.length))}[${record.level}]`;
	const namespaceText = `(${record.namespace})`;
	const base = [
		colorize(record.timestamp, chalk.gray, options.colors),
		colorize(levelStr, LEVEL_CHALK[record.level], options.colors),
		colorize(namespaceText, getNamespaceChalk(record.namespace), options.colors),
	]
		.filter((part) => part.length > 0)
		.join(" ");

	let output = record.message.length > 0 ? `${base} ${colorize(record.message, chalk.reset, options.colors)}` : base;

	if (options.inlineErrors && record.errors && record.errors.length > 0) {
		const errorPayload = record.errors.length === 1 ? record.errors[0] : record.errors;
		output = `${output}\n${JSON.stringify(errorPayload, null, 2)}`;
	}

	return output;
}

function renderLogfmt(record: InternalLogRecord): string {
	const parts = [
		logfmtPair("ts", record.timestamp),
		logfmtPair("level", record.level),
		logfmtPair("ns", record.namespace),
		logfmtPair("msg", record.message),
		logfmtPair("args", record.args),
	];

	if (record.fields) {
		for (const [key, value] of Object.entries(record.fields)) {
			parts.push(logfmtPair(sanitizeLogfmtKey(key), value));
		}
	}

	if (record.errors && record.errors.length > 0) {
		parts.push(logfmtPair("errors", record.errors));
	}

	return parts.join(" ");
}

function logfmtPair(key: string, value: unknown): string {
	const scalar = normalizeLogfmtValue(value);
	return `${key}=${encodeLogfmtValue(scalar)}`;
}

function normalizeLogfmtValue(value: unknown): string | number | boolean {
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return value;
	}

	if (value === null) {
		return "null";
	}

	return JSON.stringify(value);
}

function encodeLogfmtValue(value: string | number | boolean): string {
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}

	if (value.length === 0 || /[\s="\\]/.test(value)) {
		return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
	}

	return value;
}

function sanitizeLogfmtKey(key: string): string {
	const sanitized = key.replace(/[^A-Za-z0-9_.-]/g, "_");
	return sanitized.length > 0 ? sanitized : "field";
}

function messagePart(msg: unknown): string {
	if (typeof msg === "string") {
		return msg;
	}

	if (msg instanceof Error) {
		return msg.name;
	}

	if (typeof msg === "function") {
		return "function()";
	}

	if (typeof msg === "undefined") {
		return "undefined";
	}

	if (typeof msg === "bigint" || typeof msg === "symbol") {
		return String(msg);
	}

	const serialized = stringify(
		msg,
		(_key, value) => {
			if (value instanceof Error) {
				return value.name;
			}
			if (typeof value === "function") {
				return "function()";
			}
			if (typeof value === "undefined") {
				return "undefined";
			}
			if (typeof value === "bigint" || typeof value === "symbol") {
				return String(value);
			}
			return value;
		},
		2,
	);

	return typeof serialized === "string" ? serialized : String(msg);
}

function normalizeFields(fields: Record<string, unknown>): Record<string, unknown> {
	const normalized: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(fields)) {
		normalized[key] = normalizeUnknown(value);
	}

	return normalized;
}

function normalizeUnknown(value: unknown, seen = new WeakSet<object>()): unknown {
	if (value === null) {
		return null;
	}

	switch (typeof value) {
		case "string":
		case "number":
		case "boolean":
			return value;
		case "undefined":
			return "undefined";
		case "bigint":
		case "symbol":
			return String(value);
		case "function":
			return "function()";
		case "object":
			break;
		default:
			return String(value);
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (value instanceof Error) {
		return serializeError(value, seen);
	}

	if (Array.isArray(value)) {
		if (seen.has(value)) {
			return "[Circular ~]";
		}

		seen.add(value);
		const normalizedArray = value.map((item) => normalizeUnknown(item, seen));
		seen.delete(value);
		return normalizedArray;
	}

	if (seen.has(value)) {
		return "[Circular ~]";
	}

	seen.add(value);
	const normalizedObject: Record<string, unknown> = {};

	for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
		normalizedObject[key] = normalizeUnknown(entryValue, seen);
	}

	seen.delete(value);
	return normalizedObject;
}

function serializeError(error: Error, seen = new WeakSet<object>()): SerializedError {
	if (seen.has(error)) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
		};
	}

	seen.add(error);

	const serialized: SerializedError = {
		name: error.name,
		message: error.message,
		stack: error.stack,
	};
	const errorRecord = error as unknown as Record<string, unknown>;

	for (const key of Object.getOwnPropertyNames(error)) {
		if (key === "name" || key === "message" || key === "stack") {
			continue;
		}

		serialized[key] = normalizeUnknown(
			errorRecord[key],
			seen,
		);
	}

	for (const key of Object.keys(error)) {
		if (!(key in serialized)) {
			serialized[key] = normalizeUnknown(
				errorRecord[key],
				seen,
			);
		}
	}

	seen.delete(error);
	return serialized;
}

function formatTimestamp(date: Date, format: TimestampFormat): string {
	return format === "iso" ? date.toISOString() : date.toTimeString().slice(0, 8);
}

function colorize(text: string, styler: ChalkType, enabled: boolean): string {
	return enabled ? styler(text) : text;
}

function getNamespaceChalk(namespace: string): ChalkType {
	const colors = Logger.namespaceColors;
	if (colors.length === 0) {
		return chalk.white;
	}

	const hash = Array.from(namespace).reduce((total, char) => total + char.charCodeAt(0), 0);
	const index = hash % colors.length;
	return chalk.hex(colors[index]);
}

function getConsoleWriter(level: LogLevel, stderrLevels: Set<LogLevel>): (message: string) => void {
	const safeConsole = getSafeConsole();

	if (level === LogLevel.ERROR) {
		return bindConsoleMethod(safeConsole.error ?? safeConsole.log);
	}

	if (level === LogLevel.WARN) {
		return bindConsoleMethod(safeConsole.warn ?? safeConsole.error ?? safeConsole.log);
	}

	if (stderrLevels.has(level)) {
		return bindConsoleMethod(safeConsole.error ?? safeConsole.log);
	}

	if (level === LogLevel.DEBUG) {
		return bindConsoleMethod(safeConsole.debug ?? safeConsole.log);
	}

	if (level === LogLevel.INFO) {
		return bindConsoleMethod(safeConsole.info ?? safeConsole.log);
	}

	return bindConsoleMethod(safeConsole.log);
}

function emitNativeErrors(errors: Error[]): void {
	if (errors.length === 0) {
		return;
	}

	const safeConsole = getSafeConsole();
	const log = bindConsoleMethod(safeConsole.log);

	for (const error of errors) {
		log(error);
	}
}

function bindConsoleMethod(method: ((...args: unknown[]) => void) | undefined): (message: string | Error) => void {
	if (!method) {
		return () => undefined;
	}

	return method.bind(console) as (message: string | Error) => void;
}

function getSafeConsole(): Console {
	return console;
}

function reportTransportFailure(state: TransportState, error: unknown): void {
	state.failed = true;

	if (state.diagnosticEmitted) {
		return;
	}

	state.diagnosticEmitted = true;

	const safeConsole = getSafeConsole();
	const errorWriter = safeConsole.error ?? safeConsole.log;
	errorWriter.call(safeConsole, `[lolger] transport "${state.transport.name}" failed`, error);
}

async function closeTransportStates(states: TransportState[]): Promise<void> {
	await Promise.all(states.map(async (state) => {
		await state.pending;

		if (!state.failed && state.transport.flush) {
			try {
				await state.transport.flush();
			} catch (error) {
				reportTransportFailure(state, error);
			}
		}

		if (state.transport.close) {
			try {
				await state.transport.close();
			} catch (error) {
				reportTransportFailure(state, error);
			}
		}
	}));
}

async function writeWithRotation(
	runtime: FileRuntime,
	options: FileTransportOptions,
	rendered: string,
): Promise<void> {
	const entry = ensureTrailingNewline(rendered);
	const rotation = options.rotate;

	if (!rotation) {
		await runtime.appendText(options.path, entry);
		return;
	}

	const currentStat = await runtime.stat(options.path);
	const entrySize = getByteLength(entry);
	const currentSize = currentStat?.size ?? 0;

	if (rotation.maxFiles === 1) {
		await writeSingleFileRetention(runtime, options.path, entry, entrySize, rotation.maxBytes, options.format ?? loggerState.format);
		return;
	}

	if (currentSize > 0 && currentSize + entrySize > rotation.maxBytes) {
		await rotateFiles(runtime, options.path, rotation.maxFiles);
	}

	await runtime.appendText(options.path, entry);
}

async function writeSingleFileRetention(
	runtime: FileRuntime,
	path: string,
	entry: string,
	entrySize: number,
	maxBytes: number,
	format: LogFormat,
): Promise<void> {
	if (entrySize > maxBytes) {
		await runtime.writeText(path, entry);
		return;
	}

	const currentText = await runtime.readText(path).catch(() => "");
	const currentSize = getByteLength(currentText);

	if (currentSize + entrySize <= maxBytes) {
		await runtime.appendText(path, entry);
		return;
	}

	if (!isLineOriented(format)) {
		await runtime.writeText(path, entry);
		return;
	}

	const lines = currentText.length > 0
		? currentText.replace(/\n+$/u, "").split("\n").filter((line) => line.length > 0)
		: [];

	let nextText = entry;

	for (let start = 0; start <= lines.length; start += 1) {
		const preserved = lines.slice(start);
		const candidate = preserved.length > 0
			? `${preserved.join("\n")}\n${entry}`
			: entry;

		if (getByteLength(candidate) <= maxBytes) {
			nextText = candidate;
			break;
		}
	}

	await runtime.writeText(path, nextText);
}

async function rotateFiles(runtime: FileRuntime, path: string, maxFiles: number): Promise<void> {
	for (let index = maxFiles - 2; index >= 1; index -= 1) {
		const source = `${path}.${index}`;
		const target = `${path}.${index + 1}`;

		await runtime.remove(target);

		const sourceStat = await runtime.stat(source);
		if (sourceStat) {
			await runtime.rename(source, target);
		}
	}

	const firstArchive = `${path}.1`;
	await runtime.remove(firstArchive);

	const currentStat = await runtime.stat(path);
	if (currentStat) {
		await runtime.rename(path, firstArchive);
	}
}

function validateFileTransportOptions(options: FileTransportOptions): void {
	if (options.path.trim().length === 0) {
		throw new Error("fileTransport path must not be empty");
	}

	if (!options.rotate) {
		return;
	}

	if (!Number.isFinite(options.rotate.maxBytes) || options.rotate.maxBytes <= 0) {
		throw new Error("fileTransport rotate.maxBytes must be a positive number");
	}

	if (!Number.isInteger(options.rotate.maxFiles) || options.rotate.maxFiles <= 0) {
		throw new Error("fileTransport rotate.maxFiles must be a positive integer");
	}
}

function isLineOriented(format: LogFormat): boolean {
	return format === "jsonl" || format === "logfmt";
}

function ensureTrailingNewline(text: string): string {
	return text.endsWith("\n") ? text : `${text}\n`;
}

function getByteLength(text: string): number {
	return new TextEncoder().encode(text).length;
}

function getDirectoryName(path: string): string {
	const normalized = path.replace(/\\/g, "/");
	const lastSlash = normalized.lastIndexOf("/");

	if (lastSlash < 0) {
		return ".";
	}

	if (lastSlash === 0) {
		return "/";
	}

	return normalized.slice(0, lastSlash);
}

async function getFileRuntime(): Promise<FileRuntime> {
	if (hasDenoRuntime()) {
		return createDenoFileRuntime();
	}

	return createNodeFileRuntime();
}

function hasNodeRuntime(): boolean {
	const globalObject = globalThis as typeof globalThis & {
		process?: {
			versions?: {
				node?: string;
			};
		};
	};

	return typeof globalObject.process?.versions?.node === "string";
}

function hasDenoRuntime(): boolean {
	const globalObject = globalThis as typeof globalThis & {
		Deno?: DenoLike;
	};

	return typeof globalObject.Deno?.writeTextFile === "function";
}

function createDenoFileRuntime(): FileRuntime {
	const globalObject = globalThis as typeof globalThis & {
		Deno?: DenoLike;
	};

	const deno = globalObject.Deno;
	if (!deno) {
		throw new Error("Deno runtime is not available");
	}

	return {
		appendText(path: string, data: string) {
			return deno.appendTextFile(path, data);
		},
		async mkdir(path: string) {
			try {
				await deno.mkdir(path, { recursive: true });
			} catch (error) {
				if (!isDenoAlreadyExistsError(deno, error)) {
					throw error;
				}
			}
		},
		readText(path: string) {
			return deno.readTextFile(path);
		},
		async remove(path: string) {
			try {
				await deno.remove(path);
			} catch (error) {
				if (!isDenoNotFoundError(deno, error)) {
					throw error;
				}
			}
		},
		rename(oldPath: string, newPath: string) {
			return deno.rename(oldPath, newPath);
		},
		async stat(path: string) {
			try {
				const stat = await deno.stat(path);
				return { size: stat.size };
			} catch (error) {
				if (isDenoNotFoundError(deno, error)) {
					return null;
				}
				throw error;
			}
		},
		writeText(path: string, data: string) {
			return deno.writeTextFile(path, data);
		},
	};
}

async function createNodeFileRuntime(): Promise<FileRuntime> {
	const fs = await loadNodeFsRuntime();

	return {
		appendText(path: string, data: string) {
			return fs.appendFile(path, data, "utf8");
		},
		mkdir(path: string) {
			return fs.mkdir(path, { recursive: true });
		},
		readText(path: string) {
			return fs.readFile(path, "utf8");
		},
		remove(path: string) {
			return fs.rm(path, { force: true });
		},
		rename(oldPath: string, newPath: string) {
			return fs.rename(oldPath, newPath);
		},
		async stat(path: string) {
			try {
				const stat = await fs.stat(path);
				return { size: stat.size };
			} catch (error) {
				if (isNodeNotFoundError(error)) {
					return null;
				}
				throw error;
			}
		},
		writeText(path: string, data: string) {
			return fs.writeFile(path, data, "utf8");
		},
	};
}

async function loadNodeFsRuntime(): Promise<NodeFsRuntime> {
	if (!nodeFsRuntimePromise) {
		nodeFsRuntimePromise = importModule("node:fs/promises") as Promise<NodeFsRuntime>;
	}

	return nodeFsRuntimePromise;
}

function importModule(specifier: string): Promise<unknown> {
	return import(specifier);
}

function isNodeNotFoundError(error: unknown): boolean {
	return typeof error === "object"
		&& error !== null
		&& "code" in error
		&& (error as { code?: string }).code === "ENOENT";
}

function isDenoAlreadyExistsError(deno: DenoLike, error: unknown): boolean {
	return error instanceof (deno.errors?.AlreadyExists ?? Error);
}

function isDenoNotFoundError(deno: DenoLike, error: unknown): boolean {
	return error instanceof (deno.errors?.NotFound ?? Error);
}

function hasOwn<T extends object>(value: T, key: PropertyKey): boolean {
	return Object.prototype.hasOwnProperty.call(value, key);
}

loggerState.transports = [createTransportState(consoleTransport())];

export {
	Logger,
	LogLevel,
	closeLogger,
	configureLogger,
	consoleTransport,
	fileTransport,
	flushLogger,
	getLogger,
	setLogLevel,
};

export type {
	ConfigureLoggerOptions,
	ConsoleTransportOptions,
	FileTransportOptions,
	LogFormat,
	LogRecord,
	RotationOptions,
	SerializedError,
	TimestampFormat,
	Transport,
};
