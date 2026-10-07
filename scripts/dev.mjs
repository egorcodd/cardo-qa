import { spawn } from "node:child_process";
const entries = [
  "services/customer/index.ts",
  "services/banking/index.ts",
  "services/engagement/index.ts",
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
    if (code) {
      for (const other of children) other.kill();
      process.exitCode = code;
    }
  });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    for (const child of children) child.kill();
  });
