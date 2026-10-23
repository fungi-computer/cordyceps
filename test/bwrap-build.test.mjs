import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";
import { test } from "node:test";

const builder = fileURLToPath(
  new URL("../native/bwrap/build.mjs", import.meta.url),
);
test("requires an explicit artifact destination before invoking a builder", () => {
  const result = spawnSync(process.execPath, [builder], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: fungi-bwrap-build --out/);
});
test("rejects Mac targets before invoking a builder or creating output", () => {
  const result = spawnSync(
    process.execPath,
    [builder, "--out", "/not-created", "--target", "darwin-arm64"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unsupported bubblewrap target: darwin-arm64/);
});
