import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const root = path.resolve("dist");
const assets = [
  "/index.html",
  "/theme-init.js",
  "/logo.png",
  "/manifest.webmanifest",
  "/icon-192.svg",
  "/icon-512.svg",
  "/icon-192.png",
  "/icon-512.png",
];
for (const file of fs.readdirSync(path.join(root, "assets")))
  assets.push("/assets/" + file);
const banksDirectory = path.join(root, "banks");
if (fs.existsSync(banksDirectory))
  for (const file of fs.readdirSync(banksDirectory).sort())
    if (/\.(svg|png|webp)$/.test(file)) assets.push("/banks/" + file);
const hash = createHash("sha256")
  .update(assets.map((file) => fs.readFileSync(path.join(root, file))).join(""))
  .digest("hex")
  .slice(0, 12);
const source = fs
  .readFileSync("apps/web/public/sw.js", "utf8")
  .replace('"cardo-development"', JSON.stringify("cardo-" + hash))
  .replace("const ASSETS = []", "const ASSETS = " + JSON.stringify(assets));
fs.writeFileSync(path.join(root, "sw.js"), source);
