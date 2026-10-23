# Same pinned Ubuntu/glibc floor as Cordyceps' retained Linux patch builder.
FROM ubuntu:22.04@sha256:08ea48a03a3e78ebc7cd526e6a275053223aadd88bfc09cc49b06d5281525fde AS build
ARG TARGET=linux-x64
RUN if [ "$TARGET" = linux-arm64 ]; then \
      dpkg --add-architecture arm64 && \
      sed -i 's/^deb /deb [arch=amd64] /' /etc/apt/sources.list && \
      printf '%s\n' \
        'deb [arch=arm64] http://ports.ubuntu.com/ubuntu-ports jammy main universe' \
        'deb [arch=arm64] http://ports.ubuntu.com/ubuntu-ports jammy-updates main universe' \
        'deb [arch=arm64] http://ports.ubuntu.com/ubuntu-ports jammy-security main universe' \
        > /etc/apt/sources.list.d/arm64.list; \
    fi && apt-get update && apt-get install -y --no-install-recommends \
      build-essential ca-certificates curl xz-utils python3-pip ninja-build \
      pkg-config patchelf libcap-dev libseccomp-dev \
      $(if [ "$TARGET" = linux-arm64 ]; then printf 'gcc-aarch64-linux-gnu binutils-aarch64-linux-gnu libcap-dev:arm64'; fi) \
    && rm -rf /var/lib/apt/lists/*
# prefer_static is a maintained Meson option newer than Jammy's Meson.
RUN pip3 install --no-cache-dir meson==1.10.2
COPY --from=node:24.20.0-trixie-slim@sha256:a747ad80c8a161b650d79a6da9c422005b91148b18b8d2c669eb5a0b7c07e600 /usr/local/bin/node /usr/local/bin/node
ARG SOURCE_URL
ARG SOURCE_SHA256
RUN mkdir /upstream && curl -fL "$SOURCE_URL" -o /source.tar.xz \
    && printf '%s  /source.tar.xz\n' "$SOURCE_SHA256" | sha256sum -c - \
    && tar -xJf /source.tar.xz --strip-components=1 -C /upstream
COPY . /source
ARG SECCOMP_SOURCE_SHA256
ARG SECCOMP_LICENSE_SHA256
RUN test "$(getconf GNU_LIBC_VERSION)" = "glibc 2.35" \
    && printf '%s  /source/vendor/seccomp-unix-block.c\n%s  /source/vendor/LICENSE.sandbox-runtime\n' \
      "$SECCOMP_SOURCE_SHA256" "$SECCOMP_LICENSE_SHA256" | sha256sum -c - \
    && meson setup /compiled /upstream --buildtype=release \
      -Dprefer_static=true -Dselinux=disabled -Dtests=false -Dman=disabled \
      -Dbash_completion=disabled -Dzsh_completion=disabled \
      $(if [ "$TARGET" = linux-arm64 ]; then printf '%s' '--cross-file=/source/linux-arm64.ini'; fi) \
    && meson compile -C /compiled -j 2 \
    && mkdir /out && cp /compiled/bwrap /out/fungi-bwrap \
    && cc -O2 -Wall -Wextra -Werror /source/vendor/seccomp-unix-block.c -lseccomp -o /compiled/seccomp-generator \
    && /compiled/seccomp-generator /out/fungi-seccomp.bpf \
      $(if [ "$TARGET" = linux-arm64 ]; then printf aarch64; else printf x86_64; fi) unix \
    && chmod 0755 /out/fungi-bwrap \
    && patchelf --print-needed /out/fungi-bwrap > /needed \
    && while read -r lib; do \
      case "$lib" in libc.so.6|ld-linux-x86-64.so.2|ld-linux-aarch64.so.1) ;; \
        *) echo "Unpackaged runtime dependency: $lib" >&2; exit 1 ;; esac; \
    done < /needed \
    && node /source/record.mjs "$TARGET" /out /upstream
FROM scratch
COPY --from=build /out/ /
