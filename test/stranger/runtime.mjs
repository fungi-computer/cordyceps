import assert from "node:assert/strict";
import process from "node:process";
import { setTimeout, clearTimeout } from "node:timers";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const folder = await mkdtemp(join(tmpdir(), "cordyceps-stranger-"));
const child = spawn(
  process.execPath,
  [fileURLToPath(import.meta.resolve("@fungi.computer/cordyceps/cli"))],
  {
    env: {
      PATH: process.env.PATH ?? "",
      PORT: "0",
      MOUNT_POINT: folder,
      FUSE_MOUNT: "shim",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
const settled = once(child, "exit");
try {
  const port = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new Error("Packed daemon did not start")),
      20000,
    );
    const read = (chunk) => {
      output += String(chunk);
      const found = / listening on [^:]+:(\d+) .*backend=shim/u.exec(output);
      if (found !== null) {
        clearTimeout(timer);
        resolve(Number(found[1]));
      }
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  assert.equal(
    await (
      await globalThis.fetch(`http://127.0.0.1:${String(port)}/health`)
    ).text(),
    "ok\n",
  );
} finally {
  child.kill("SIGTERM");
  await settled;
  await rm(folder, { recursive: true, force: true });
}

// The packed engine source carries its pin, wrapper, license and builder; the
// Computer image compiles it for its own platform.
const { codexPatchPin } =
  await import("@fungi.computer/cordyceps/native/apply-patch/pin.mjs");
assert.equal(codexPatchPin.version, "rust-v0.154.0");
for (const file of ["main.rs", "LICENSE.codex", "compile.mjs", "build.mjs"])
  await access(
    fileURLToPath(
      import.meta.resolve(
        `@fungi.computer/cordyceps/native/apply-patch/${file}`,
      ),
    ),
  );
