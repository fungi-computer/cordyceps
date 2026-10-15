import { fileURLToPath } from "node:url";

const cli = fileURLToPath(import.meta.resolve("@fungi.computer/cordyceps/cli"));
console.log(cli);
