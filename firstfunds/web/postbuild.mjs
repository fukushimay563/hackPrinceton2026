// The host rejects literal U+FFFD characters. Inside the inlined JS they only appear in
// string/regex literals, where the � escape means exactly the same thing.
import { readFileSync, writeFileSync } from "node:fs";
const f = new URL("../dist-static/index.html", import.meta.url);
const html = readFileSync(f, "utf8");
const n = html.split("�").length - 1;
writeFileSync(f, html.replaceAll("�", "\\uFFFD"));
console.log(`postbuild: escaped ${n} U+FFFD characters`);
