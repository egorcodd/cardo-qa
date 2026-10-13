import { createHash } from "node:crypto";
import JavaScriptObfuscator from "javascript-obfuscator";

export function webObfuscation() {
  return {
    name: "cardo-web-obfuscation",
    apply: "build",
    enforce: "post",
    renderChunk(code, chunk) {
      const ownsApplicationCode = chunk.moduleIds.some((id) =>
        id.replaceAll("\\", "/").includes("/apps/web/src/"),
      );
      if (!ownsApplicationCode) return null;
      const seed = createHash("sha256").update(code).digest().readUInt32BE(0);
      const result = JavaScriptObfuscator.obfuscate(code, {
        target: "browser-no-eval",
        compact: true,
        seed,
        identifierNamesGenerator: "hexadecimal",
        renameGlobals: false,
        renameProperties: false,
        transformObjectKeys: false,
        stringArray: true,
        stringArrayEncoding: ["base64"],
        stringArrayThreshold: 0.6,
        stringArrayCallsTransform: false,
        stringArrayWrappersCount: 1,
        stringArrayWrappersChainedCalls: false,
        splitStrings: false,
        controlFlowFlattening: false,
        deadCodeInjection: false,
        debugProtection: false,
        disableConsoleOutput: false,
        selfDefending: false,
        sourceMap: false,
      });
      return { code: result.getObfuscatedCode(), map: null };
    },
  };
}

export function vendorChunk(id) {
  if (id.replaceAll("\\", "/").includes("/node_modules/")) {
    return "vendor";
  }
}
