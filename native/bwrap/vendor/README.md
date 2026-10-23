# Seccomp generator

`seccomp-unix-block.c` is an **unmodified** copy of
`anthropic-experimental/sandbox-runtime` at
`38d1aee29c72035f1dba1337ac89b03a2f655d26`,
`vendor/seccomp-src/seccomp-unix-block.c`. Its Apache-2.0 licence is adjacent.
`../pin.mjs` records both source and licence digests; the native build checks
them before compiling.

We invoke the maintained generator's `unix` rule set, not its optional
`namespaces` rule set. libseccomp compiles the filter for the selected x86-64 or
AArch64 architecture. It denies `socket(AF_UNIX, …)` and `socket(AF_VSOCK, …)`
with `EPERM`, comparing the domain's low 32 bits, and denies all three
`io_uring` syscalls. `socketpair` remains allowed. Non-native ABIs are rejected
by libseccomp's architecture guard. No Botanical code constructs BPF.

The generated filter is passed to bubblewrap's ordinary `--seccomp` interface.
It is data, not a separately shipped executable or a host-installed dependency.

This filter does **not** make v1 a security boundary against hostile programs.
An allowed Unix datagram `socketpair` endpoint can still `sendto` a visible host
pathname socket. CTO decision `3fd830860044` retains that known limitation and
withdraws both the datagram-pair denial and a filesystem-allowlist rebuild.
