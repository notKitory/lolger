// SPDX-License-Identifier: Apache-2.0

import { LogLevel, type ConfigureLoggerOptions } from "./types.js";
import { closeState, configureState, dispatchLog, flushState, installDefaultTransports, setStateLogLevel } from "./core/service.js";
import { createLoggerState, type LoggerState } from "./core/state.js";
import { Logger } from "./logger.js";

/**
 * Owns a full logging pipeline, including configuration, transports and the
 * loggers created from it.
 */
class Lolger {
	private state: LoggerState;

	/**
	 * Creates a `Lolger` instance with the default console transport installed.
	 */
	constructor(options?: ConfigureLoggerOptions) {
		this.state = createLoggerState();
		installDefaultTransports(this.state);

		if (options) {
			this.configureLogger(options);
		}
	}

	/**
	 * Returns the current log level threshold for this instance.
	 */
	public get level(): LogLevel {
		return this.state.level;
	}

	/**
	 * Updates the current log level threshold for this instance.
	 */
	public set level(level: LogLevel) {
		this.state.level = level;
	}

	/**
	 * Updates the logger configuration for this instance.
	 */
	public configureLogger = (options: ConfigureLoggerOptions): void => {
		configureState(this.state, options);
	};

	/**
	 * Creates a namespaced logger bound to this `Lolger` instance.
	 */
	public getLogger = (namespace: string): Logger => {
		return new Logger(namespace, this.emit);
	};

	/**
	 * Changes only the level threshold for this instance.
	 */
	public setLogLevel = (level: LogLevel): void => {
		setStateLogLevel(this.state, level);
	};

	/**
	 * Waits until pending async writes complete for this instance.
	 */
	public flushLogger = (): Promise<void> => {
		return flushState(this.state);
	};

	/**
	 * Flushes and closes transports owned by this instance.
	 */
	public closeLogger = (): Promise<void> => {
		return closeState(this.state);
	};

	private emit = (namespace: string, level: LogLevel, msgs: unknown[]): void => {
		dispatchLog(this.state, namespace, level, msgs);
	};
}

export { Lolger };
