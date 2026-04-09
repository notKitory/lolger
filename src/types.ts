// SPDX-License-Identifier: Apache-2.0

/**
 * Logging levels ordered from the most verbose to the most severe.
 */
enum LogLevel {
	DEBUG = 0,
	LOG = 1,
	INFO = 2,
	WARN = 3,
	ERROR = 4,
}

/**
 * String form of a {@link LogLevel} that is written into rendered records.
 */
type LogLevelName = "DEBUG" | "LOG" | "INFO" | "WARN" | "ERROR";

/**
 * Supported output formats for transports.
 */
type LogFormat = "pretty" | "json" | "jsonl" | "logfmt";

/**
 * Timestamp rendering modes used when records are created.
 */
type TimestampFormat = "time" | "iso";

/**
 * Structured error payload used by non-console outputs.
 */
interface SerializedError {
	name: string;
	message: string;
	stack?: string;
	[key: string]: unknown;
}

/**
 * Normalized log record shared across all structured formats and transports.
 */
interface LogRecord {
	timestamp: string;
	level: LogLevelName;
	namespace: string;
	message: string;
	args: unknown[];
	fields?: Record<string, unknown>;
	errors?: SerializedError[];
}

/**
 * Transport contract used by `lolger` to write rendered records.
 */
interface Transport {
	name: string;
	format?: LogFormat;
	write(record: LogRecord, rendered: string): void | Promise<void>;
	flush?(): Promise<void>;
	close?(): Promise<void>;
}

/**
 * Global logger configuration applied to all logger instances.
 */
interface ConfigureLoggerOptions {
	level?: LogLevel;
	timestamp?: TimestampFormat;
	baseFields?: Record<string, unknown>;
	format?: LogFormat;
	transports?: Transport[];
}

/**
 * Options for the built-in console transport.
 */
interface ConsoleTransportOptions {
	format?: LogFormat;
	colors?: boolean;
	stderrLevels?: LogLevel[];
}

/**
 * Rotation policy for file transports.
 */
interface RotationOptions {
	maxBytes: number;
	maxFiles: number;
}

/**
 * Options for the built-in file transport.
 */
interface FileTransportOptions {
	path: string;
	format?: LogFormat;
	rotate?: RotationOptions;
	mkdir?: boolean;
}

export type {
	ConfigureLoggerOptions,
	ConsoleTransportOptions,
	FileTransportOptions,
	LogFormat,
	LogLevelName,
	LogRecord,
	RotationOptions,
	SerializedError,
	TimestampFormat,
	Transport,
};
export { LogLevel };
