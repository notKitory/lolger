// SPDX-License-Identifier: Apache-2.0

import { type LogFormat, LogLevel, type TimestampFormat } from "../types.js";
import type { TransportState } from "./internal.js";

export interface LoggerState {
	level: LogLevel;
	timestamp: TimestampFormat;
	format: LogFormat;
	baseFields?: Record<string, unknown>;
	transports: TransportState[];
}

export function createLoggerState(): LoggerState {
	return {
		level: LogLevel.LOG,
		timestamp: "time",
		format: "pretty",
		baseFields: undefined,
		transports: [],
	};
}
