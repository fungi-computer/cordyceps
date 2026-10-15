/* global setTimeout, WritableStream */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import { URL } from "node:url";

// The vendored sources resolve their siblings the way scripts/build.mjs does.
const upstream = (path) => new URL(`../upstream/${path}`, import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@cloudflare/dofs/testing")
      return { url: upstream("dofs/src/testing.ts"), shortCircuit: true };
    if (specifier === "@cloudflare/dofs")
      return { url: upstream("dofs/src/index.ts"), shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { Runner } = await import("../upstream/computerd/src/exec/runner.ts");
const { Database } = await import("../upstream/dofs/src/index.ts");
const { SQLiteTestStorage } = await import("../upstream/dofs/src/testing.ts");
hooks.deregister();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** A long-lived grandchild that records its own pid, like a demo server. */
const server = (pidFile) =>
  `${JSON.stringify(process.execPath)} -e 'require("fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000)'`;

async function startedPid(pidFile) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const text = existsSync(pidFile) ? await readFile(pidFile, "utf8") : "";
    if (text !== "") return Number(text);
    await delay(25);
  }
  throw new Error("The command's server never started");
}

async function exited(pid) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (!alive(pid)) return true;
    await delay(25);
  }
  return false;
}

for (const [commandForm, command] of [
  ["an && chain", (pidFile) => `true && ${server(pidFile)}`],
  ["a backgrounded server", (pidFile) => `${server(pidFile)} & wait`],
]) {
  for (const stop of ["kill", "timeout"]) {
    test(`${stop} stops the whole process group of ${commandForm}`, async (t) => {
      const folder = await mkdtemp(join(tmpdir(), "computerd-runner-"));
      const pidFile = join(folder, "server.pid");
      const runner = new Runner({ db: new Database(new SQLiteTestStorage()) });
      let pid;
      t.after(async () => {
        if (pid !== undefined && alive(pid)) process.kill(pid, "SIGKILL");
        runner.disposeAll();
        await rm(folder, { recursive: true, force: true });
      });
      const { id, events } = runner.exec(
        command(pidFile),
        stop === "timeout" ? { timeoutMs: 500 } : {},
      );
      const drained = events.pipeTo(new WritableStream());
      pid = await startedPid(pidFile);
      assert.equal(alive(pid), true);
      if (stop === "kill") runner.kill(id);
      assert.equal(
        await exited(pid),
        true,
        `the server started by ${commandForm} must stop with its shell`,
      );
      await drained;
    });
  }
}
