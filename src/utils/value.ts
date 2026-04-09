// SPDX-License-Identifier: Apache-2.0

import stringify from "json-stringify-safe";

import type { SerializedError } from "../types.js";

/**
 * Builds a readable string representation for a function, including its kind,
 * resolved name and arity.
 */

// biome-ignore lint/complexity/noBannedTypes: bcs it is a logger
export function describeFunction(fn: Function): string {
	const kind = getFunctionKind(fn);
	const name =
		typeof fn.name === "string" && fn.name.length > 0 ? fn.name : "anonymous";

	return `[${kind}: ${name}/${fn.length}]`;
}

/**
 * Converts a value into the human-facing message fragment used by `pretty`
 * output and the top-level record `message`.
 */
export function messagePart(msg: unknown): string {
	if (typeof msg === "string") {
		return msg;
	}

	if (msg instanceof Error) {
		return msg.name;
	}

	if (typeof msg === "function") {
		return describeFunction(msg);
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
				return describeFunction(value);
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

/**
 * Normalizes a free-form field bag so structured formats can serialize it
 * without special cases.
 */
export function normalizeFields(
	fields: Record<string, unknown>,
): Record<string, unknown> {
	const normalized: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(fields)) {
		normalized[key] = normalizeUnknown(value);
	}

	return normalized;
}

/**
 * Converts unknown user input into a structured-safe value.
 */
export function normalizeUnknown(
	value: unknown,
	seen = new WeakSet<object>(),
): unknown {
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
			return describeFunction(value);
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

	for (const [key, entryValue] of Object.entries(
		value as Record<string, unknown>,
	)) {
		normalizedObject[key] = normalizeUnknown(entryValue, seen);
	}

	seen.delete(value);
	return normalizedObject;
}

/**
 * Serializes an error into a single structured payload while preserving the
 * standard fields and custom enumerable properties.
 */
export function serializeError(
	error: Error,
	seen = new WeakSet<object>(),
): SerializedError {
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

		serialized[key] = normalizeUnknown(errorRecord[key], seen);
	}

	for (const key of Object.keys(error)) {
		if (!(key in serialized)) {
			serialized[key] = normalizeUnknown(errorRecord[key], seen);
		}
	}

	seen.delete(error);
	return serialized;
}

// biome-ignore lint/complexity/noBannedTypes: bcs it is a logger
function getFunctionKind(fn: Function): string {
	const constructorName = fn.constructor?.name;

	switch (constructorName) {
		case "AsyncFunction":
		case "GeneratorFunction":
		case "AsyncGeneratorFunction":
			return constructorName;
		default:
			return "Function";
	}
}
