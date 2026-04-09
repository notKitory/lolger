// SPDX-License-Identifier: Apache-2.0

import { LogLevel, type ConfigureLoggerOptions, type Transport } from "../types.js";
import { consoleTransport } from "../transports/console.js";
import { emitNativeErrors, reportTransportFailure } from "../utils/console.js";
import { createLogRecord } from "./record.js";
import { renderRecord } from "./render.js";
import type { InternalLogRecord, InternalTransport, TransportState } from "./internal.js";
import { SET_ACTIVE_FORMAT, TRANSPORT_META } from "./internal.js";
import type { LoggerState } from "./state.js";

/**
 * Installs the default pretty console transport for a `Lolger` instance.
 */
export function installDefaultTransports(state: LoggerState): void {
	if (state.transports.length > 0) {
		return;
	}

	state.transports = [createTransportState(consoleTransport())];
}

/**
 * Applies configuration updates to a specific `Lolger` instance.
 */
export function configureState(state: LoggerState, options: ConfigureLoggerOptions): void {
	if (hasOwn(options, "level") && options.level !== undefined) {
		state.level = options.level;
	}

	if (hasOwn(options, "timestamp") && options.timestamp !== undefined) {
		state.timestamp = options.timestamp;
	}

	if (hasOwn(options, "format") && options.format !== undefined) {
		state.format = options.format;
	}

	if (hasOwn(options, "baseFields")) {
		state.baseFields = options.baseFields
			? { ...options.baseFields }
			: undefined;
	}

	if (hasOwn(options, "transports")) {
		const previousStates = state.transports.slice();
		state.transports = (options.transports ?? []).map(createTransportState);
		void closeTransportStates(previousStates);
	}
}

/**
 * Updates the level threshold for a specific `Lolger` instance.
 */
export function setStateLogLevel(state: LoggerState, level: LogLevel): void {
	state.level = level;
}

/**
 * Flushes all active transports for a specific `Lolger` instance.
 */
export async function flushState(state: LoggerState): Promise<void> {
	const states = state.transports.slice();

	await Promise.all(states.map(async (transportState) => {
		await transportState.pending;
		if (transportState.failed) {
			return;
		}

		if (transportState.transport.flush) {
			try {
				await transportState.transport.flush();
			} catch (error) {
				reportTransportFailure(transportState, error);
			}
		}
	}));
}

/**
 * Flushes and closes all active transports for a specific `Lolger` instance.
 */
export async function closeState(state: LoggerState): Promise<void> {
	const states = state.transports.slice();

	await Promise.all(states.map(async (transportState) => {
		await transportState.pending;

		if (!transportState.failed && transportState.transport.flush) {
			try {
				await transportState.transport.flush();
			} catch (error) {
				reportTransportFailure(transportState, error);
			}
		}

		if (transportState.transport.close) {
			try {
				await transportState.transport.close();
			} catch (error) {
				reportTransportFailure(transportState, error);
			}
		}
	}));
}

/**
 * Dispatches a log event through a specific `Lolger` instance.
 */
export function dispatchLog(
	state: LoggerState,
	namespace: string,
	level: LogLevel,
	msgs: unknown[],
): void {
	if (state.level > level) {
		return;
	}

	const record = createLogRecord(state, namespace, level, msgs);
	const states = state.transports.slice();

	for (const transportState of states) {
		dispatchToTransport(state, transportState, record);
	}
}

function createTransportState(transport: Transport): TransportState {
	const internalTransport = transport as InternalTransport;
	const meta = internalTransport[TRANSPORT_META] ?? {
		kind: "custom" as const,
		colors: false,
		stderrLevels: new Set<LogLevel>(),
	};

	return {
		transport: internalTransport,
		meta,
		pending: Promise.resolve(),
		failed: false,
		diagnosticEmitted: false,
	};
}

function dispatchToTransport(
	state: LoggerState,
	transportState: TransportState,
	record: InternalLogRecord,
): void {
	if (transportState.failed) {
		return;
	}

	const format = transportState.transport.format ?? state.format;
	const rendered = renderRecord(record, format, transportState.meta);

	transportState.pending = transportState.pending
		.then(async () => {
			if (transportState.failed) {
				return;
			}

			transportState.transport[SET_ACTIVE_FORMAT]?.(format);
			await transportState.transport.write(record, rendered);

			if (transportState.meta.kind === "console" && format === "pretty") {
				emitNativeErrors(record.rawErrors);
			}
		})
		.catch((error) => {
			reportTransportFailure(transportState, error);
		});
}

async function closeTransportStates(states: TransportState[]): Promise<void> {
	await Promise.all(states.map(async (transportState) => {
		await transportState.pending;

		if (!transportState.failed && transportState.transport.flush) {
			try {
				await transportState.transport.flush();
			} catch (error) {
				reportTransportFailure(transportState, error);
			}
		}

		if (transportState.transport.close) {
			try {
				await transportState.transport.close();
			} catch (error) {
				reportTransportFailure(transportState, error);
			}
		}
	}));
}

function hasOwn<T extends object>(value: T, key: PropertyKey): boolean {
	return Object.prototype.hasOwnProperty.call(value, key);
}
