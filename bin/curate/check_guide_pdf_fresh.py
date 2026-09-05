#!/usr/bin/env python3
"""Gate: the guide PDF in the TREE is a render of the sources in the TREE.

    bin/curate/check_guide_pdf_fresh.py

WHY THIS EXISTS, and why it is not tidiness.  Every claim this project makes
about its manuals is checked against the `.tex`: `check_doctrine` reads the
sources for a named competitor, `check_guide_paths` resolves the paths they
cite, `check_lesson_symbols` verifies their definitions.  What a reader opens
is the `.pdf`, and the repository SHIPS one per guide.  Those two are the same
claim only while the PDF is a render of the source that was scanned -- and
nothing checked that.

Measured 2026-09-03: all eight PDFs were last committed on 08-30 while six of
their sources had moved since, so a clone carried guides four days behind,
missing (among much else) everything the coverage sweep wrote that morning.
`check_guide_pdf_version` did not catch it and cannot: it reads the TITLE PAGE
for the version string, both say `Choupo-dev`, and a stale render of a
current-versioned source passes it cleanly.  Same version, stale content --
the shape `bin/buildSite` records for the site copy, one artefact inwards.

THE SECOND ARM, and what it found the same day.  A top-level `docs/*.pdf` that
no rule in `docs/Makefile` builds is a manual WITH NO SOURCE: it can be neither
rebuilt, nor corrected, nor audited by any gate this project owns.
`docs/theoryGuide-STIFF-METHODS.pdf` was exactly that -- a v0.2.0 Theory Guide
built on 2026-06-18, still tracked, referenced by nothing, and naming Aspen and
HYSYS in its text and a trademark line, which the manuals doctrine (settled
2026-07-03, philosophy section 4) forbids.  `check_doctrine` reported 374
teaching surfaces clean and was right about every one it could see; this file
was not one of them.  A sourceless binary is outside every source gate at once.

WHAT IS CHECKED
  A  FRESHNESS, two arms, because a defect can be committed or merely pending:
     * COMMITTED -- any commit AFTER the PDF's own last commit that touched one
       of its sources means the committed PDF predates them.
     * WORKTREE  -- a source dirty in the working tree while the PDF is clean
       means the edit has not been rendered yet.
     Sources are derived per guide, never listed here: the guide's own `.tex`,
     every file it `\input`s or `\include`s (recursively), plus `preamble.tex`
     and `version.tex`, which the Makefile's pattern rule names for all of them.
  B  NO SOURCELESS MANUAL: every tracked top-level `docs/*.pdf` is one of the
     guides in `DOCS`.

WHAT IS **NOT** CHECKED, said plainly so a green run cannot imply it:
  * That a DIRTY PDF beside a dirty source was actually rebuilt from it.  Both
    dirty is the normal state one second after `make -C docs all`, and this
    gate cannot tell that from a hand-edited binary.  It passes.
  * That the render is CORRECT -- that is the compile, which `bin/buildSite`
    refuses on.  This gate compares dates and ancestry, never content.
  * Anything under `docs/slides/` or any figure: arm B is top-level only.
  * The published site's copies, which `bin/buildSite` rebuilds itself.

Requires git (ancestry is the only exact answer; file mtimes are all
checkout-time in a fresh clone).  Where git cannot answer, the gate REFUSES
rather than returning 0 -- to the harness exit 0 IS a pass.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
#  Shared inputs of the Makefile's pattern rule `%.pdf: %.tex preamble.tex
#  version.tex cc-by-sa-4.0.txt`.  The licence text is deliberately not here:
#  it is included verbatim and changing it is a legal act with its own review,
#  not a render staleness event.
SHARED = ["preamble.tex", "version.tex"]


def git(*args, check=True):
    p = subprocess.run(["git", "-C", str(ROOT)] + list(args),
                       capture_output=True, text=True)
    if check and p.returncode != 0:
        print("check_guide_pdf_fresh: REFUSED -- `git " + " ".join(args)
              + "` failed, so freshness CANNOT be decided.  It refuses rather "
                "than passing: exit 0 is a pass to the harness.\n  "
              + p.stderr.strip())
        sys.exit(1)
    return p.stdout


def public_guides() -> list[str]:
    #  ONE home for which guides are public: `DOCS :=` in docs/Makefile.  A
    #  default list here would go stale exactly as this gate's subject does.
    m = re.search(r'^DOCS\s*:=\s*(.+)$', (DOCS / "Makefile").read_text(), re.M)
    if not m:
        print("check_guide_pdf_fresh: REFUSED -- cannot read `DOCS :=` from "
              "docs/Makefile; this gate will not invent a list of its own.")
        sys.exit(1)
    return m.group(1).split()


def sources_of(guide: str) -> list[str]:
    """The guide's .tex and everything it pulls in, as repo-relative paths."""
    seen: set[str] = set()
    todo = [f"{guide}.tex"]
    while todo:
        rel = todo.pop()
        if rel in seen:
            continue
        p = DOCS / rel
        if not p.is_file():
            continue
        seen.add(rel)
        for inc in re.findall(r'\\(?:input|include)\s*\{([^}]+)\}',
                              p.read_text(errors="ignore")):
            inc = inc.strip()
            todo.append(inc if inc.endswith(".tex") else inc + ".tex")
    for s in SHARED:
        if (DOCS / s).is_file():
            seen.add(s)
    return sorted(f"docs/{r}" for r in seen)


