// Run before `npm run build`: lists rendered JSX text containing a bare ' " > or } . The production build's lint rule
// (react/no-unescaped-entities) fails on these, so catching them here saves a failed deploy.
// Usage: node scripts/check-jsx-text.cjs   (exits 1 when anything is found)
const ts = require("typescript");
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const hits = [];
function walk(d) {
  for (const n of fs.readdirSync(d)) {
    if (n === "node_modules" || n === ".next") continue;
    const p = path.join(d, n);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.tsx$/.test(n)) scan(p);
  }
}
function scan(file) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.JsxText) {
      const text = node.getText(sf);
      if (/['">}]/.test(text) && text.trim() !== "") {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        hits.push(`${path.relative(root, file)}:${line + 1}: ${text.trim().slice(0, 90)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
for (const d of ["app", "components"]) if (fs.existsSync(path.join(root, d))) walk(path.join(root, d));
if (hits.length) {
  console.error(hits.join("\n"));
  console.error(`${hits.length} rendered-text character(s) need escaping (&apos; &quot; &gt; &#125;).`);
  process.exit(1);
}
console.log("OK: no unescaped characters in rendered text");
