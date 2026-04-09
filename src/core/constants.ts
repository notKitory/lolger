// SPDX-License-Identifier: Apache-2.0

import chalk from "chalk";

import { LogLevel, type LogLevelName } from "../types.js";

export type ChalkType = typeof chalk;

export const namespaceColors: string[] = [
	"#D46A6A",
	"#6AD4A1",
	"#6A8ED4",
	"#D46ABF",
	"#D4A26A",
	"#6AD0D4",
	"#A16AD4",
	"#6AD49F",
	"#D46A94",
	"#6AABD4",
];

export const LOG_LEVEL_NAMES: Record<LogLevel, LogLevelName> = {
	[LogLevel.DEBUG]: "DEBUG",
	[LogLevel.LOG]: "LOG",
	[LogLevel.INFO]: "INFO",
	[LogLevel.WARN]: "WARN",
	[LogLevel.ERROR]: "ERROR",
};

export const DEFAULT_STDERR_LEVELS = new Set<LogLevel>([
	LogLevel.WARN,
	LogLevel.ERROR,
]);

export const LEVEL_CHALK: Record<LogLevelName, ChalkType> = {
	DEBUG: chalk.magenta.bold,
	LOG: chalk.cyan.bold,
	INFO: chalk.blue.bold,
	WARN: chalk.yellow.bold,
	ERROR: chalk.red.bold,
};
