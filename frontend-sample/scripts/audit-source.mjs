import { readFile, readdir, access, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const exists = async (file) => access(file).then(() => true, () => false);
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  }));
  return files.flat();
}
const sources = (await walk(path.join(root, "src"))).filter((file) => /\.(tsx?|css)$/.test(file));
const missing = [];
const packages = new Set();
for (const file of sources.filter((file) => /\.tsx?$/.test(file))) {
  const source = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true);
  const specs = new Set();
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specs.add(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) {
      specs.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const spec of specs) {
    if (spec.startsWith(".") || spec.startsWith("@/")) {
      const base = spec.startsWith("@/") ? path.join(root, "src", spec.slice(2)) : path.resolve(path.dirname(file), spec);
      const candidates = [base, ...[".ts", ".tsx", ".js", ".jsx", ".json", "/index.ts", "/index.tsx"].map((suffix) => base + suffix)];
      if (!(await Promise.all(candidates.map(exists))).some(Boolean)) missing.push({ file: path.relative(root, file), spec });
    } else {
      packages.add(spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);
    }
  }
}
const manifest = JSON.parse(await readFile(path.join(root, "capture-manifest.json"), "utf8"));
const records = [];
for (const entry of manifest) {
  const file = path.join(root, entry.path);
  const content = await exists(file) ? await readFile(file) : null;
  const runtimeSha256 = content ? createHash("sha256").update(content).digest("hex") : null;
  records.push({ ...entry, runtimePresent: content !== null, runtimeSha256, unchanged: runtimeSha256 === entry.originalSha256 });
}
const report = {
  source: "https://enter.converge.ai/project/35eb5fcea65148a58029636f39b13d73?surface=code",
  method: "Individual editor file selection, select-all/copy; no hidden application state or download API",
  originalArchive: "docs/original-source.zip",
  capturedFiles: records.length,
  missingImports: missing,
  importedPackages: [...packages].sort(),
  records,
};
await mkdir(path.join(root, "docs"), { recursive: true });
await writeFile(path.join(root, "docs", "source-audit.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ capturedFiles: records.length, sources: sources.length, missingImports: missing }, null, 2));
if (missing.length) process.exitCode = 1;
