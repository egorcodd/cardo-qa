import ts from "typescript";
import { readdirSync } from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(path.join(dir, entry.name))
      : [path.join(dir, entry.name)],
  );
}
const program = ts.createProgram(
  files(path.join(root, "apps/web/src")).filter((file) =>
    /\.(jsx|js)$/.test(file),
  ),
  {
    allowJs: true,
    checkJs: true,
    noEmit: true,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
  },
);
const errors = [
  ...program.getSyntacticDiagnostics(),
  ...program
    .getSemanticDiagnostics()
    .filter((error) => [2304, 2552].includes(error.code)),
];
if (errors.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(errors, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => root,
      getNewLine: () => "\n",
    }),
  );
  process.exitCode = 1;
} else console.log("Web source: syntax and referenced names checked");
