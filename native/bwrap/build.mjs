#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Buffer } from "node:buffer";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";
import { parseArgs } from "node:util";
import { bwrapPin, seccompPin } from "./pin.mjs";

const { values } = parseArgs({
  options: {
    target: { type: "string", default: `${process.platform}-${process.arch}` },
    out: { type: "string" },
  },
});
if (values.out === undefined)
  throw new Error(
    "Usage: fungi-bwrap-build --out <dir> [--target linux-x64|linux-arm64]",
  );
if (values.target !== "linux-x64" && values.target !== "linux-arm64")
  throw new Error(`Unsupported bubblewrap target: ${values.target}`);
const source = fileURLToPath(new URL("./", import.meta.url));

// The pinned upstream tarball lives in a content-addressed host cache, outside
// Docker's build cache: a builder prune used to force a refetch from GitHub
// mid-release, and GitHub's release downloads sometimes answer 503 for hours.
// The bytes are verified against the pin before they are kept or used.
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const cacheRoot = join(
  process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
  "fungi/bwrap",
  bwrapPin.sourceSha256,
);
const tarball = join(cacheRoot, "source.tar.xz");
if (
  !existsSync(tarball) ||
  sha256(readFileSync(tarball)) !== bwrapPin.sourceSha256
) {
  let bytes;
  for (let attempt = 1; ; attempt++) {
    const response = await globalThis.fetch(bwrapPin.sourceUrl);
    if (response.ok) {
      bytes = Buffer.from(await response.arrayBuffer());
      break;
    }
    if (attempt === 5)
      throw new Error(
        `bubblewrap source download failed: ${response.status} ${bwrapPin.sourceUrl}`,
      );
    await delay(3000 * attempt);
  }
  if (sha256(bytes) !== bwrapPin.sourceSha256)
    throw new Error("bubblewrap source does not match its pinned SHA-256");
  mkdirSync(cacheRoot, { recursive: true });
  writeFileSync(`${tarball}.partial`, bytes);
  renameSync(`${tarball}.partial`, tarball);
}
// Like the retained patch builder: BuildKit owns the build/export lifetime.
// No host package installation, persistent container, verification cache or
// implicit build is introduced into Local's command path.
const result = spawnSync(
  "docker",
  [
    "build",
    "--platform=linux/amd64",
    "--file",
    resolve(source, "Dockerfile"),
    "--build-arg",
    `TARGET=${values.target}`,
    "--build-context",
    `upstream=${cacheRoot}`,
    "--build-arg",
    `SOURCE_SHA256=${bwrapPin.sourceSha256}`,
    "--build-arg",
    `SECCOMP_SOURCE_SHA256=${seccompPin.sourceSha256}`,
    "--build-arg",
    `SECCOMP_LICENSE_SHA256=${seccompPin.licenseSha256}`,
    "--output",
    `type=local,dest=${resolve(values.out)}`,
    source,
  ],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
if (result.status !== 0)
  throw new Error(
    `bubblewrap build failed (${result.signal ?? result.status})`,
  );
