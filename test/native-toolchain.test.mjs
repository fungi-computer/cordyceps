import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import process from "node:process";
import assert from "node:assert/strict";
import { afterEach, test as it } from "node:test";
import {
  ensureNativeHostToolchain,
  selectCargoInvocation,
} from "../native/apply-patch/toolchain.mjs";

const fixtures = [];
afterEach(async () => {
  await Promise.all(
    fixtures
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

// This box's real rustup install, used by the "real caller" tests below.
const realRustupDir = dirname(
  spawnSync(process.platform === "win32" ? "where" : "which", ["rustup"], {
    encoding: "utf8",
  }).stdout.trim(),
);

async function fakeCargoOnPath() {
  const root = await mkdtemp(join(tmpdir(), "fake-cargo-"));
  fixtures.push(root);
  const script = join(root, "cargo");
  // Mirrors a non-rustup `cargo` (for example Homebrew's), which rejects the
  // `+toolchain` directive only rustup's `cargo` proxy understands.
  await writeFile(
    script,
    "#!/bin/sh\ncase \"$1\" in\n  +*) echo 'error: Cargo does not handle +toolchain directives' >&2; exit 1;;\nesac\necho 'fake cargo invoked without a toolchain selector' >&2\nexit 1\n",
  );
  await chmod(script, 0o755);
  return root;
}

it("selects rustup's ordinary toolchain-run interface", () => {
  const { command, args } = selectCargoInvocation({
    toolchain: "1.98.1",
    cargoArgs: ["build", "--release"],
  });
  assert.equal(command, "rustup");
  assert.deepEqual(args, ["run", "1.98.1", "cargo", "build", "--release"]);
});

it("ensureNativeHostToolchain passes with the real installed 1.98.1 toolchain", () => {
  assert.doesNotThrow(() => ensureNativeHostToolchain({ toolchain: "1.98.1" }));
});

it("ensureNativeHostToolchain fails with one message naming rustup when it is absent", () => {
  const originalPath = process.env.PATH;
  process.env.PATH = "/usr/bin:/bin";
  try {
    assert.throws(
      () => ensureNativeHostToolchain({ toolchain: "1.98.1" }),
      /rustup.*https:\/\/rustup\.rs.*rustup toolchain install 1\.98\.1/su,
    );
  } finally {
    process.env.PATH = originalPath;
  }
});

it("ensureNativeHostToolchain fails with one message naming the install command when the toolchain is missing", () => {
  // Real rustup, asked for a toolchain this box never installed.
  assert.throws(
    () => ensureNativeHostToolchain({ toolchain: "9.9.9-not-installed" }),
    /Rust 9\.9\.9-not-installed toolchain.*rustup toolchain install 9\.9\.9-not-installed.*is not installed/su,
  );
});

it("a shim cargo that rejects +toolchain fails bare `cargo +1.98.1` but not the real selection", async () => {
  const shimDir = await fakeCargoOnPath();
  const shimmedPath = [shimDir, realRustupDir, process.env.PATH].join(
    delimiter,
  );

  // Before the fix: a bare `cargo +1.98.1` resolves the shim first and fails.
  const bare = spawnSync("cargo", ["+1.98.1", "--version"], {
    env: { ...process.env, PATH: shimmedPath },
    encoding: "utf8",
  });
  assert.notEqual(bare.status, 0);
  assert.match(bare.stderr, /does not handle \+toolchain directives/);

  // After the fix: the real selection goes through rustup directly, so the
  // shimmed `cargo` is never consulted and the pinned toolchain still runs.
  const { command, args } = selectCargoInvocation({
    toolchain: "1.98.1",
    cargoArgs: ["--version"],
  });
  const fixed = spawnSync(command, args, {
    env: { ...process.env, PATH: shimmedPath },
    encoding: "utf8",
  });
  assert.equal(fixed.status, 0);
  assert.match(fixed.stdout, /cargo 1\.98\.1/);

  // The shimmed `cargo` does not confuse the preflight check either: rustup
  // still reports the pinned toolchain as installed.
  const originalPath = process.env.PATH;
  process.env.PATH = shimmedPath;
  try {
    assert.doesNotThrow(() =>
      ensureNativeHostToolchain({ toolchain: "1.98.1" }),
    );
  } finally {
    process.env.PATH = originalPath;
  }
});
