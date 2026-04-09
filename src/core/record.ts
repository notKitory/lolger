// SPDX-License-Identifier: Apache-2.0

import { LogLevel, type LogRecord } from "../types.js";
import { formatTimestamp } from "../utils/time.js";
import { messagePart, normalizeFields, normalizeUnknown, serializeError } from "../utils/value.js";
import { LOG_LEVEL_NAMES } from "./constants.js";
import type { InternalLogRecord } from "./internal.js";
import type { LoggerState } from "./state.js";

/**
 * Creates a normalized internal record that can be rendered by any transport.
 */
export function createLogRecord(
	state: LoggerState,
	namespace: string,
	level: LogLevel,
	msgs: unknown[],
): InternalLogRecord {
	const rawErrors = msgs.filter((msg): msg is Error => msg instanceof Error);
	const normalizedFields = state.baseFields
		? normalizeFields(state.baseFields)
		: undefined;

	return {
		timestamp: formatTimestamp(new Date(), state.timestamp),
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

/**
 * Produces the structured payload shared by `json`, `jsonl` and `logfmt`.
 */
export function toStructuredPayload(record: InternalLogRecord): LogRecord {
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
