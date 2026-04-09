import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = new URL("../", import.meta.url);
const sourceDirectory = new URL("../src/", import.meta.url);
const packageJsonUrl = new URL("../package.json", import.meta.url);
const issues = [];

const sourceFiles = await collectFiles(sourceDirectory, ".ts");
for (const fileUrl of sourceFiles) {
	const relativePath = toRelativePath(fileUrl);
	const contents = await readFile(fileUrl, "utf8");

	if (!contents.startsWith("// SPDX-License-Identifier: Apache-2.0")) {
		issues.push(`${relativePath}: missing SPDX header`);
	}

	for (const specifier of getRelativeSpecifiers(contents)) {
		if (!specifier.endsWith(".js")) {
			issues.push(
				`${relativePath}: relative import/export "${specifier}" must use a .js extension`,
			);
		}
	}
}

const packageJson = JSON.parse(await readFile(packageJsonUrl, "utf8"));
const rootExport = packageJson.exports?.["."];

if (!rootExport || typeof rootExport !== "object") {
	issues.push('package.json: missing exports["."] definition');
} else {
	if (typeof rootExport.import !== "string") {
		issues.push('package.json: exports["."].import must be defined');
	}

	if (typeof rootExport.require !== "string") {
		issues.push(
			'package.json: exports["."].require must be defined for CommonJS consumers',
		);
	}

	if (typeof rootExport.types !== "string") {
		issues.push('package.json: exports["."].types must be defined');
	}
}

if (
	typeof packageJson.main !== "string" ||
	!packageJson.main.includes("/cjs/")
) {
	issues.push("package.json: main should point to the CommonJS build");
}

if (typeof packageJson.module !== "string") {
	issues.push("package.json: module should point to the ESM build");
}

if (issues.length > 0) {
	console.error("[lint] Repository checks failed:");
	for (const issue of issues) {
		console.error(`- ${issue}`);
	}
	process.exitCode = 1;
} else {
	console.log(
		`[lint] ${sourceFiles.length} source files passed repository checks.`,
	);
}

async function collectFiles(directoryUrl, extension) {
	const entries = await readdir(directoryUrl, {
		withFileTypes: true,
	});
	const files = [];

	for (const entry of entries) {
		const entryUrl = new URL(
			`${entry.name}${entry.isDirectory() ? "/" : ""}`,
			directoryUrl,
		);

		if (entry.isDirectory()) {
			files.push(...(await collectFiles(entryUrl, extension)));
			continue;
		}

		if (entry.isFile() && entry.name.endsWith(extension)) {
			files.push(entryUrl);
		}
	}

	return files.sort((left, right) => left.href.localeCompare(right.href));
}

function getRelativeSpecifiers(contents) {
	const specifiers = new Set();
	const patterns = [
		/(?:import|export)\s+(?:type\s+)?(?:[^"'()]+?\s+from\s+)?["'](\.[^"']+)["']/g,
		/import\(\s*["'](\.[^"']+)["']\s*\)/g,
	];

	for (const pattern of patterns) {
		for (const match of contents.matchAll(pattern)) {
			specifiers.add(match[1]);
		}
	}

	return Array.from(specifiers).sort();
}

function toRelativePath(fileUrl) {
	return path.relative(fileURLToPath(repoRoot), fileURLToPath(fileUrl));
}
