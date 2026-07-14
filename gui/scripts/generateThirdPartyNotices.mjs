/* Generate the legal notices shipped by the static GUI build.
 *
 * package-lock.json is the deterministic inventory.  We include every
 * production package's own licence/notice text; an over-inclusive notice is
 * preferable to silently dropping the attribution of a transitive package.
 */
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const output = [
  "CHOUPO GUI - THIRD-PARTY NOTICES",
  "=================================",
  "",
  "This file is generated from package-lock.json and the licence/notice files",
  "installed with production npm packages. Choupo itself is GPL-3.0-or-later.",
  "",
];
let packageCount = 0;

const candidates = /^(?:licen[cs]e|copying|notice)(?:\..*)?$/i;
for (const [relative, meta] of Object.entries(lock.packages)) {
  if (!relative.startsWith("node_modules/") || meta.dev === true) continue;
  packageCount++;
  const packageDir = join(root, relative);
  if (!existsSync(packageDir)) {
    throw new Error(`Production package is not installed: ${relative}`);
  }
  const packageJson = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  const files = readdirSync(packageDir).filter((name) => candidates.test(name)).sort();
  output.push("-".repeat(79));
  output.push(`${packageJson.name}@${packageJson.version} (${packageJson.license ?? meta.license ?? "licence not declared"})`);
  output.push("-".repeat(79), "");
  if (files.length === 0) {
    output.push("No standalone licence/notice file was present in the installed package.", "");
    continue;
  }
  for (const file of files) {
    output.push(`[${file}]`, readFileSync(join(packageDir, file), "utf8").trim(), "");
  }
}

const publicDir = join(root, "public");
writeFileSync(join(publicDir, "THIRD_PARTY_NOTICES"), output.join("\n") + "\n");

const plotlyLicence = join(root, "node_modules", "plotly.js-basic-dist-min", "LICENSE");
if (!existsSync(plotlyLicence)) throw new Error("Plotly licence file is missing");
copyFileSync(plotlyLicence, join(publicDir, "plotly-basic.min.js.LICENSE.txt"));

console.log(`[notices] ${packageCount} production package notices generated`);
