#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
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
    "--build-arg",
    `SOURCE_URL=${bwrapPin.sourceUrl}`,
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