def rebuild_reproduces(guide: str):
    """-> True when `make -C docs <guide>.pdf` reproduces the committed PDF
    byte for byte; a string naming the outcome otherwise (rebuilt-and-changed,
    or why the rebuild could not run).  Writes only docs/<guide>.pdf, and only
    when the render actually differs."""
    import shutil, subprocess
    if shutil.which("pdflatex") is None and shutil.which("lualatex") is None:
        return "no TeX toolchain here, so the ancestry verdict stands"
    r = subprocess.run(["make", "-C", str(ROOT / "docs"), f"{guide}.pdf"],
                       capture_output=True, text=True, timeout=1200)
    if r.returncode != 0:
        return "the rebuild failed: " + (r.stderr or r.stdout).strip().splitlines()[-1][:80]
    changed = subprocess.run(["git", "diff", "--quiet", "--", f"docs/{guide}.pdf"],
                             cwd=ROOT).returncode != 0
    return True if not changed else "rebuilt: the fresh render now sits in the working tree -- commit it"


def main() -> int:
    if not (ROOT / ".git").exists():
        print("check_guide_pdf_fresh: REFUSED -- not a git working tree, and "
              "ancestry is the only exact answer here (a fresh clone's file "
              "mtimes are all checkout time).  Nothing has been verified.")
        return 1

    guides = public_guides()
    stale_committed: list[str] = []
    reproduced: list[str] = []      # ancestry said stale, a rebuild reproduced the bytes
    stale_worktree: list[str] = []
    missing: list[str] = []
    dirty = {ln[3:].strip() for ln in git("status", "--porcelain").splitlines()}

    for g in guides:
        pdf = f"docs/{g}.pdf"
        if not (ROOT / pdf).is_file():
            missing.append(g)
            continue
        srcs = sources_of(g)
        pdf_dirty = pdf in dirty
        dirty_srcs = [s for s in srcs if s in dirty]
        if dirty_srcs and not pdf_dirty:
            stale_worktree.append(f"{g}: uncommitted edits to "
                                  + ", ".join(dirty_srcs)
                                  + " with the PDF untouched")
            continue
        #  A dirty pair is the state right after a rebuild; see the header's
        #  "what is NOT checked".  Only the committed arm is meaningful then.
        if pdf_dirty:
            continue
        head = git("log", "-1", "--format=%H", "--", pdf).strip()
        if not head:
            stale_committed.append(f"{g}: {pdf} is not committed")
            continue
        after = git("log", "--format=%h %s", f"{head}..HEAD", "--", *srcs)
        lines = [ln for ln in after.splitlines() if ln.strip()]
        if lines:
            #  ANCESTRY IS A PROXY, and here is where it lies (2026-09-05): a
            #  PDF built from a working tree whose source edit was committed
            #  ONE COMMIT LATER is byte-for-byte the fresh render and still
            #  "older" than its source in git.  So when ancestry says stale,
            #  REBUILD and compare: identical bytes mean the committed render
            #  already reproduces the sources now in the tree, and that is a
            #  stronger claim than ancestry ever made.  Different bytes leave
            #  the fresh render in the working tree (it is the remedy this
            #  gate prescribes) and the verdict stays STALE until it is
            #  committed.  No TeX toolchain -> the ancestry verdict stands
            #  and says why: a check that cannot run must not pass.
            verdict = rebuild_reproduces(g)
            if verdict is True:
                reproduced.append(g)
                continue
            shown = "; ".join(ln[:60] for ln in lines[:3])
            more = f" (+{len(lines) - 3} more)" if len(lines) > 3 else ""
            why = "" if verdict is None else f"  [{verdict}]"
            stale_committed.append(
                f"{g}: {len(lines)} commit(s) touched its sources after the "
                f"PDF was last committed -- {shown}{more}{why}")

    #  Arm B: a manual with no source is outside every source gate at once.
    #  Top level only: `docs/slides/` and the figures under it are not
    #  manuals, and arm B is about a MANUAL a reader can open and no gate can
    #  read.  git's pathspec glob crosses `/`, so the scope is applied here.
    tracked = [p for p in git("ls-files", "docs/*.pdf").splitlines() if p]
    top = [p for p in tracked if Path(p).parent.name == "docs"]
    sourceless = [p for p in top if Path(p).stem not in guides]

    if stale_committed or stale_worktree or missing or sourceless:
        print("check_guide_pdf_fresh: FAILED")
        for m in missing:
            print(f"  MISSING   docs/{m}.pdf -- listed in DOCS, absent from the tree")
        for s in stale_committed:
            print(f"  STALE     {s}")
        for s in stale_worktree:
            print(f"  UNBUILT   {s}")
        for s in sourceless:
            print(f"  NO SOURCE {s} -- no rule in docs/Makefile builds it, so it "
                  "cannot be rebuilt, corrected, or read by any gate that scans "
                  "the .tex (check_doctrine among them).  Delete it, or give it "
                  "a source and a DOCS entry.")
        if stale_committed or stale_worktree or missing:
            print("  remedy: make -C docs all, then commit the PDFs with the "
                  "sources that moved.  The tree SHIPS these files; a reader "
                  "who clones opens them, not the .tex.")
        return 1

    rep = (f"  {len(reproduced)} of them ({', '.join(reproduced)}) predate a source commit in "
           f"git and were REBUILT here: identical bytes, so the committed render already "
           f"reproduces the sources." if reproduced else "")
    print(f"check_guide_pdf_fresh: OK -- {len(guides)} guide PDF(s) are renders "
          f"of the sources now in the tree (freshness by git ancestry over each "
          f"guide's own .tex plus everything it \\inputs, plus preamble/version), "
          f"and all {len(top)} tracked top-level docs/*.pdf are guides that "
          f"docs/Makefile builds.{rep}  NOT checked: "
          "that a PDF dirty beside a dirty source was really rebuilt from it, "
          "that any render is CORRECT (that is the compile), the "
          f"{len(tracked) - len(top)} PDF(s) under docs/slides/, or the "
          "published site's own copies.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
