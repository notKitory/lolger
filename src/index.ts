// SPDX-License-Identifier: Apache-2.0

import { Lolger } from "./lolger.js";
import type { ConfigureLoggerOptions, LogLevel } from "./types.js";

/**
 * Global singleton `Lolger` instance used by the convenience exports.
 */
const lolger = new Lolger();

/**
 * Updates the configuration of the global `lolger` instance.
 */
function configureLogger(options: ConfigureLoggerOptions): void {
	lolger.configureLogger(options);
}

/**
 * Creates a namespaced logger from the global `lolger` instance.
 */
function getLogger(namespace: string) {
	return lolger.getLogger(namespace);
}

/**
 * Updates only the log level of the global `lolger` instance.
 */
function setLogLevel(level: LogLevel): void {
	lolger.setLogLevel(level);
}

/**
 * Flushes all pending writes for the global `lolger` instance.
 */
function flushLogger(): Promise<void> {
	return lolger.flushLogger();
}

/**
 * Flushes and closes all transports for the global `lolger` instance.
 */
function closeLogger(): Promise<void> {
	return lolger.closeLogger();
}

export { Logger } from "./logger.js";
export { Lolger } from "./lolger.js";
export { consoleTransport } from "./transports/console.js";
export { fileTransport } from "./transports/file.js";
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
} from "./types.js";
export { LogLevel } from "./types.js";
export {
	closeLogger,
	configureLogger,
	flushLogger,
	getLogger,
	lolger,
	setLogLevel,
};
