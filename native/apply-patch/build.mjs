#!/usr/bin/env node
// Builds `fungi-apply-patch` for one platform into a caller-owned directory:
//
//   fungi-apply-patch-build --out <dir> [--target <platform>]
//
// Linux targets always build in a pinned Ubuntu 22.04 release container
// (glibc 2.35 floor); macOS targets cross-build from Linux in a pinned
// cargo-zigbuild container. Each container build is an ordinary
// `docker build --output`, so BuildKit owns its lifetime and leaves no
// container behind. Any other host builds its own target natively through
// rustup. One immutable artifact per pin, wrapper and target is cached under
// ${XDG_CACHE_HOME:-~/.cache}/fungi/native-patch and restored on later calls.
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import console from "node:console";
import process from "node:process";
import { parseArgs } from "node:util";
import { ensureNativePatchArtifact } from "./cache.mjs";
import { codexPatchPin } from "./pin.mjs";

const { values } = parseArgs({
  options: {
    target: { type: "string", default: `${process.platform}-${process.arch}` },
    out: { type: "string" },
  },
});
if (values.out === undefined)
  throw new Error(
    "Usage: fungi-apply-patch-build --out <dir> [--target <platform>]",
  );
const platform = values.target;
const source = fileURLToPath(new URL("./", import.meta.url));
const host = `${process.platform}-${process.arch}`;
const dockerfile = {
  "linux-x64": "docker/linux-x64.Dockerfile",
  "linux-arm64": "docker/linux-arm64.Dockerfile",
  "darwin-arm64": "docker/darwin.Dockerfile",
  "darwin-x64": "docker/darwin.Dockerfile",
}[platform];
if (dockerfile === undefined)
  throw new Error(`Unsupported native build target: ${platform}`);
// Linux x64 always builds against the release's glibc floor, never host headers.
const native = platform === host && platform !== "linux-x64";
if (!native && host !== "linux-x64")
  throw new Error(
    `Build ${platform} from a Linux x64 host with Docker, or natively on its own host`,
  );

function run(command, args) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      code === 0
        ? accept()
        : reject(new Error(`${command} failed (${signal ?? code})`)),
    );
  });
}

const destination = resolve(values.out);
const result = await ensureNativePatchArtifact({
  cacheRoot: resolve(
    process.env.XDG_CACHE_HOME ?? resolve(homedir(), ".cache"),
    "fungi/native-patch",
  ),
  pin: codexPatchPin,
  target: platform,
  wrapper: resolve(source, "main.rs"),
  destination,
  build: () =>
    native
      ? run(process.execPath, [
          resolve(source, "compile.mjs"),
          "--target",
          platform,
          "--out",
          destination,
        ])
      : run("docker", [
          "build",
          "--platform=linux/amd64",
          "--file",
          resolve(source, dockerfile),
          "--build-arg",
          `TARGET=${platform}`,
          "--build-arg",
          `CARGO_BUILD_JOBS=${process.env.CARGO_BUILD_JOBS ?? "4"}`,
          "--output",
          `type=local,dest=${destination}`,
          source,
        ]),
});
console.log(
  `Pinned Codex patch artifact ${result.kind}: ${codexPatchPin.version}/${platform} (${result.artifact})`,
);
