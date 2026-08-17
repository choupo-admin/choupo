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
const notInstalled = [];

const candidates = /^(?:licen[cs]e|copying|notice)(?:\..*)?$/i;
for (const [relative, meta] of Object.entries(lock.packages)) {
  if (!relative.startsWith("node_modules/") || meta.dev === true) continue;
  const packageDir = join(root, relative);
  if (!existsSync(packageDir)) {
    //  A package the lockfile lists for ANOTHER platform is not installed
    //  here and is therefore not in the build we ship -- so it carries no
    //  attribution obligation, and refusing over it would block every
    //  publish for a file nobody receives.  (pdfjs-dist pulls @napi-rs/canvas
    //  as an optionalDependency; npm resolves its ten per-platform binaries
    //  into the lockfile and installs only the host's.)
    //
    //  The narrowness is the point: only an entry npm itself marked
    //  `optional` may be absent.  A missing REQUIRED package still throws,
    //  because that is a broken install, and generating notices from one
    //  would understate what the site redistributes.  The skips are listed
    //  in the output rather than dropped -- an omission a reader cannot see
    //  is indistinguishable from an omission nobody noticed.
    if (meta.optional === true) {
      notInstalled.push(`${relative}${meta.os ? ` (${meta.os.join("/")}` : " ("}`
                      + `${meta.cpu ? `-${meta.cpu.join("/")}` : ""})`);
      continue;
    }
    throw new Error(`Production package is not installed: ${relative}`);
  }
  packageCount++;
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

//  Say what was left out, and why, inside the notices themselves.  A reader
//  checking whether Choupo attributes everything it ships must be able to see
//  the boundary of this file, not infer it.
if (notInstalled.length > 0) {
  output.push("-".repeat(79));
  output.push(`NOT LISTED: ${notInstalled.length} platform-specific optional package(s)`);
  output.push("-".repeat(79), "");
  output.push("The lockfile names these for platforms other than the one this build ran",
              "on.  npm did not install them, this site does not ship them, and a notice",
              "for a file nobody receives would be a claim about a redistribution that",
              "did not happen.  They are named so the omission is visible:", "");
  for (const p of notInstalled) output.push(`  ${p}`);
  output.push("");
}

const publicDir = join(root, "public");
writeFileSync(join(publicDir, "THIRD_PARTY_NOTICES"), output.join("\n") + "\n");

const plotlyLicence = join(root, "node_modules", "plotly.js-basic-dist-min", "LICENSE");
if (!existsSync(plotlyLicence)) throw new Error("Plotly licence file is missing");
copyFileSync(plotlyLicence, join(publicDir, "plotly-basic.min.js.LICENSE.txt"));

console.log(`[notices] ${packageCount} production package notices generated`);
