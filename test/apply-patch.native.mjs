// The engine this package builds for its own host (`build:native`).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  access,
  constants,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";

const executable = fileURLToPath(
  new URL("../native/bin/fungi-apply-patch", import.meta.url),
);

const patch = (...lines) =>
  ["*** Begin Patch", ...lines, "*** End Patch", ""].join("\n");

function applyPatch(cwd, text) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, [], { cwd, stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (data) => {
      stdout += data;
    });
    child.stderr.setEncoding("utf8").on("data", (data) => {
      stderr += data;
    });
    child.once("error", reject);
    child.once("close", (exitCode) => accept({ exitCode, stdout, stderr }));
    child.stdin.end(text);
  });
}

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), "cordyceps-apply-patch-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("the packaged engine is executable; run `pnpm --filter @fungi.computer/cordyceps build:native` first", async () => {
  await access(executable, constants.X_OK);
});

test("adds, updates, moves and deletes files inside its working directory", async (t) => {
  const root = await workspace(t);
  await writeFile(join(root, "old.txt"), "one\ntwo\n");
  await writeFile(join(root, "gone.txt"), "bye\n");
  const result = await applyPatch(
    root,
    patch(
      "*** Add File: nested/new.txt",
      "+hello",
      "*** Update File: old.txt",
      "*** Move to: moved.txt",
      "@@",
      " one",
      "-two",
      "+three",
      "*** Delete File: gone.txt",
    ),
  );
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(await readFile(join(root, "nested/new.txt"), "utf8"), "hello\n");
  assert.equal(await readFile(join(root, "moved.txt"), "utf8"), "one\nthree\n");
  await assert.rejects(access(join(root, "old.txt")), { code: "ENOENT" });
  await assert.rejects(access(join(root, "gone.txt")), { code: "ENOENT" });
});

test("a context mismatch exits 23 and leaves the file unchanged", async (t) => {
  const root = await workspace(t);
  await writeFile(join(root, "a.txt"), "alpha\n");
  const result = await applyPatch(
    root,
    patch("*** Update File: a.txt", "@@", "-not there", "+beta"),
  );
  assert.equal(result.exitCode, 23);
  assert.equal(await readFile(join(root, "a.txt"), "utf8"), "alpha\n");
});

test("a hunk without a file header exits 24 with the expected patch format", async (t) => {
  const root = await workspace(t);
  const result = await applyPatch(
    root,
    patch("@@ -1 +1 @@", "-old line", "+new line"),
  );
  assert.equal(result.exitCode, 24);
  assert.match(result.stderr, /Expected patch format/u);
});

test("refuses a path outside its working directory", async (t) => {
  const root = await workspace(t);
  const result = await applyPatch(
    root,
    patch("*** Add File: ../escape.txt", "+nope"),
  );
  assert.notEqual(result.exitCode, 0);
  await assert.rejects(access(join(root, "../escape.txt")), {
    code: "ENOENT",
  });
});
