# Cordyceps (`@fungi.computer/cordyceps`)

`@fungi.computer/cordyceps` bundles Cloudflare's pinned `computerd` daemon with
its vendored DOFS and computer-rpc sources, and ships the source and builder of
the native `fungi-apply-patch` engine behind the `apply_patch` tool. Local runs
the daemon in shim mode for an attached folder and runs its own build of the
engine in its project root; the Computer container copies and starts the same
daemon as its workspace daemon and compiles the engine for its own platform.

## Install or set up

Install `@fungi.computer/cordyceps` from its package tarball. From the
repository root, run `pnpm install --frozen-lockfile`. The package build uses
esbuild and produces `packages/cordyceps/dist/computerd.cjs`; Node 22.13 or
newer runs the bundle.

## Native patch engine

`fungi-apply-patch` reads one Codex-format patch on stdin and applies it inside
its working directory. It wraps the pinned upstream Codex `codex-apply-patch`
crate ([`native/apply-patch/pin.mjs`](native/apply-patch/pin.mjs)) with Fungi's
rooted, bounded host
([`native/apply-patch/main.rs`](native/apply-patch/main.rs)): paths stay inside
the working directory, input and changes are bounded to 128 KiB, a context
mismatch exits 23 and a malformed patch exits 24.

The package ships the engine's source, never a prebuilt binary, so every
consumer gets an executable for its own platform:

- [`compile.mjs`](native/apply-patch/compile.mjs) compiles one target inside a
  prepared builder (Node, rustup with the pinned Rust toolchain, a C toolchain
  and network access). It verifies the pinned Codex release archive's SHA256,
  builds with the upstream lock unchanged (`--locked`), remaps build paths,
  strips debug information, and writes `fungi-apply-patch` plus `build.json`,
  the license and notice texts of every crate compiled into it.
- `fungi-apply-patch-build --out <dir> [--target <platform>]`
  ([`build.mjs`](native/apply-patch/build.mjs)) builds for a host. Linux targets
  build in a digest-pinned Ubuntu 22.04 container (glibc 2.35 floor), and macOS
  targets cross-build from Linux in a pinned cargo-zigbuild container, each as
  an ordinary `docker build --output` ([`docker/`](native/apply-patch/docker)).
  A macOS host builds its own target natively through rustup. One immutable
  artifact per pin, wrapper and target is shared under
  `${XDG_CACHE_HOME:-~/.cache}/fungi/native-patch/`; concurrent misses serialize
  on `proper-lockfile`, publication is atomic, and a cache hit verifies its
  checksums before restoring the executable and notices. A mismatch is refused
  rather than silently reused or rebuilt under the same pin.
- The Computer image's Dockerfile copies this directory and runs `compile.mjs`
  in a builder stage, so the image's engine always matches the image's platform.

```sh
pnpm --filter @fungi.computer/cordyceps build:native
```

## Quick start

Build the bundle and run its existing shim-mode proof:

```sh
pnpm --filter @fungi.computer/cordyceps build
pnpm --filter @fungi.computer/cordyceps test
```

The bundle test starts computerd with `PORT=0`, a temporary mount directory, and
`FUSE_MOUNT=shim`, then checks `GET /health`. It stops the child and removes the
fixture directory. See
[`test/computerd-bundle.test.mjs`](test/computerd-bundle.test.mjs).

Resolve the installed executable before starting it with the host configuration:

```ts
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(import.meta.resolve("@fungi.computer/cordyceps/cli"));
console.log(cli);
```

## Core concepts

- **The package composes vendored sources.**
  [`scripts/build.mjs`](scripts/build.mjs) bundles the pinned
  `upstream/computerd`, `upstream/dofs`, and `upstream/rpc` trees.
  `upstream/PROVENANCE.md` records the source revision and Botanical changes.
- **Local uses the shim.** Local selects `FUSE_MOUNT=shim`, binds the daemon to
  an available port, and connects through loopback. Its host-side folder is
  synchronized with the in-memory virtual filesystem.
- **The Computer container owns runtime startup.** Its image copies the bundle
  to `/opt/fungi/computerd.cjs`; the container init process starts it alongside
  the terminal service. The configured FUSE backend and container privileges
  determine whether the mount succeeds.

## API reference

The package exports `./cli`, which resolves to the built CommonJS daemon, and
`./native/apply-patch/*`, the engine's source and builder, with the
`fungi-apply-patch-build` bin. It also exports `./native/bwrap/*` with the
`fungi-bwrap-build` bin. The daemon's runtime configuration is read from
environment variables such as `PORT`, `MOUNT_POINT`, `FUSE_MOUNT`, and optional
`UPSTREAM_URL`. The
[`upstream/computerd/README.md`](upstream/computerd/README.md),
[`upstream/dofs/README.md`](upstream/dofs/README.md), and
[`upstream/rpc/README.md`](upstream/rpc/README.md) describe the vendored layers;
the build script and [`upstream/PROVENANCE.md`](upstream/PROVENANCE.md) describe
this package's composition and local changes.

## Examples

The bundle test is the runnable example: it launches the built daemon with the
userspace shim, requests its health endpoint, and shuts it down. Local's caller
selects the same shim explicitly. The shim supports an attached local folder
when FUSE is unavailable; it is not a production-grade replacement for a real
mount.

## Limits and errors

Computerd requires Node 22.13 or newer. A FUSE mount needs the matching host or
container support; the daemon's automatic backend selection can choose the shim
when a FUSE device is unavailable. The shim reconciles writes across the
host-folder boundary and can have races between writers; it is intended for
Local fallback use. The daemon's virtual filesystem is not itself durable on
disk. When `UPSTREAM_URL` is configured, the vendored sync client connects the
virtual filesystem to that upstream; persistence and recovery depend on that
owner.

## Contribute and license

Run `pnpm --filter @fungi.computer/cordyceps build` and
`pnpm --filter @fungi.computer/cordyceps test` after changing the bundle
composition. Review [`upstream/PROVENANCE.md`](upstream/PROVENANCE.md) for
attribution and local patches; [`upstream/LICENSE`](upstream/LICENSE) contains
the vendored MIT license. The patch engine is derived from OpenAI Codex under
the [Apache-2.0 license](native/apply-patch/LICENSE.codex), which ships in the
package tarball; each build's `build.json` carries the license and notice texts
of every crate compiled into it.

## Packed consumer readiness

Run `pnpm run build`, `pnpm run pack` and `pnpm run stranger` in this package.
The maintained stranger proof installs only package tarballs into a fresh npm
consumer, checks the exact shipped files, runs the public runtime fixture and
compiles every JavaScript entrypoint with strict NodeNext and no library-check
skip. This qualification does not publish npm releases or push a repository
split.

See [LICENSE](LICENSE) for the license and the package manifest for its public
repository destination.
