import { spawn } from "node:child_process";
const entries = [
  "services/customer/index.ts",
  "services/banking/index.ts",
  "services/engagement/index.ts",
  "services/rates/index.ts",
  "services/gateway/index.ts",
];
const children = entries.map((entry) =>
  spawn(process.execPath, [entry], {
    stdio: "inherit",
    env: { ...process.env, HOST: process.env.HOST || "127.0.0.1" },
  }),
);
for (const child of children)
  child.on("exit", (code) => {
    if (code)
      console.error(
        JSON.stringify({
          level: "error",
          message: "Service stopped",
          pid: child.pid,
          code,
        }),
      );
    if (
      children.every(
        (item) => item.exitCode !== null || item.signalCode !== null,
      )
    )
      process.exitCode = code || 0;
  });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    for (const child of children) child.kill();
  });
