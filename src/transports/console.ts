// SPDX-License-Identifier: Apache-2.0

import { LogLevel, type ConsoleTransportOptions, type LogRecord, type Transport } from "../types.js";
import { DEFAULT_STDERR_LEVELS } from "../core/constants.js";
import type { InternalLogRecord, InternalTransport } from "../core/internal.js";
import { TRANSPORT_META } from "../core/internal.js";
import { getConsoleWriter } from "../utils/console.js";

/**
 * Creates a console transport with optional formatting, color and stderr
 * routing preferences.
 */
export function consoleTransport(options: ConsoleTransportOptions = {}): Transport {
	const stderrLevels = new Set(options.stderrLevels ?? Array.from(DEFAULT_STDERR_LEVELS));
	const transport: InternalTransport = {
		name: "console",
		format: options.format,
		write(record: LogRecord, rendered: string) {
			const internalRecord = record as InternalLogRecord;
			const writer = getConsoleWriter(internalRecord.levelValue, stderrLevels);
			writer(rendered);
		},
	};

	transport[TRANSPORT_META] = {
		kind: "console",
		colors: options.colors ?? true,
		stderrLevels,
	};

	return transport;
}
