# Cordyceps (`@fungi.computer/cordyceps`)

`@fungi.computer/cordyceps` bundles Cloudflare's pinned `computerd` daemon with
its vendored DOFS and computer-rpc sources. Local runs the bundle in shim mode
for an attached folder; the Computer container copies and starts the same bundle
as its workspace daemon.

## Install or set up

Install `@fungi.computer/cordyceps` from its package tarball. From the
repository root, run `pnpm install --frozen-lockfile`. The package build uses
esbuild and produces `packages/cordyceps/dist/computerd.cjs`; Node 22.13 or
newer runs the bundle.

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

The package exports `./cli`, which resolves to the built CommonJS daemon. Its
runtime configuration is read from environment variables such as `PORT`,
`MOUNT_POINT`, `FUSE_MOUNT`, and optional `UPSTREAM_URL`. The
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
the vendored MIT license.

## Packed consumer readiness

Run `pnpm run build`, `pnpm run pack` and `pnpm run stranger` in this package.
The maintained stranger proof installs only package tarballs into a fresh npm
consumer, checks the exact shipped files, runs the public runtime fixture and
compiles every JavaScript entrypoint with strict NodeNext and no library-check
skip. This qualification does not publish npm releases or push a repository
split.

See [LICENSE](LICENSE) for the license and the package manifest for its public
repository destination.
