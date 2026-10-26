import { createHash } from "node:crypto";
import { copyFile, cp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { bwrapPin, seccompPin } from "./pin.mjs";

const [platform, output, upstream] = process.argv.slice(2);
if (!platform || !output || !upstream)
  throw new Error("record.mjs requires platform, output and verified source");
const sha256 = createHash("sha256")
  .update(await readFile(resolve(output, "fungi-bwrap")))
  .digest("hex");
await writeFile(resolve(output, "fungi-bwrap.sha256"), `${sha256}\n`);
const seccompSha256 = createHash("sha256")
  .update(await readFile(resolve(output, "fungi-seccomp.bpf")))
  .digest("hex");
await writeFile(
  resolve(output, "fungi-seccomp.bpf.sha256"),
  `${seccompSha256}\n`,
);
const workspaceSeccompSha256 = createHash("sha256")
  .update(await readFile(resolve(output, "fungi-seccomp-workspace.bpf")))
  .digest("hex");
await writeFile(
  resolve(output, "fungi-seccomp-workspace.bpf.sha256"),
  `${workspaceSeccompSha256}\n`,
);
await copyFile(
  "/source/vendor/LICENSE.sandbox-runtime",
  resolve(output, "LICENSE.sandbox-runtime"),
);
await copyFile(
  resolve(upstream, "COPYING"),
  resolve(output, "LICENSE.bubblewrap"),
);
const capLicense = "/usr/share/doc/libcap2/copyright";
const capVersion = execFileSync(
  "dpkg-query",
  [
    "--show",
    "--showformat=${Version}",
    platform === "linux-arm64" ? "libcap-dev:arm64" : "libcap-dev:amd64",
  ],
  { encoding: "utf8" },
).trim();
await copyFile(capLicense, resolve(output, "LICENSE.libcap"));
await copyFile("/source.tar.xz", resolve(output, "SOURCE.bubblewrap.tar.xz"));
await cp("/source", resolve(output, "bwrap-build-source"), { recursive: true });
await writeFile(
  resolve(output, "bwrap-build.json"),
  JSON.stringify(
    {
      platform,
      upstream: bwrapPin,
      sha256,
      seccomp: {
        generator: seccompPin,
        readOnlySha256: seccompSha256,
        workspaceSha256: workspaceSeccompSha256,
      },
      packages: [
        {
          name: "sandbox-runtime-seccomp-generator",
          version: seccompPin.revision,
          texts: [
            await readFile("/source/vendor/LICENSE.sandbox-runtime", "utf8"),
          ],
        },
        {
          name: "bubblewrap",
          version: bwrapPin.version,
          texts: [await readFile(resolve(upstream, "COPYING"), "utf8")],
        },
        {
          name: "libcap",
          version: capVersion,
          texts: [await readFile(capLicense, "utf8")],
        },
      ],
    },
    null,
    2,
  ) + "\n",
);
