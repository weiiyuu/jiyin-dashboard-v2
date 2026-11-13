import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";

const directory = process.env.DATA_DIRECTORY ?? "/app/data";
await mkdir(directory, { recursive: true });
await access(directory, constants.R_OK | constants.W_OK);
console.log(`collector idle: shared data directory is readable and writable (${directory})`);

const timer = setInterval(() => undefined, 60_000);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    clearInterval(timer);
    process.exit(0);
  });
}
