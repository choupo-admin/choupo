#!/usr/bin/env python3
"""Stamp every file banner with the line's own version, from Banner.H.

    bin/curate/banner_version.py            # rewrite banners to CHOUPO_VERSION
    bin/curate/banner_version.py --check    # exit 1 listing any that disagree

THE RULE (Vitor, 2026-08-04, the OpenFOAM.org arrangement).  Every file in
the tree carries the version of the LINE it belongs to.  On `main` that is
`Choupo-dev`; freezing a release rewrites them all to `Choupo-YYMM`, and
step 8 of RELEASING.md rewrites them back.  One command each way.

Before this, the banners said `Choupo-2607` on the development line -- 2053
case files naming the previous release, which is the same defect the guides
had (fixed by bin/curate/guide_version.py) in its largest form.

WHAT IS AND IS NOT A BANNER, because the same string means two things.

  * `Version:  Choupo-2607` in a file's comment box is a LABEL OF THE LINE.
    It is decorative provenance, it is a comment, and it is rewritten here.
  * `catalogueRelease   Choupo-2607` in a case's propertyManifest is a
    HISTORICAL FACT: that case was sealed against the 2607 catalogue.  It
    is true, it is not a label, and rewriting it would FALSIFY PROVENANCE.
    This script never touches it, and the check never reports it.

Same string, opposite meaning.  The distinction is the whole reason this is
a script with a rule rather than a sed one-liner.

WHY THE SWEEP IS SAFE ON SEALED CASES, measured before it was written: a
banner lives inside a comment block, and under `sealSchema computational`
the seal claims PARSED content -- comments never reach the parser's tree.
Rewriting one leaves the canonical hash BYTE-IDENTICAL (verified on
components/benzene.dat) and the case runs with no divergence.  Under the
old whole-file byte seal this sweep would have invalidated the entire
sealed corpus; the 2026-08-03 seal migration is what makes it possible.

BOX ALIGNMENT.  Most banners are rows of an ASCII box that ends in `|`.
`Choupo-dev` and `Choupo-2607` are different lengths, so the closing bar
would drift.  Where a line ends in `|`, the run of spaces before it is
adjusted to keep the ORIGINAL line length -- the box stays square.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BANNER = ROOT / "src" / "core" / "Banner.H"

#  `Version:` + whitespace + the version token.  Deliberately anchored on
#  the word `Version:` so `catalogueRelease Choupo-2607` cannot match.
#
#  The token must be `dev` or a 4-DIGIT YYMM.  That excludes the literal
#  placeholder `Choupo-YYMM`, which RELEASING.md uses to DOCUMENT the naming
#  convention -- a template, not a banner.  Rewriting it to `Choupo-dev`
#  would have destroyed the sentence explaining what a release is called,
#  and the first run of this script did exactly that before the rule was
#  narrowed.  A placeholder is not a version.
PAT = re.compile(r'(Version:\s+)Choupo-(?:dev|[0-9]{4})\b')

SKIP_DIRS = ("thirdParty/", "gui/node_modules/", "build/", "data/tmp/")
SKIP_NAMES = {"LICENSE", "NOTICE", "THIRD_PARTY_NOTICES"}
SKIP_SUFFIX = {".pdf", ".png", ".jpg", ".jpeg", ".ods", ".gz", ".ico",
               ".zip", ".wasm"}


def engine_version() -> str:
    m = re.search(r'CHOUPO_VERSION\s*=\s*"([^"]+)"', BANNER.read_text())
    if not m:
        raise SystemExit(f"banner_version: no CHOUPO_VERSION in {BANNER}")
    return m.group(1)


def tracked():
    out = subprocess.run(["git", "ls-files"], cwd=ROOT,
                         capture_output=True, text=True).stdout.split("\n")
    for f in out:
        if not f or f.startswith(SKIP_DIRS):
            continue
        p = ROOT / f
        if p.name in SKIP_NAMES or p.suffix.lower() in SKIP_SUFFIX:
            continue
        if not p.is_file():
            continue
        yield p


def restamp_line(line: str, version: str):
    """-> (newline, changed).  Keeps the line's length when it is a box row."""
    new = PAT.sub(lambda m: m.group(1) + version, line)
    if new == line:
        return line, False
    #  A box row ends with `|` (possibly followed by the newline).  Re-pad
    #  the space run just before it so the closing bar does not move.
    body = new.rstrip("\n")
    if body.endswith("|"):
        want = len(line.rstrip("\n"))
        delta = want - len(body)
        if delta > 0:
            body = body[:-1] + " " * delta + "|"
        elif delta < 0:
            #  Too long now: eat spaces immediately before the closing bar,
            #  never anything else.
            m = re.search(r'( +)\|$', body)
            if m:
                eat = min(-delta, len(m.group(1)))
                body = body[:m.start(1)] + " " * (len(m.group(1)) - eat) + "|"
        new = body + ("\n" if new.endswith("\n") else "")
    return new, True


def sweep(check: bool):
    version = engine_version()
    changed, stale = [], []
    for p in tracked():
        try:
            text = p.read_text()
        except (UnicodeDecodeError, OSError):
            continue
        if "Version:" not in text:
            continue
        out, hit = [], False
        for line in text.splitlines(keepends=True):
            nl, ch = restamp_line(line, version)
            hit = hit or ch
            out.append(nl)
        if not hit:
            continue
        rel = p.relative_to(ROOT).as_posix()
        if check:
            stale.append(rel)
        else:
            p.write_text("".join(out))
            changed.append(rel)
    return version, changed, stale


def main() -> int:
    check = "--check" in sys.argv
    version, changed, stale = sweep(check)
    if check:
        if stale:
            print(f"banner_version: {len(stale)} file(s) carry a banner that "
                  f"is not {version} -- run bin/curate/banner_version.py")
            for f in stale[:10]:
                print("  " + f)
            if len(stale) > 10:
                print(f"  ... and {len(stale) - 10} more")
            return 1
        print(f"banner version stamp up to date ({version} on every file "
              "banner; catalogueRelease facts untouched)")
        return 0
    print(f"banner_version: stamped {len(changed)} file(s) with {version}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
