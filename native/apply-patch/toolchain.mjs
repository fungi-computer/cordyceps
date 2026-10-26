// Selects the pinned Rust toolchain's `cargo` for the native patch build.
//
// Every builder (a native host, the release containers and the Computer
// image's builder stage) installs Rust through rustup. A non-rustup `cargo`
// earlier on `PATH` (for example Homebrew's) rejects the `+toolchain`
// directive, so the build asks rustup's ordinary interface for the pinned
// toolchain's `cargo` explicitly. Cargo itself still resolves `rustc` from
// `PATH`, so a Homebrew `rustc` listed first would compile with the wrong
// compiler; the invocation pins `RUSTC` to the toolchain's own compiler too.
import { spawnSync } from "node:child_process";

/**
 * Builds the `{ command, args, env }` cargo invocation for the pinned
 * toolchain. `env` carries `RUSTC` and must be merged into the child's
 * environment.
 *
 * @param {{ toolchain: string, cargoArgs: string[] }} options
 */
export function selectCargoInvocation({ toolchain, cargoArgs }) {
  const which = spawnSync(
    "rustup",
    ["which", "--toolchain", toolchain, "rustc"],
    {
      encoding: "utf8",
    },
  );
  if (which.error) throw which.error;
  if (which.status !== 0)
    throw new Error(
      `rustup could not locate the Rust ${toolchain} toolchain's rustc: ${which.stderr.trim()}`,
    );
  return {
    command: "rustup",
    args: ["run", toolchain, "cargo", ...cargoArgs],
    env: { RUSTC: which.stdout.trim() },
  };
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
