// Copy the built guides into public/ so the GUI can serve them (and link into
// their exact sections via #nameddest=).  Runs on predev + prebuild.  The PDFs
// are LaTeX build artifacts (docs/Makefile); we don't commit the copies.
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dstDir = resolve(here, "../public/docs");
mkdirSync(dstDir, { recursive: true });

// theoryGuide -> the unit-op Model-tab links; propsGuide -> the props theory
// links; userGuide / developerGuide -> the Help menu (all four are LaTeX
// build artifacts of docs/Makefile and are served from public/docs).
for (const name of ["theoryGuide.pdf", "propsGuide.pdf", "userGuide.pdf", "developerGuide.pdf"]) {
  const src = resolve(here, "../../docs", name);
  if (!existsSync(src)) {
    console.warn(`[copyDocs] ${name} missing — run 'make' in docs/ first; its in-app links will 404.`);
    continue;
  }
  copyFileSync(src, resolve(dstDir, name));
  console.log(`[copyDocs] ${name} -> public/docs/`);
}
