/** Upstream release asset, not GitHub's separately generated source archive. */
export const bwrapPin = Object.freeze({
  version: "0.13.1",
  tag: "v0.13.1",
  commit: "362936aea0d5c6e70f7af75d2d44b5a914cb4ba2",
  sourceUrl:
    "https://github.com/containers/bubblewrap/releases/download/v0.13.1/bubblewrap-0.13.1.tar.xz",
  sourceSha256:
    "0e85c8702248b8dd64144f594147553650cdd0e4c951690345faace79c217c4d",
});

/** Retained libseccomp generator with a Workspace rule-set selector. */
export const seccompPin = Object.freeze({
  repository: "https://github.com/anthropic-experimental/sandbox-runtime",
  revision: "38d1aee29c72035f1dba1337ac89b03a2f655d26",
  source: "vendor/seccomp-src/seccomp-unix-block.c",
  sourceSha256:
    "1599d24097d5e0bac5a22c6d38de98cae990eb18ee28d6be5faccf6db80dcf24",
  licenseSha256:
    "1210bc93eb85dd786c33192d5bcb7153a93922fa99fbc1512af6a7199cb41080",
});
