import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
const root = path.resolve(import.meta.dirname, "..");
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
}
test("Services exchange contracts rather than import another service implementation", () => {
  for (const owner of ["customer", "banking", "engagement", "rates", "gateway"])
    for (const file of files(path.join(root, "services", owner)).filter((f) =>
      f.endsWith(".ts"),
    )) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      for (const statement of source.statements.filter(
        ts.isImportDeclaration,
      )) {
        const spec = statement.moduleSpecifier.text;
        if (!spec.startsWith(".")) continue;
        const target = path.resolve(path.dirname(file), spec);
        if (target.startsWith(path.join(root, "services") + path.sep))
          assert.ok(
            target.startsWith(path.join(root, "services", owner) + path.sep),
            file + " imports another service",
          );
      }
      const text = source.getFullText();
      for (const foreign of [
        "customer",
        "banking",
        "engagement",
        "rates",
      ].filter((x) => x !== owner))
        assert.doesNotMatch(
          text,
          new RegExp(
            "(?:FROM|JOIN|INTO|UPDATE|TABLE)\\s+" + foreign + "\\.",
            "i",
          ),
          file + " accesses foreign SQL data",
        );
    }
});
