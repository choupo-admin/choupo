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

// ---------------------------------------------------------------------------
//  The pdf.js runtime that guide.html draws with.
//
//  Staged the same way as the PDFs and for the same reason: it is an
//  installed artifact, not source, so it is gitignored and re-staged on every
//  predev/prebuild.  guide.html loads these by ABSOLUTE-ish URL relative to
//  its own location (`pdfjs/pdf.min.mjs`), so the layout under public/pdfjs/
//  is part of that page's contract -- change one, change the other.
//
//  A CHECK THAT CANNOT RUN MUST NOT PASS: if pdfjs-dist is not installed the
//  guides would silently stop opening, so this REFUSES rather than warns.
const pdfjsSrc = resolve(here, "../node_modules/pdfjs-dist");
if (!existsSync(pdfjsSrc)) {
  console.error("[copyDocs] pdfjs-dist is not installed -- guide.html cannot draw the "
              + "manuals, and Help would open nothing.  Run: npm install");
  process.exit(1);
}
const pdfjsDst = resolve(here, "../public/pdfjs");
mkdirSync(pdfjsDst, { recursive: true });
for (const [from, to] of [
  ["build/pdf.min.mjs",        "pdf.min.mjs"],         // the core library
  ["build/pdf.worker.min.mjs", "pdf.worker.min.mjs"],  // parsing/rendering worker
  ["web/pdf_viewer.mjs",       "pdf_viewer.mjs"],      // viewer components (nameddest, text layer)
  ["web/pdf_viewer.css",       "pdf_viewer.css"],
]) {
  copyFileSync(resolve(pdfjsSrc, from), resolve(pdfjsDst, to));
}
console.log("[copyDocs] pdf.js runtime -> public/pdfjs/");
