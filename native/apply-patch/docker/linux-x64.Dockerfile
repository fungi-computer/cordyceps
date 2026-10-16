# Ubuntu 22.04 amd64, jammy-20260924.1. Keep the libc floor at 2.35.
FROM ubuntu:22.04@sha256:08ea48a03a3e78ebc7cd526e6a275053223aadd88bfc09cc49b06d5281525fde AS toolchain
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential ca-certificates curl git pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*
ENV RUSTUP_HOME=/opt/rustup CARGO_HOME=/opt/cargo
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o /tmp/rustup.sh \
    && sh /tmp/rustup.sh -y --profile minimal --default-toolchain 1.98.1 \
    && rm /tmp/rustup.sh \
    && chmod -R a+rX /opt/rustup /opt/cargo
ENV PATH=/opt/cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ENV RUSTUP_TOOLCHAIN=1.98.1

# Compile from the build context (this directory) and export only the result.
FROM toolchain AS build
COPY --from=node:24.20.0-trixie-slim@sha256:a747ad80c8a161b650d79a6da9c422005b91148b18b8d2c669eb5a0b7c07e600 /usr/local/bin/node /usr/local/bin/node
ARG TARGET=linux-x64
ARG CARGO_BUILD_JOBS=4
COPY . /source/
RUN node /source/compile.mjs --target "$TARGET" --out /out --scratch /scratch --require-glibc 2.35

FROM scratch
COPY --from=build /out/ /
