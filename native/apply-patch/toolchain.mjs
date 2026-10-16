// Selects the pinned Rust toolchain's `cargo` for the native patch build.
//
// Every builder (a native host, the release containers and the Computer
// image's builder stage) installs Rust through rustup. A non-rustup `cargo`
// earlier on `PATH` (for example Homebrew's) rejects the `+toolchain`
// directive, so the build asks rustup's ordinary interface for the pinned
// toolchain's `cargo` explicitly.
import { spawnSync } from "node:child_process";

/**
 * Builds the `{ command, args }` cargo invocation for the pinned toolchain.
 *
 * @param {{ toolchain: string, cargoArgs: string[] }} options
 */
export function selectCargoInvocation({ toolchain, cargoArgs }) {
  return { command: "rustup", args: ["run", toolchain, "cargo", ...cargoArgs] };
}

/**
 * Confirms rustup and the pinned toolchain are available before starting the
 * real build, so a missing prerequisite fails with one actionable message
 * naming the fix instead of an opaque nested build error.
 *
 * @param {{ toolchain: string }} options
 */
export function ensureNativeHostToolchain({ toolchain }) {
  const probe = spawnSync("rustup", ["run", toolchain, "cargo", "--version"], {
    encoding: "utf8",
  });
  if (probe.error?.code === "ENOENT")
    throw new Error(
      `Cordyceps' native patch build needs rustup with the Rust ${toolchain} toolchain. Install rustup from https://rustup.rs, then run \`rustup toolchain install ${toolchain}\`.`,
    );
  if (probe.error) throw probe.error;
  if (probe.status !== 0)
    throw new Error(
      `Cordyceps' native patch build needs the Rust ${toolchain} toolchain through rustup. Run \`rustup toolchain install ${toolchain}\`. rustup reported: ${probe.stderr.trim()}`,
    );
}
