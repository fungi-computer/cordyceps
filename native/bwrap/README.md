# Linux bubblewrap payload preparation

This is source/build preparation, **not a qualified binary or Safe admission**.
Local continues to refuse Safe. No native build or isolation run was performed
for this preparation.

## Authority and acquisition

The maintained upstream is
[containers/bubblewrap](https://github.com/containers/bubblewrap). `pin.mjs`
selects its **0.13.1** release asset, not GitHub's generated source archive and
not Codex's separately modified vendored copy. Read-only acquisition on October
18, 2026 found:

- [Release v0.13.1](https://github.com/containers/bubblewrap/releases/tag/v0.13.1),
  published October 14, not draft/prerelease.
- Release notes and GitHub's asset API both give SHA-256
  `0e85c8702248b8dd64144f594147553650cdd0e4c951690345faace79c217c4d`. The
  downloaded 129,472-byte `.tar.xz` independently hashed to that value.
- Annotated tag object `46ec5c413a3c1da265624ddac3a715b4d1bc487d` points to
  commit `362936aea0d5c6e70f7af75d2d44b5a914cb4ba2`. GitHub reports its
  signature valid; this is **not** a claim of local GPG/key verification.

`build.mjs --out <directory> --target linux-x64|linux-arm64` uses the existing
Cordyceps native-builder convention: an explicit Docker BuildKit build/export,
never a first-use download, host install or PATH search. The recipe uses the
retained Ubuntu 22.04 image digest/glibc 2.35 floor and ordinary upstream
Meson/Ninja. It verifies the archive before extraction. Meson 1.10.2 supplies
`prefer_static`, which Jammy's Meson lacks. Libcap is linked statically;
`patchelf --print-needed` must report only libc/the platform loader or the build
fails. These are **unexecuted recipe requirements**, not successful link
results. Builder-only apt/pip operations occur in the container, never on the
host. They still require the separately authorized native build.

There is no binary digest yet. A successful build will emit `fungi-bwrap`, its
plain SHA-256 sidecar, `bwrap-build.json`, upstream licenses, the unmodified
upstream archive and this build recipe. The sidecar detects changed bytes; it is
not an independent signature or trust root. The source pin, actual build receipt
and reviewed distribution establish provenance.

## Real producer and consumer

Local's `build:native` retains the patch builder, then invokes its build-only
`scripts/build-bwrap.mjs` on Linux. Its Turbo inputs include this directory and
that script. There is no Mac backend change.

`apps/tui/scripts/bundle-native.mjs` requires the Linux payload, digest,
provenance, licenses and source when preparing
`@fungi.computer/spore-native-linux-{x64,arm64}`. Missing files fail packaging.
The package exports `./bin/fungi-bwrap`; no new public shell command is added.
Local's existing `localBwrapExecutable()` resolves that export when bundled,
otherwise its own `native/bin`, and verifies the digest each use. No PATH
fallback exists. Packaging and installed-package resolution still need real
artifact qualification.

## Prepared proof commands — only after a separate heavy grant

From the worktree root, under the granted native-build/proof lease:

```sh
node packages/cordyceps/native/bwrap/build.mjs \
  --target linux-x64 --out runtimes/local/native/bin
TMPDIR="$PWD/.botanical/tmp" FUNGI_RUN_LINUX_SANDBOX_PROOF=1 \
  node --import tsx runtimes/local/test/fixtures/linux-sandbox-proof.mts
```

The proof command refuses a missing/digest-invalid real payload **before**
creating fixtures. It uses the actual Linux argv builder without opening
production admission. Its disposable state stays under the worktree's ignored
`.botanical/tmp/linux-enforcement-*`; it prints and retains that exact
directory. Only controlled TCP/Unix listeners are created, and they close in
`finally`. No Local service, live project, host `/run` state or remote host is
mutated.

The prepared probe checks confined writes, outside-write refusal, `.fungi` and
Git administration write refusal (including add/commit), private `/run` and
external XDG runtime directory, absent session locators, and refusal to reach
the controlled host TCP/Unix listeners. Namespace denial must fail the proof,
not trigger bare execution or a skipped success.

This is a **direct backend proof fixture**, not foreground/background lifecycle
or Files acceptance. Linked-worktree Git protection, shell/direct command
owners, process-group cleanup, hidden-run detachment, installed-package
resolution and all affected gates still require qualification. The argv/digest
unit tests do not establish any of these kernel properties. Even a passing
backend probe alone does not authorize changing readiness.

## Exact remaining gap

Source identity/acquisition is resolved. Native compilation/linking on the
selected release floor, binary digest production, kernel enforcement and
packaging/consumer proofs are not. The next external permission needed is the
explicit native-build and Linux-fixture proof grant; there is no request here
for host root packages, privilege, kernel changes, publication or deployment. If
unprivileged namespaces or the maintained builder are unavailable, retain the
exact failure and leave Safe refused rather than mutating the host.
