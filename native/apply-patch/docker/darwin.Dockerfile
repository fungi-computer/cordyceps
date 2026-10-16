FROM ghcr.io/rust-cross/cargo-zigbuild@sha256:9b4f6b3eb9e8f9fefb3960fe288ddba576627d66d9eff851ce7f62d2455564a5 AS toolchain
RUN rustup toolchain install 1.98.1 --profile minimal && rustup target add --toolchain 1.98.1 aarch64-apple-darwin x86_64-apple-darwin
ENV RUSTUP_TOOLCHAIN=1.98.1
ENV MACOSX_DEPLOYMENT_TARGET=13.5

# Compile from the build context (this directory) and export only the result.
FROM toolchain AS build
COPY --from=node:24.20.0-trixie-slim@sha256:a747ad80c8a161b650d79a6da9c422005b91148b18b8d2c669eb5a0b7c07e600 /usr/local/bin/node /usr/local/bin/node
ARG TARGET=darwin-arm64
ARG CARGO_BUILD_JOBS=4
COPY . /source/
RUN node /source/compile.mjs --target "$TARGET" --out /out --scratch /scratch

FROM scratch
COPY --from=build /out/ /
