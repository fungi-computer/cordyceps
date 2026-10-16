// Bundle the vendored computerd 0.2.1 (upstream/, with changes recorded in PROVENANCE.md) into
// one CommonJS CLI that runs under the user's Node >= 22.13. Its workspace
// siblings resolve to their vendored sources, and ws, capnweb and
// @platformatic/vfs are inlined, so the result has no runtime dependencies.
// fuse-native stays external: the container supplies it; Local runs the shim
// without a native dependency. The container's native privilege-phase module
// is named only by path, in COMPUTER_RUNTIME_PRIVILEGE_MODULE (set by
// packages/computer/container/computer-init.mjs), so runtime-phase.mjs's
// import of it is a runtime expression esbuild leaves untouched; no bundler
// plugin is needed to redirect it.
import { rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const upstream = (path) => resolve(root, "upstream", path);

await rm(resolve(root, "dist"), { recursive: true, force: true });
const result = await build({
  entryPoints: [upstream("computerd/src/cli/computerd.ts")],
  outfile: resolve(root, "dist/computerd.cjs"),
  bundle: true,
  metafile: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["fuse-native"],
  alias: {
    "@cloudflare/dofs/testing": upstream("dofs/src/testing.ts"),
    "@cloudflare/dofs": upstream("dofs/src/index.ts"),
    "@cloudflare/computer-rpc/client": upstream("rpc/src/client.ts"),
    "@cloudflare/computer-rpc/server": upstream("rpc/src/server.ts"),
    "@cloudflare/computer-rpc/driver": upstream("rpc/src/sync-driver.ts"),
    "@cloudflare/computer-rpc/debug": upstream("rpc/src/debug.ts"),
    "@cloudflare/computer-rpc": upstream("rpc/src/index.ts"),
  },
  logLevel: "warning",
});
await writeFile(
  resolve(root, "dist/metafile.json"),
  JSON.stringify(result.metafile),
);

await writeFile(resolve(root, "dist/computerd.d.cts"), "export {};\n");
