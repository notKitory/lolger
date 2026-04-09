// SPDX-License-Identifier: Apache-2.0

import { LogLevel } from "./types.js";
import { namespaceColors } from "./core/constants.js";

type EmitFn = (namespace: string, level: LogLevel, msgs: unknown[]) => void;

/**
 * A lightweight namespaced logger that forwards records into the global
 * transport pipeline of its owning `Lolger` instance.
 */
class Logger {
	public static namespaceColors = namespaceColors;

	private namespace: string;
	private emitRecord: EmitFn;

	/**
	 * Creates a logger bound to a namespace.
	 */
	constructor(namespace: string, emitRecord: EmitFn) {
		this.namespace = namespace;
		this.emitRecord = emitRecord;
	}

	/**
	 * Emits a `DEBUG` record.
	 */
	public debug = (...msgs: unknown[]) => {
		this.emitRecord(this.namespace, LogLevel.DEBUG, msgs);
	};

	/**
	 * Emits a `LOG` record.
	 */
	public log = (...msgs: unknown[]) => {
		this.emitRecord(this.namespace, LogLevel.LOG, msgs);
	};

	/**
	 * Emits an `INFO` record.
	 */
	public info = (...msgs: unknown[]) => {
		this.emitRecord(this.namespace, LogLevel.INFO, msgs);
	};

	/**
	 * Emits a `WARN` record.
	 */
	public warn = (...msgs: unknown[]) => {
		this.emitRecord(this.namespace, LogLevel.WARN, msgs);
	};

	/**
	 * Emits an `ERROR` record.
	 */
	public error = (...msgs: unknown[]) => {
		this.emitRecord(this.namespace, LogLevel.ERROR, msgs);
	};
}

export { Logger };
