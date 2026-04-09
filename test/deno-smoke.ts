import { fileTransport, LogLevel, Lolger } from "../dist/index.js";

const tempDirectory = await Deno.makeTempDir({ prefix: "lolger-deno-smoke-" });
const logPath = `${tempDirectory}/app.log`;

try {
	const lolger = new Lolger({
		level: LogLevel.DEBUG,
		timestamp: "iso",
		transports: [
			fileTransport({
				path: logPath,
				format: "jsonl",
				rotate: {
					maxBytes: 1024 * 1024,
					maxFiles: 2,
				},
			}),
		],
	});

	lolger.getLogger("deno-smoke").info("Deno works", { ok: true });
	await lolger.flushLogger();

	const stored = await Deno.readTextFile(logPath);
	const payload = JSON.parse(stored.trim());

	assert(payload.level === "INFO", "Expected INFO level in Deno smoke output");
	assert(
		payload.namespace === "deno-smoke",
		"Expected namespace in Deno smoke output",
	);
	assert(
		payload.message === 'Deno works {\n  "ok": true\n}',
		"Expected pretty message payload",
	);
	assert(
		payload.args[1]?.ok === true,
		"Expected structured args in Deno smoke output",
	);

	await lolger.closeLogger();
} finally {
	await Deno.remove(tempDirectory, { recursive: true });
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}
