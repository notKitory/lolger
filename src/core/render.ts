// SPDX-License-Identifier: Apache-2.0

import chalk from "chalk";

import type { LogFormat } from "../types.js";
import { type ChalkType, LEVEL_CHALK, namespaceColors } from "./constants.js";
import type { InternalLogRecord, TransportMeta } from "./internal.js";
import { toStructuredPayload } from "./record.js";

/**
 * Renders an internal record into the format requested by a transport.
 */
export function renderRecord(
	record: InternalLogRecord,
	format: LogFormat,
	meta: TransportMeta,
): string {
	switch (format) {
		case "json":
			return JSON.stringify(toStructuredPayload(record), null, 2);
		case "jsonl":
			return JSON.stringify(toStructuredPayload(record));
		case "logfmt":
			return renderLogfmt(record);
		default:
			return renderPretty(record, {
				colors: meta.colors,
				inlineErrors: meta.kind !== "console",
			});
	}
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
		colorize(
			namespaceText,
			getNamespaceChalk(record.namespace),
			options.colors,
		),
	]
		.filter((part) => part.length > 0)
		.join(" ");

	let output =
		record.message.length > 0
			? `${base} ${colorize(record.message, chalk.reset, options.colors)}`
			: base;

	if (options.inlineErrors && record.errors && record.errors.length > 0) {
		const errorPayload =
			record.errors.length === 1 ? record.errors[0] : record.errors;
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
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
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
		return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
	}

	return value;
}

function sanitizeLogfmtKey(key: string): string {
	const sanitized = key.replace(/[^A-Za-z0-9_.-]/g, "_");
	return sanitized.length > 0 ? sanitized : "field";
}

function colorize(text: string, styler: ChalkType, enabled: boolean): string {
	return enabled ? styler(text) : text;
}

function getNamespaceChalk(namespace: string): ChalkType {
	if (namespaceColors.length === 0) {
		return chalk.white;
	}

	const hash = Array.from(namespace).reduce(
		(total, char) => total + char.charCodeAt(0),
		0,
	);
	const index = hash % namespaceColors.length;
	return chalk.hex(namespaceColors[index]);
}
