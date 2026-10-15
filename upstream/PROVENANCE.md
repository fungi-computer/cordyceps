# Vendored: Cloudflare computerd 0.2.1

- Upstream: https://github.com/cloudflare/computer (tag
  `@cloudflare/computer@0.2.1`, commit
  `849759bbfc23eafbe989b6b158e31ef60a4afb68`).
- Packages: `packages/computerd` (@cloudflare/computerd 0.2.1), `packages/rpc`
  (@cloudflare/computer-rpc 0.2.1), `packages/dofs` (@cloudflare/dofs 0.2.1).
  Upstream tests, `dist/` and `node_modules/` are omitted; the local DOFS schema
  contract test is listed below.
- License: MIT, Copyright (c) 2026 Cloudflare, Inc. The repository-root
  `LICENSE` (copied here) covers all three packages; `computerd` also declares
  MIT in its package.json.
- Why: `computerd` is not published to npm. Fungi runs it from source in
  `FUSE_MOUNT=shim` mode as a local Computer backend, so macOS works without a
  native binary or macFUSE. 0.2.1 matches the daemon in the Computer container
  image.
- Approved by Levi on 2026-09-28 ("If everything is MIT licensed, then yes, you
  have permission to copy it all").
- Local changes to these files must be listed below with a reason.

## Local changes

- `rpc/src/{client,server}.ts` and `rpc/package.json`: import capnweb as
  `@fungi.computer/capnweb`, the capnweb 0.12.0 fork with corrected tuple
  declarations, so computerd bundles the same capnweb as its Worker peers.
- `computerd/src/cli/computerd.ts`: call Botanical’s
  `enterComputerdRuntimePhase` hook after the mount and before creating runtime
  RPC. The container uses it to drop its bootstrap privileges; Local does not
  set `COMPUTER_RUNTIME_UID` and is unchanged.
- `computerd/src/fuse/driver.ts`: allow the container’s post-mount UID to access
  its root-created FUSE mount. File permissions still apply.
- CTO decision, 2026-10-02: use a privileged mount phase followed by an
  unprivileged runtime; retain `no-new-privs` and the unique UID’s hard process
  bound.
- `computerd/src/exec/runner.ts`: spawn each command's `/bin/sh` detached so it
  leads its own process group, and send kill, timeout and dispose signals to
  that whole group. Upstream signalled only the shell, so a server started by
  `cd <cwd> && <command>` or `<command> &` outlived Stop and kept its port.
  `test/computerd-runner.test.mjs` proves the server dies on kill and on
  timeout.
- `dofs/src/schema/{index,core,sync}.ts`: keep the complete current v5 DDL for
  fresh workspaces and reject persisted versions other than fresh (0) or current
  (5); do not convert pre-launch layouts in place.
- `dofs/src/sync/watermarks.ts`: remove the obsolete v3-to-v4 migration
  reference; current backend cursors remain unchanged.
- `dofs/src/schema/index.test.ts` and `dofs/src/testing.ts`: test fresh
  creation, physical reopen, mount modes, backend sync cursors and rejection of
  incompatible versions; allow the SQLite test storage to use a file-backed
  database.
