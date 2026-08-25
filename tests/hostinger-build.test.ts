import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("Hostinger build avoids TypeScript config transpilation and Turbopack native bindings", async () => {
  const root = new URL("../", import.meta.url);
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8")) as {
    scripts?: { build?: string };
    dependencies?: Record<string, string>;
  };

  assert.match(packageJson.scripts?.build ?? "", /NEXT_TEST_WASM_DIR=node_modules\/@next\/swc-wasm-nodejs next build --webpack/);
  assert.equal(packageJson.dependencies?.["@next/swc-wasm-nodejs"], packageJson.dependencies?.next);
  await access(new URL("next.config.mjs", root));
  await assert.rejects(access(new URL("next.config.ts", root)));
});
