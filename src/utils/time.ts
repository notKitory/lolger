// SPDX-License-Identifier: Apache-2.0

import type { TimestampFormat } from "../types.js";

/**
 * Formats a timestamp according to the active logger configuration.
 */
export function formatTimestamp(date: Date, format: TimestampFormat): string {
	return format === "iso"
		? date.toISOString()
		: date.toTimeString().slice(0, 8);
}
