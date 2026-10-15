import process from "node:process";

/**
 * The container mounts as root, then locks down before exposing runtime RPC.
 *
 * Only the Botanical container supplies the native Linux privilege boundary
 * module, by path, in `COMPUTER_RUNTIME_PRIVILEGE_MODULE`. Cordyceps names no
 * sibling package here; the container entry that spawns this process is the
 * module's only supplier. Local's daemon never sets `COMPUTER_RUNTIME_UID`,
 * so it never enters this phase and needs no native dependency.
 */
export async function enterComputerdRuntimePhase() {
  if (process.env.COMPUTER_RUNTIME_UID === undefined) return;
  const modulePath = process.env.COMPUTER_RUNTIME_PRIVILEGE_MODULE;
  if (modulePath === undefined) {
    throw new Error(
      "COMPUTER_RUNTIME_UID is set but COMPUTER_RUNTIME_PRIVILEGE_MODULE is not; " +
        "the container entry must supply the privilege-phase module path",
    );
  }
  const runtime = await import(modulePath);
  runtime.enterRuntimePhase();
  process.send?.({ type: "runtime-unprivileged" });
}
