/* global fetch, setTimeout, clearTimeout */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import process from "node:process";
import test from "node:test";
import { enterComputerdRuntimePhase } from "../src/runtime-phase.mjs";
import { fileURLToPath, URL } from "node:url";

const bundle = fileURLToPath(new URL("../dist/computerd.cjs", import.meta.url));

test("the bundle carries no fuse-native and names it only as an optional import", async () => {
  const source = await readFile(bundle, "utf8");
  assert.doesNotMatch(source, /node_modules\/fuse-native/u);
  assert.match(source, /fuse-native/u);
  // The container's privilege-phase module is named only by the path the
  // container entry supplies at spawn time, never by a sibling package path.
  assert.match(source, /COMPUTER_RUNTIME_PRIVILEGE_MODULE/u);
  assert.doesNotMatch(source, /\.\.\/\.\.\/\.\.\/runtimes/u);
});

test("the bundle runs under this Node in shim mode, with no native module", async () => {
  const folder = await mkdtemp(resolve(tmpdir(), "computerd-bundle-"));
  const child = spawn(process.execPath, [bundle], {
    env: {
      PATH: process.env.PATH ?? "",
      PORT: "0",
      MOUNT_POINT: folder,
      FUSE_MOUNT: "shim",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const port = await new Promise((resolvePort, reject) => {
      let output = "";
      const timer = setTimeout(() => {
        reject(new Error(`computerd did not start: ${output}`));
      }, 20_000);
      const read = (chunk) => {
        output += String(chunk);
        const match = / listening on [^:]+:(\d+) .*backend=shim/u.exec(output);
        if (match === null) return;
        clearTimeout(timer);
        resolvePort(Number(match[1]));
      };
      child.stdout.on("data", read);
      child.stderr.on("data", read);
    });
    const health = await fetch(`http://127.0.0.1:${String(port)}/health`);
    assert.equal(await health.text(), "ok\n");
  } finally {
    child.kill("SIGTERM");
    await rm(folder, { recursive: true, force: true });
  }
});

test("Local startup requires no container privilege module", async () => {
  const runtimeUid = process.env.COMPUTER_RUNTIME_UID;
  delete process.env.COMPUTER_RUNTIME_UID;
  try {
    await enterComputerdRuntimePhase();
  } finally {
    if (runtimeUid !== undefined) process.env.COMPUTER_RUNTIME_UID = runtimeUid;
  }
});

test("the container runtime phase refuses to run without its supplied module path", async () => {
  const runtimeUid = process.env.COMPUTER_RUNTIME_UID;
  const modulePath = process.env.COMPUTER_RUNTIME_PRIVILEGE_MODULE;
  process.env.COMPUTER_RUNTIME_UID = "100000";
  delete process.env.COMPUTER_RUNTIME_PRIVILEGE_MODULE;
  try {
    await assert.rejects(
      enterComputerdRuntimePhase(),
      /COMPUTER_RUNTIME_PRIVILEGE_MODULE/u,
    );
  } finally {
    if (runtimeUid === undefined) delete process.env.COMPUTER_RUNTIME_UID;
    else process.env.COMPUTER_RUNTIME_UID = runtimeUid;
    if (modulePath !== undefined)
      process.env.COMPUTER_RUNTIME_PRIVILEGE_MODULE = modulePath;
  }
});
