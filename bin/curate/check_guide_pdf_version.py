#!/usr/bin/env python3
"""Gate: the guide PDF a reader downloads carries the CURRENT version.

    bin/curate/check_guide_pdf_version.py

WHY THIS EXISTS.  On 2026-08-05 Vitor opened choupo.org on his phone and the
Theory Guide title page read "Version 2607 / 30 June 2026".  The repository
was correct -- docs/theoryGuide.pdf said `Choupo-dev` and the hardcoded
release date had been gone for a day.  What he was served was a site build
from 2026-07-29.

THE CHAIN HAS FOUR LINKS AND ONLY ONE WAS GATED:

    src/core/Banner.H          CHOUPO_VERSION, the single source
      -> docs/version.tex      GATED by guide_version.py --check
      -> docs/*.pdf            NOT GATED   <- this file
      -> site/_dist/docs/*.pdf NOT GATED   <- bin/buildSite, post-assembly
      -> choupo.org            (whatever was last deployed)

`guide_version.py` proves the SOURCE the guides compile from is current.  It
cannot prove anybody recompiled them.  A .tex that says `Choupo-dev` beside a
.pdf built last month passes that gate cleanly, and the PDF is the artefact a
reader actually opens -- so the only gated link was the one nobody reads.

This is the same shape as every other defect found this week: a generated
artefact with no staleness check, where the generator's own output was
trusted to imply the product.  A guide naming a release it does not describe
is worse than an undated one, because the wrong label is believed.

WHAT IS CHECKED.  The rendered TITLE PAGE text of each guide must contain the
version string from Banner.H.  Text, not metadata: the title page is what the
reader sees, and PDF metadata can be current while the page is not.

Requires `pdftotext` (poppler).  Where it is absent the gate SKIPS with a
loud note rather than passing silently -- a check that cannot run has not
passed, and saying so is the whole doctrine.
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BANNER = ROOT / "src" / "core" / "Banner.H"
GUIDES = ["theoryGuide", "userGuide", "propsGuide", "developerGuide"]


def engine_version() -> str:
    m = re.search(r'CHOUPO_VERSION\s*=\s*"([^"]+)"', BANNER.read_text())
    if not m:
        raise SystemExit("check_guide_pdf_version: no CHOUPO_VERSION in Banner.H")
    return m.group(1)


def title_page(pdf: Path) -> str:
    r = subprocess.run(["pdftotext", "-f", "1", "-l", "1", str(pdf), "-"],
                       capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else ""


def main() -> int:
    if not shutil.which("pdftotext"):
        print("check_guide_pdf_version: SKIPPED -- pdftotext (poppler) not "
              "installed, so the rendered title pages cannot be read.  This "
              "is NOT a pass: the guides may carry any version at all.")
        return 0

    want = engine_version()
    stale, missing = [], []
    for g in GUIDES:
        pdf = ROOT / "docs" / f"{g}.pdf"
        if not pdf.is_file():
            missing.append(g)
            continue
        page = title_page(pdf)
        if want in page:
            continue
        #  Report WHAT it says, not merely that it is wrong -- a stale stamp
        #  is diagnosed by the version it names.
        found = re.search(r'(Version\s+\d{4}|Choupo-[A-Za-z0-9]+)', page)
        stale.append(f"docs/{g}.pdf title page says "
                     f"'{found.group(1) if found else '(no version at all)'}' "
                     f"-- Banner.H says '{want}'")

    if stale or missing:
        print("check_guide_pdf_version: FAILED")
        for s in stale:
            print("  " + s)
        for m in missing:
            print(f"  docs/{m}.pdf does not exist -- the guide was never built")
        print("  remedy: bin/curate/guide_version.py && make -C docs all")
        return 1

    print(f"check_guide_pdf_version: OK -- all {len(GUIDES)} guide PDFs render "
          f"'{want}' on their title page (the artefact a reader opens, not "
          "just the source it compiles from)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
