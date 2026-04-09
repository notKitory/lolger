import { mkdir, writeFile } from "node:fs/promises";

const cjsDirectory = new URL("../dist/cjs/", import.meta.url);

await mkdir(cjsDirectory, { recursive: true });
await writeFile(
	new URL("package.json", cjsDirectory),
	`${JSON.stringify({ type: "commonjs" }, null, 2)}\n`,
	"utf8",
);
