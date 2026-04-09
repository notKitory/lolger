// SPDX-License-Identifier: Apache-2.0

import type { LogFormat, LogLevel, LogRecord, Transport } from "../types.js";

export type InternalTransportKind = "console" | "file" | "custom";

export interface InternalLogRecord extends LogRecord {
	levelValue: LogLevel;
	rawErrors: Error[];
}

export interface TransportMeta {
	kind: InternalTransportKind;
	colors: boolean;
	stderrLevels: Set<LogLevel>;
}

export const TRANSPORT_META = Symbol("lolger.transport-meta");
export const SET_ACTIVE_FORMAT = Symbol("lolger.transport-active-format");

export type InternalTransport = Transport & {
	[TRANSPORT_META]?: TransportMeta;
	[SET_ACTIVE_FORMAT]?: (format: LogFormat) => void;
};

export interface TransportState {
	transport: InternalTransport;
	meta: TransportMeta;
	pending: Promise<void>;
	failed: boolean;
	diagnosticEmitted: boolean;
}
