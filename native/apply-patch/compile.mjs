// Compiles `fungi-apply-patch` for one target inside a prepared builder: a
// native host with rustup, a release container (docker/*.Dockerfile) or the
// Computer image's builder stage. It needs only Node, rustup with the pinned
// toolchain, a C toolchain and network access to the pinned Codex release.
//
//   node compile.mjs --out <dir> [--target <platform>] [--scratch <dir>]
//                    [--require-glibc <version>]
//
// It writes <out>/fungi-apply-patch and <out>/build.json (the license and
// notice texts of every crate compiled into it).
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath, URL } from "node:url";
import console from "node:console";
import process from "node:process";
import { parseArgs } from "node:util";
import { nativeNotices } from "./notices.mjs";
import { codexPatchPin } from "./pin.mjs";
import {
  ensureNativeHostToolchain,
  selectCargoInvocation,
} from "./toolchain.mjs";

const { fetch } = globalThis;
const { values } = parseArgs({
  options: {
    target: { type: "string", default: `${process.platform}-${process.arch}` },
    out: { type: "string" },
    scratch: { type: "string" },
    "require-glibc": { type: "string" },
  },
});
if (values.out === undefined) throw new Error("compile.mjs requires --out");
const platform = values.target;
const host = `${process.platform}-${process.arch}`;
const crossLinuxArm = platform === "linux-arm64" && host === "linux-x64";
const macTarget = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
}[platform];
const crossMac = macTarget !== undefined && process.platform !== "darwin";
if (platform !== host && !crossMac && !crossLinuxArm)
  throw new Error(`Unsupported native build target: ${platform} on ${host}`);
const glibc = values["require-glibc"];
if (
  glibc !== undefined &&
  process.report.getReport().header.glibcVersionRuntime !== glibc
)
  throw new Error(`This release builder requires glibc ${glibc}`);

const source = fileURLToPath(new URL("./", import.meta.url));
const out = resolve(values.out);
const scratch = resolve(
  values.scratch ?? resolve(tmpdir(), `fungi-apply-patch-build-${platform}`),
);
const archive = resolve(scratch, `codex-${codexPatchPin.version}.tar.gz`);
const upstream = resolve(scratch, `codex-${codexPatchPin.version}/codex-rs`);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed (${String(result.status)})`);
}

await mkdir(scratch, { recursive: true });
try {
  await access(archive);
} catch {
  const response = await fetch(
    `https://github.com/openai/codex/archive/refs/tags/${codexPatchPin.version}.tar.gz`,
  );
  if (!response.ok)
    throw new Error(`Codex source download failed: ${response.status}`);
  await writeFile(archive, new Uint8Array(await response.arrayBuffer()));
}
if (
  createHash("sha256")
    .update(await readFile(archive))
    .digest("hex") !== codexPatchPin.sourceSha256
)
  throw new Error("Pinned Codex source checksum mismatch");
// Re-extract the verified source so old wrapper or manifest edits cannot survive.
run("tar", ["-xzf", archive, "-C", scratch]);
const manifestPath = resolve(upstream, "Cargo.toml");
const manifest = await readFile(manifestPath, "utf8");
// The release tag bumps workspace package versions but leaves 0.0.0 in its
// lockfile. Restore that build-only metadata; all dependency pins stay intact.
await writeFile(
  manifestPath,
  manifest.replace(
    `version = "${codexPatchPin.version.slice(6)}"`,
    'version = "0.0.0"',
  ),
);
await copyFile(
  resolve(source, "main.rs"),
  resolve(upstream, "apply-patch/src/fungi-main.rs"),
);
const patchManifest = resolve(upstream, "apply-patch/Cargo.toml");
await writeFile(
  patchManifest,
  `${await readFile(patchManifest, "utf8")}\n[[bin]]\nname = "fungi-apply-patch"\npath = "src/fungi-main.rs"\n`,
);
const cargoHome = process.env.CARGO_HOME ?? resolve(homedir(), ".cargo");
// Remap build-host paths so the executable carries no checkout or home path.
const nativePathFlags = [
  `-ffile-prefix-map=${scratch}=/build`,
  `-ffile-prefix-map=${cargoHome}=/cargo`,
]
  .map((flag) => JSON.stringify(flag))
  .join(" ");
ensureNativeHostToolchain({ toolchain: codexPatchPin.rustToolchain });
const { command: cargoCommand, args: cargoArgs } = selectCargoInvocation({
  toolchain: codexPatchPin.rustToolchain,
  cargoArgs: [
    crossMac ? "zigbuild" : "build",
    "--release",
    ...(crossMac
      ? ["--target", macTarget]
      : crossLinuxArm
        ? ["--target", "aarch64-unknown-linux-gnu"]
        : []),
    "--message-format=json",
    "--manifest-path",
    manifestPath,
    "--locked",
    "-p",
    "codex-apply-patch",
    "--bin",
    "fungi-apply-patch",
  ],
});
const cargo = spawnSync(cargoCommand, cargoArgs, {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  env: {
    ...process.env,
    CARGO_TARGET_DIR: resolve(scratch, "target"),
    CARGO_ENCODED_RUSTFLAGS: [
      `--remap-path-prefix=${scratch}=/build`,
      `--remap-path-prefix=${cargoHome}=/cargo`,
    ].join("\x1f"),
    CFLAGS: nativePathFlags,
    CXXFLAGS: nativePathFlags,
    CC_SHELL_ESCAPED_FLAGS: "1",
    CARGO_PROFILE_RELEASE_DEBUG: "0",
    CARGO_PROFILE_RELEASE_INCREMENTAL: "false",
    // Cargo strips debug references during linking, before Mach-O signing.
    CARGO_PROFILE_RELEASE_STRIP: "debuginfo",
  },
});
if (cargo.error) throw cargo.error;
process.stderr.write(cargo.stderr);
const messages = cargo.stdout
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));
for (const message of messages) {
  if (message.reason === "compiler-message" && message.message.rendered)
    process.stderr.write(message.message.rendered);
}
if (cargo.status !== 0) throw new Error("Native patch engine build failed");
const artifacts = messages
  .filter((message) => message.reason === "compiler-artifact")
  .map(({ package_id, manifest_path }) => ({ package_id, manifest_path }));
const executable = messages.find(
  (message) =>
    message.reason === "compiler-artifact" &&
    message.target.name === "fungi-apply-patch" &&
    message.executable,
)?.executable;
if (!executable) throw new Error("Cargo did not report the patch executable");
const destination = resolve(out, "fungi-apply-patch");
await mkdir(dirname(destination), { recursive: true });
await copyFile(executable, destination);
// Keep the cross-linker's Mach-O code signature intact; Linux strip cannot
// re-sign a Mach-O executable. Native Apple builds use Apple's strip.
if (!crossMac)
  run(crossLinuxArm ? "aarch64-linux-gnu-strip" : "strip", [
    process.platform === "darwin" ? "-x" : "--strip-unneeded",
    destination,
  ]);
await writeFile(
  resolve(out, "build.json"),
  JSON.stringify(
    {
      platform,
      packages: await nativeNotices(artifacts, dirname(upstream)),
    },
    null,
    2,
  ) + "\n",
);
console.log(`Built pinned Codex patch engine: ${destination}`);
