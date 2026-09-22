#!/usr/bin/env python3
"""Gate: a full-viewport height is the DYNAMIC viewport, and it has one home.

    bin/curate/check_viewport_units.py

WHY THIS EXISTS.  The app shell is a full-viewport box with
`overflow: hidden` -- correct for a desktop application chrome.  Written as
`height: 100vh` it is wrong on a phone, and wrong in the one way a student
cannot work around: `100vh` is the LARGE viewport, measured as though the
browser's own URL bar were retracted, whether it is or not.  So the shell
lays out taller than the glass, the bottom strip sits under the browser
chrome, and the shell's `overflow: hidden` means there is NO SCROLLER to
reach it with.  The docked console row and the foot of every workspace are
not merely awkward -- they are unreachable.

`100dvh` is the dynamic viewport and tracks the chrome as it retracts.

WHY A GATE AND NOT A COMMENT.  The unit is spelled out at each full-height
root in the app, and there are five of them plus a `calc()` that subtracts
from it.  A viewport story told in six places drifts, and it drifts SILENTLY
because nothing on a desktop ever shows the difference: `100vh` and `100dvh`
are the same number on a machine with no retracting chrome, so every
developer screen, every test and every screenshot agrees while the phone is
broken.  A defect invisible to the whole toolchain is exactly what a gate is
for.

WHAT THIS CHECKS.
  (a) ONE HOME.  `--choupo-vh` is defined exactly once, in
      gui/src/theme-overrides.css, with `100vh` as its value and an
      `@supports (height: 100dvh)` block upgrading it.  BOTH halves are
      required: without the fallback a browser that does not know `dvh`
      resolves the variable to nothing and the shell collapses to zero
      height, which is a worse failure than the one being fixed.
  (b) NO BARE `100vh` anywhere under gui/src, in code -- comments are the
      place this gets EXPLAINED and are not scanned.  The single exception
      is a declaration immediately followed by the same property in `dvh`
      (the classic two-declaration fallback), which is how a document that
      CANNOT inherit the variable must say it: a popped-out plot window is
      its own document, and a variable defined in the app's `:root` does not
      exist there.
  (c) THE VARIABLE IS READ.  At least one site uses `var(--choupo-vh)`.  A
      variable defined, upgraded and read by nobody is a decision with no
      subject, and it would sit here looking maintained.

WHAT THIS DOES NOT CHECK, said plainly:
  * `100vw`.  The width story is a DIFFERENT defect with a different remedy
    (on a desktop with a classic scrollbar `100vw` exceeds the layout
    viewport by the scrollbar's width), it is not what makes a phone
    unusable, and no site here was changed for it.  Naming it is not fixing
    it.
  * WHETHER THE APP ACTUALLY FITS A PHONE.  No script sees a rendered page.
    This gate holds the unit, not the layout; `bin/drive-app` is where a
    rendered claim would be made, and it makes none about viewport height.
  * Any stylesheet outside gui/src -- the landing page and the guides are
    separate artifacts and are not in this gate's domain.

SABOTAGES, fired BY HAND against a working tree and restored from a copy
(never `git checkout --`), md5-verified afterwards.  All six were caught.
  S1  AppShell back to a bare `100vh`                     -> (b)
  S2  the `@supports` upgrade deleted                     -> (a)
  S3  the `100vh` fallback deleted, only `dvh` left       -> (a), see below
  S4  the variable given a SECOND home                    -> (a)
  S5  the popout's `dvh` restatement deleted              -> (b)
  S6  every reader rewritten to a literal                 -> (c)

S3 DID NOT FIRE THROUGH THE ARM IT WAS AIMED AT, and that is recorded rather
than tidied: it was written to trip the "has no `100vh` fallback" message,
and it tripped the COUNT check one line earlier, because deleting the
declaration changes the count before the values are ever inspected.  The
value arm is therefore reachable only by EDITING a declaration rather than
removing it -- a narrower case than its message suggests.  It is kept, since
an edit is exactly what a well-meaning cleanup would do.

Exit 1 with the offending file:line.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GUI = ROOT / "gui" / "src"
HOME = GUI / "theme-overrides.css"
VAR = "--choupo-vh"

SCAN_SUFFIX = {".ts", ".tsx", ".css"}


def code_lines(path: Path):
    """Yield (lineno, text) for lines that are not wholly comment.

    Deliberately crude: a line whose first non-space characters open or
    continue a comment is skipped.  It is enough here because the point of
    this gate is DECLARATIONS, and a declaration shares its line with code.
    A `100vh` hidden inside a trailing comment on a real declaration would
    be missed, and that is stated rather than papered over.
    """
    for i, raw in enumerate(path.read_text().splitlines(), 1):
        s = raw.strip()
        if s.startswith(("//", "/*", "*", "#")):
            continue
        yield i, raw


def main() -> int:
    if not GUI.is_dir():
        print(f"check_viewport_units: FAILED\n  {GUI} is missing -- the tree "
              "this gate scans does not exist, so nothing was checked.")
        return 1

    fails = []

    #  (a) ONE HOME, with its fallback.
    if not HOME.is_file():
        fails.append(f"{HOME} is missing -- {VAR} has no home")
        home_src = ""
    else:
        home_src = HOME.read_text()

    defs = []
    for path in sorted(GUI.rglob("*")):
        if path.suffix not in SCAN_SUFFIX or not path.is_file():
            continue
        for n, line in code_lines(path):
            if re.search(rf"{re.escape(VAR)}\s*:", line):
                defs.append((path, n, line.strip()))

    outside = [(p, n) for p, n, _ in defs if p != HOME]
    if outside:
        fails.append(
            f"{VAR} is defined outside its one home: "
            + ", ".join(f"{p.relative_to(ROOT)}:{n}" for p, n in outside))

    in_home = [d for d in defs if d[0] == HOME]
    if len(in_home) != 2:
        fails.append(
            f"{HOME.relative_to(ROOT)} declares {VAR} {len(in_home)} time(s); "
            "exactly two are required -- the `100vh` fallback and the "
            "`@supports (height: 100dvh)` upgrade")
    else:
        vals = [re.sub(rf".*{re.escape(VAR)}\s*:\s*", "", t).rstrip(";")
                for _, _, t in in_home]
        if "100vh" not in vals:
            fails.append(
                f"{VAR} has no `100vh` fallback ({vals}) -- a browser without "
                "`dvh` resolves the variable to nothing and the shell "
                "collapses to zero height")
        if "100dvh" not in vals:
            fails.append(
                f"{VAR} is never upgraded to `100dvh` ({vals}) -- which is "
                "the entire point of the variable")
        if not re.search(r"@supports\s*\(\s*height\s*:\s*100dvh\s*\)", home_src):
            fails.append(
                "the `100dvh` value is not guarded by "
                "`@supports (height: 100dvh)`")

    #  (b) NO BARE 100vh in code, except the two-declaration fallback form.
    bare = []
    for path in sorted(GUI.rglob("*")):
        if path.suffix not in SCAN_SUFFIX or not path.is_file():
            continue
        lines = {n: t for n, t in code_lines(path)}
        for n, line in lines.items():
            if "100vh" not in line:
                continue
            if path == HOME and VAR in line:
                continue          # the fallback half of the one home
            #  The classic two-declaration form: the same property restated in
            #  `dvh` on this line or the next.
            nxt = lines.get(n + 1, "")
            if "100dvh" in line or "100dvh" in nxt:
                continue
            bare.append(f"{path.relative_to(ROOT)}:{n}")
    if bare:
        fails.append(
            f"{len(bare)} bare `100vh` in code: " + ", ".join(bare)
            + f" -- use `var({VAR})`, or, in a document that cannot inherit "
              "it, restate the property in `100dvh` on the next line")

    #  (c) THE VARIABLE IS READ.
    readers = []
    for path in sorted(GUI.rglob("*")):
        if path.suffix not in SCAN_SUFFIX or not path.is_file():
            continue
        for n, line in code_lines(path):
            if f"var({VAR})" in line:
                readers.append(f"{path.relative_to(ROOT)}:{n}")
    if not readers:
        fails.append(
            f"{VAR} is defined and read by nobody -- a variable with no "
            "subject, sitting here looking maintained")

    if fails:
        print("check_viewport_units: FAILED")
        for f in fails:
            print("  -", f)
        return 1

    print(f"check_viewport_units: OK -- the full-viewport height has ONE home "
          f"({HOME.relative_to(ROOT)}: `100vh` with an `@supports "
          f"(height: 100dvh)` upgrade), {len(readers)} site(s) read "
          f"var({VAR}), and no bare `100vh` remains in gui/src code except a "
          f"declaration restated in `100dvh` for a document that cannot "
          f"inherit the variable.  NOT CHECKED: `100vw` (a different defect "
          f"with a different remedy, and nothing here was changed for it), "
          f"whether the app actually fits a phone (no script sees a rendered "
          f"page), and any stylesheet outside gui/src.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
