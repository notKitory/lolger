// SPDX-License-Identifier: Apache-2.0

import type { TransportState } from "../core/internal.js";
import { LogLevel } from "../types.js";

/**
 * Selects the appropriate console writer for a log level and stderr policy.
 */
export function getConsoleWriter(
	level: LogLevel,
	stderrLevels: Set<LogLevel>,
): (message: string) => void {
	const safeConsole = getSafeConsole();

	if (level === LogLevel.ERROR) {
		return bindConsoleMethod(safeConsole.error ?? safeConsole.log);
	}

	if (level === LogLevel.WARN) {
		return bindConsoleMethod(
			safeConsole.warn ?? safeConsole.error ?? safeConsole.log,
		);
	}

	if (stderrLevels.has(level)) {
		return bindConsoleMethod(safeConsole.error ?? safeConsole.log);
	}

	if (level === LogLevel.DEBUG) {
		return bindConsoleMethod(safeConsole.debug ?? safeConsole.log);
	}

	if (level === LogLevel.INFO) {
		return bindConsoleMethod(safeConsole.info ?? safeConsole.log);
	}

	return bindConsoleMethod(safeConsole.log);
}

/**
 * Replays raw native errors after the formatted console line so browsers can
 * keep their own rich error rendering behavior.
 */
export function emitNativeErrors(errors: Error[]): void {
	if (errors.length === 0) {
		return;
	}

	const safeConsole = getSafeConsole();
	const error = bindConsoleMethod(safeConsole.error);

	for (const child of errors) {
		error(child);
	}
}

/**
 * Reports a fatal transport failure once and marks the transport as disabled.
 */
export function reportTransportFailure(
	state: TransportState,
	error: unknown,
): void {
	state.failed = true;

	if (state.diagnosticEmitted) {
		return;
	}

	state.diagnosticEmitted = true;

	const safeConsole = getSafeConsole();
	const errorWriter = safeConsole.error ?? safeConsole.log;
	errorWriter.call(
		safeConsole,
		`[lolger] transport "${state.transport.name}" failed`,
		error,
	);
}

function bindConsoleMethod(
	method: ((...args: unknown[]) => void) | undefined,
): (message: string | Error) => void {
	if (!method) {
		return () => undefined;
	}

	return method.bind(console) as (message: string | Error) => void;
}

function getSafeConsole(): Console {
	return console;
}
