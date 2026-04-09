// SPDX-License-Identifier: Apache-2.0

import type { InternalTransport } from "../core/internal.js";
import { SET_ACTIVE_FORMAT, TRANSPORT_META } from "../core/internal.js";
import type { FileRuntime } from "../runtime/file-runtime.js";
import {
	getDirectoryName,
	getFileRuntime,
	hasDenoRuntime,
	hasNodeRuntime,
} from "../runtime/file-runtime.js";
import type {
	FileTransportOptions,
	LogFormat,
	LogRecord,
	RotationOptions,
	Transport,
} from "../types.js";
import { ensureTrailingNewline, getByteLength } from "../utils/text.js";

/**
 * Creates a file transport for Node.js and Deno with append mode and optional
 * size-based rotation.
 */
export function fileTransport(options: FileTransportOptions): Transport {
	validateFileTransportOptions(options);

	if (!hasDenoRuntime() && !hasNodeRuntime()) {
		throw new Error("fileTransport is only available in Node.js and Deno");
	}

	const runtimePromise = getFileRuntime();
	let prepared = false;
	let activeFormat = options.format ?? "pretty";

	const transport: InternalTransport = {
		name: `file:${options.path}`,
		format: options.format,
		async write(_record: LogRecord, rendered: string) {
			const runtime = await runtimePromise;
			await ensureParentDirectory(runtime);
			await writeWithRotation(
				runtime,
				options.path,
				rendered,
				options.rotate,
				activeFormat,
			);
		},
	};

	transport[TRANSPORT_META] = {
		kind: "file",
		colors: false,
		stderrLevels: new Set(),
	};
	transport[SET_ACTIVE_FORMAT] = (format) => {
		activeFormat = format;
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

async function writeWithRotation(
	runtime: FileRuntime,
	path: string,
	rendered: string,
	rotation: RotationOptions | undefined,
	format: LogFormat,
): Promise<void> {
	const entry = ensureTrailingNewline(rendered);

	if (!rotation) {
		await runtime.appendText(path, entry);
		return;
	}

	const currentStat = await runtime.stat(path);
	const entrySize = getByteLength(entry);
	const currentSize = currentStat?.size ?? 0;

	if (rotation.maxFiles === 1) {
		await writeSingleFileRetention(
			runtime,
			path,
			entry,
			entrySize,
			rotation.maxBytes,
			format,
		);
		return;
	}

	if (currentSize > 0 && currentSize + entrySize > rotation.maxBytes) {
		await rotateFiles(runtime, path, rotation.maxFiles);
	}

	await runtime.appendText(path, entry);
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

	const lines =
		currentText.length > 0
			? currentText
					.replace(/\n+$/u, "")
					.split("\n")
					.filter((line) => line.length > 0)
			: [];

	let nextText = entry;

	for (let start = 0; start <= lines.length; start += 1) {
		const preserved = lines.slice(start);
		const candidate =
			preserved.length > 0 ? `${preserved.join("\n")}\n${entry}` : entry;

		if (getByteLength(candidate) <= maxBytes) {
			nextText = candidate;
			break;
		}
	}

	await runtime.writeText(path, nextText);
}

async function rotateFiles(
	runtime: FileRuntime,
	path: string,
	maxFiles: number,
): Promise<void> {
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

	if (
		!Number.isFinite(options.rotate.maxBytes) ||
		options.rotate.maxBytes <= 0
	) {
		throw new Error("fileTransport rotate.maxBytes must be a positive number");
	}

	if (
		!Number.isInteger(options.rotate.maxFiles) ||
		options.rotate.maxFiles <= 0
	) {
		throw new Error("fileTransport rotate.maxFiles must be a positive integer");
	}
}

function isLineOriented(format: LogFormat): boolean {
	return format === "jsonl" || format === "logfmt";
}
