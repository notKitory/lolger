// SPDX-License-Identifier: Apache-2.0

/**
 * Ensures a rendered entry ends with a newline before it is appended to a file.
 */
export function ensureTrailingNewline(text: string): string {
	return text.endsWith("\n") ? text : `${text}\n`;
}

/**
 * Returns the UTF-8 byte length of a string.
 */
export function getByteLength(text: string): number {
	return new TextEncoder().encode(text).length;
}
