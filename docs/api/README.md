# API reference

`./cli` is a side-effect executable module, with no library exports. Resolve it and launch Node with the documented mount, port and backend environment. Shim mode avoids FUSE; container mode requires the host runtime privilege module. The packed type declaration describes the executable module without inventing library methods.

`./native/apply-patch/*` exposes the native `fungi-apply-patch` engine's source and builder, not a library API. Run the `fungi-apply-patch-build --out <dir>` bin, or `compile.mjs` inside a prepared builder, to produce an engine for one platform.

## Public entrypoints

- `@fungi.computer/cordyceps/cli`
- `@fungi.computer/cordyceps/native/apply-patch/*` (engine source and builder)

Type declarations ship beside each JavaScript entrypoint. The README owns usage, lifetime rules and limitations.
