import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const root = path.resolve("dist");
const assets = [
  "/index.html",
  "/logo.png",
  "/manifest.webmanifest",
  "/icon-192.svg",
  "/icon-512.svg",
];
for (const file of fs.readdirSync(path.join(root, "assets")))
  assets.push("/assets/" + file);
const hash = createHash("sha256")
  .update(assets.map((file) => fs.readFileSync(path.join(root, file))).join(""))
  .digest("hex")
  .slice(0, 12);
const source = fs
  .readFileSync("apps/web/public/sw.js", "utf8")
  .replace('"cardo-development"', JSON.stringify("cardo-" + hash))
  .replace("const ASSETS = []", "const ASSETS = " + JSON.stringify(assets));
fs.writeFileSync(path.join(root, "sw.js"), source);
