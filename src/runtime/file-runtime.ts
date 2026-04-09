// SPDX-License-Identifier: Apache-2.0

interface NodeFsRuntime {
	appendFile(path: string, data: string, encoding: "utf8"): Promise<void>;
	mkdir(path: string, options: { recursive: boolean }): Promise<void>;
	readFile(path: string, encoding: "utf8"): Promise<string>;
	rename(oldPath: string, newPath: string): Promise<void>;
	rm(path: string, options?: { force?: boolean }): Promise<void>;
	stat(path: string): Promise<{ size: number }>;
	writeFile(path: string, data: string, encoding: "utf8"): Promise<void>;
}

interface DenoLike {
	appendTextFile(path: string, data: string): Promise<void>;
	mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
	readTextFile(path: string): Promise<string>;
	remove(path: string): Promise<void>;
	rename(oldPath: string, newPath: string): Promise<void>;
	stat(path: string): Promise<{ size: number }>;
	writeTextFile(path: string, data: string): Promise<void>;
	errors?: {
		AlreadyExists?: new (...args: unknown[]) => Error;
		NotFound?: new (...args: unknown[]) => Error;
	};
}

export interface FileRuntime {
	appendText(path: string, data: string): Promise<void>;
	mkdir(path: string): Promise<void>;
	readText(path: string): Promise<string>;
	remove(path: string): Promise<void>;
	rename(oldPath: string, newPath: string): Promise<void>;
	stat(path: string): Promise<{ size: number } | null>;
	writeText(path: string, data: string): Promise<void>;
}

let nodeFsRuntimePromise: Promise<NodeFsRuntime> | null = null;

/**
 * Returns `true` when the current environment exposes a Node.js runtime.
 */
export function hasNodeRuntime(): boolean {
	const globalObject = globalThis as typeof globalThis & {
		process?: {
			versions?: {
				node?: string;
			};
		};
	};

	return typeof globalObject.process?.versions?.node === "string";
}

/**
 * Returns `true` when the current environment exposes the Deno runtime API.
 */
export function hasDenoRuntime(): boolean {
	const globalObject = globalThis as typeof globalThis & {
		Deno?: DenoLike;
	};

	return typeof globalObject.Deno?.writeTextFile === "function";
}

/**
 * Resolves a file runtime abstraction for either Deno or Node.js.
 */
export async function getFileRuntime(): Promise<FileRuntime> {
	if (hasDenoRuntime()) {
		return createDenoFileRuntime();
	}

	return createNodeFileRuntime();
}

/**
 * Returns the directory portion of a path while keeping browser-safe string
 * handling and avoiding Node-only imports.
 */
export function getDirectoryName(path: string): string {
	const normalized = path.replace(/\\/g, "/");
	const lastSlash = normalized.lastIndexOf("/");

	if (lastSlash < 0) {
		return ".";
	}

	if (lastSlash === 0) {
		return "/";
	}

	return normalized.slice(0, lastSlash);
}

function createDenoFileRuntime(): FileRuntime {
	const globalObject = globalThis as typeof globalThis & {
		Deno?: DenoLike;
	};

	const deno = globalObject.Deno;
	if (!deno) {
		throw new Error("Deno runtime is not available");
	}

	return {
		appendText(path: string, data: string) {
			return deno.appendTextFile(path, data);
		},
		async mkdir(path: string) {
			try {
				await deno.mkdir(path, { recursive: true });
			} catch (error) {
				if (!isDenoAlreadyExistsError(deno, error)) {
					throw error;
				}
			}
		},
		readText(path: string) {
			return deno.readTextFile(path);
		},
		async remove(path: string) {
			try {
				await deno.remove(path);
			} catch (error) {
				if (!isDenoNotFoundError(deno, error)) {
					throw error;
				}
			}
		},
		rename(oldPath: string, newPath: string) {
			return deno.rename(oldPath, newPath);
		},
		async stat(path: string) {
			try {
				const stat = await deno.stat(path);
				return { size: stat.size };
			} catch (error) {
				if (isDenoNotFoundError(deno, error)) {
					return null;
				}
				throw error;
			}
		},
		writeText(path: string, data: string) {
			return deno.writeTextFile(path, data);
		},
	};
}

async function createNodeFileRuntime(): Promise<FileRuntime> {
	const fs = await loadNodeFsRuntime();

	return {
		appendText(path: string, data: string) {
			return fs.appendFile(path, data, "utf8");
		},
		mkdir(path: string) {
			return fs.mkdir(path, { recursive: true });
		},
		readText(path: string) {
			return fs.readFile(path, "utf8");
		},
		remove(path: string) {
			return fs.rm(path, { force: true });
		},
		rename(oldPath: string, newPath: string) {
			return fs.rename(oldPath, newPath);
		},
		async stat(path: string) {
			try {
				const stat = await fs.stat(path);
				return { size: stat.size };
			} catch (error) {
				if (isNodeNotFoundError(error)) {
					return null;
				}
				throw error;
			}
		},
		writeText(path: string, data: string) {
			return fs.writeFile(path, data, "utf8");
		},
	};
}

async function loadNodeFsRuntime(): Promise<NodeFsRuntime> {
	if (!nodeFsRuntimePromise) {
		nodeFsRuntimePromise = importModule("node:fs/promises") as Promise<NodeFsRuntime>;
	}

	return nodeFsRuntimePromise;
}

function importModule(specifier: string): Promise<unknown> {
	return import(specifier);
}

function isNodeNotFoundError(error: unknown): boolean {
	return typeof error === "object"
		&& error !== null
		&& "code" in error
		&& (error as { code?: string }).code === "ENOENT";
}

function isDenoAlreadyExistsError(deno: DenoLike, error: unknown): boolean {
	return error instanceof (deno.errors?.AlreadyExists ?? Error);
}

function isDenoNotFoundError(deno: DenoLike, error: unknown): boolean {
	return error instanceof (deno.errors?.NotFound ?? Error);
}
