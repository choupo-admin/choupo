#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_gui_static -- 2 former gates run as ARMS of one script (DEV.md 4c C419).

Former gates, each moved here verbatim as a function (its own docstring first,
its own checks, its own printed lines): check_glob_raw, check_viewport_units.
Each arm prints exactly what its gate printed; this runner prints ONE claim
line first (`check_gui_static: OK -- ...`) that carries every arm's own claim, then
the arms' output, and exits non-zero when any arm does.  An arm that fails does
not stop the others: every verdict is reported.
"""

import contextlib
import io
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

def arm_glob_raw():
    """Gate: an import.meta.glob over DATA files must ask for it raw.

    bin/curate/check_glob_raw.py

WHY THIS EXISTS.  The GUI reaches the repository's `.dat` records through
Vite's `import.meta.glob`.  With `{ query: "?raw", import: "default" }` the
files arrive as STRINGS.  Without it, Vite emits a dynamic `import()` per
match and the production rollup PARSES each `.dat` AS JAVASCRIPT:

    ../data/standards/mixtures/air.dat (17:12): Expected ';', '}' or <eof>

**Dev and vitest cannot see this.**  Reading only the glob's KEYS never
materialises the modules, so `npm run typecheck` and the whole vitest
suite stay green while `npm run build` -- the site -- fails.  That is
exactly what happened on 2026-08-31: a mixture-stem glob written without
`?raw` passed 3396 tests and blocked THREE consecutive publishes of
www.choupo.org, which went on serving a bundle three commits old.

It is the WASM-dialect incident's shape one language over (CLAUDE.md §6):
*a green suite is not evidence about the site*, because the site is a
different artefact from a different toolchain.  The remedy is the same --
a cheap LOCAL check for the construct, not a second full build.

WHAT IS CHECKED.  Every `import.meta.glob(` call under gui/src whose
pattern names a non-JavaScript extension must carry `query: "?raw"` (or
the legacy `as: "raw"`) in the same call.  JS/TS patterns are none of this
gate's business and are skipped.

The gate carries a PROBE -- the offending construct itself, written to a
scratch file -- which must still be rejected, so a rule that stopped
matching anything reports as broken rather than as clean.

SABOTAGE-VERIFIED (performed, gate observed failing, reverted):

  S1  the mixtures glob's `?raw` removed (the shipped defect, restored on
      the real tree) -> flagged by file and line.
  S2  the COMPONENTS glob's `?raw` removed as well -> found a defect IN
      THIS GATE: its first version ended the call match on a `)` followed
      by one of `;,)]`, and that glob is written `...) as Record<string,
      string>;`, so the TypeScript cast made the biggest glob in the tree
      invisible; the gate reported one finding where there were two.
      Replaced by a paren-balancing scanner; the re-run found both.
  S3  the gate's own `?raw` test forced true -> the PROBE arm fires and
      the gate calls ITSELF broken rather than printing OK.

NOT CHECKED, and it matters: this is a SOURCE scan, not a build.  It
cannot see any other way to break `vite build` (a bad plugin, a circular
import, an out-of-memory chunk), and it does not run rollup.  A green run
here says only that this ONE construct -- the one that has actually cost
the site a publish -- is not present in a form that repeats it.

Exit 1 listing every offending call site.
"""
    import re
    import sys
    import tempfile
    from pathlib import Path

    ROOT = Path(__file__).resolve().parents[2]
    SRC = ROOT / "gui" / "src"

    #  Extensions rollup can parse itself.  Anything else in a glob pattern is
    #  data and must arrive as a string.
    CODE_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css",
                ".svg", ".png", ".webp"}

    CALL = re.compile(r"import\.meta\.glob\s*\(")
    PATTERN = re.compile(r"""["']([^"']+)["']""")


    def call_args(text: str, open_paren: int) -> str:
        """The argument text of the call whose '(' is at `open_paren`, found by
    BALANCING parens rather than by what follows the close.

    The first version ended the match on a `)` followed by one of `;,)]`,
    and sabotage 2 showed what that costs: the catalogue's own components
    glob is written `import.meta.glob(...) as Record<string, string>;`, so
    the `as` cast made the biggest glob in the tree INVISIBLE to this gate
    -- it reported one finding where there were two.  A gate that cannot
    see the construct it exists for pins nothing."""
        depth = 0
        for i in range(open_paren, min(len(text), open_paren + 4000)):
            c = text[i]
            if c == "(":
                depth += 1
            elif c == ")":
                depth -= 1
                if depth == 0:
                    return text[open_paren + 1:i]
        return ""


    def offenders(text: str, label: str) -> list[str]:
        out = []
        for m in CALL.finditer(text):
            call = call_args(text, m.end() - 1)
            if not call:
                continue
            pats = PATTERN.findall(call)
            if not pats:
                continue
            #  A glob may take an ARRAY of patterns; judge them all.
            data = [p for p in pats
                    if p.startswith((".", "/")) and "*" in p
                    and Path(p.split("?")[0]).suffix not in CODE_EXT]
            if not data:
                continue
            raw = ('"?raw"' in call or "'?raw'" in call
                   or re.search(r"\bas\s*:\s*['\"]raw['\"]", call))
            if not raw:
                line = text[:m.start()].count("\n") + 1
                out.append(f"{label}:{line}: import.meta.glob over "
                           f"{data[0]} without query: \"?raw\" -- rollup will "
                           "parse the matched files as JavaScript and `vite "
                           "build` (the SITE) will fail, while dev and vitest "
                           "stay green")
        return out


    PROBE = """
const X = import.meta.glob("../../../data/standards/mixtures/*.dat");
"""


    def main() -> int:
        if not SRC.is_dir():
            print("check_glob_raw: FAILED\n  gui/src is not a directory -- a "
                  "check that cannot run must not pass.")
            return 1

        files = sorted(SRC.rglob("*.ts")) + sorted(SRC.rglob("*.tsx"))
        if not files:
            print("check_glob_raw: FAILED\n  no TypeScript sources found under "
                  "gui/src -- the scan root collapsed, and a check that cannot "
                  "run must not pass.")
            return 1

        fail = []
        seen = 0
        for f in files:
            text = f.read_text(encoding="utf-8", errors="replace")
            if "import.meta.glob" not in text:
                continue
            seen += 1
            fail += offenders(text, str(f.relative_to(ROOT)))

        #  THE PROBE: the construct that cost the site three publishes must
        #  still be caught.  A rule that quietly stopped matching would print
        #  OK over the very defect it exists for.
        with tempfile.TemporaryDirectory(prefix="globRaw.") as td:
            probe = Path(td) / "probe.ts"
            probe.write_text(PROBE)
            if not offenders(PROBE, "probe.ts"):
                print("check_glob_raw: FAILED\n  the PROBE (a bare "
                      "import.meta.glob over *.dat) was NOT flagged -- this "
                      "gate's own rule has stopped matching the defect it "
                      "exists for, so its OK line would be a false claim.")
                return 1

        if fail:
            print("check_glob_raw: FAILED")
            for f in fail:
                print("  " + f)
            return 1

        print(f"check_glob_raw: OK -- {seen} source file(s) call "
              "import.meta.glob; every glob over a non-JavaScript pattern asks "
              "for it raw, so rollup receives strings and never tries to parse "
              "a .dat as JavaScript.  The probe (the exact construct that "
              "blocked three site publishes on 2026-08-31) is still rejected.  "
              "NOT CHECKED: this is a SOURCE scan, not a build -- it cannot "
              "see any OTHER way to break `vite build`, and it does not run "
              "rollup.")
        return 0
    return main()


def arm_viewport_units():
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
    return main()


ARMS = [
    ("glob_raw", arm_glob_raw),
    ("viewport_units", arm_viewport_units),
]


def _claim(name, text):
    from gate_claim import claim_in
    import re
    c = claim_in(text, "check_" + name)
    c = c if c else (text.strip().splitlines() or ["(no output)"])[-1].strip()
    return "[" + name + "] " + re.sub(r"^\s*(\[[^\]]+\]|[\w.\-]+:)\s*OK\b\s*(--)?\s*", "", c)


def main():
    results = []
    for name, fn in ARMS:
        buf = io.StringIO()
        rc = 0
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            try:
                r = fn()
                rc = r if isinstance(r, int) else 0
            except SystemExit as e:
                rc = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
                if isinstance(e.code, str):
                    print(e.code)
            except Exception:
                traceback.print_exc()
                rc = 1
        results.append((name, rc, buf.getvalue()))
    bad = [n for n, rc, _ in results if rc != 0]
    if bad:
        print("check_gui_static: FAILED -- arm(s) " + ", ".join(bad))
    else:
        print("check_gui_static: OK -- " + " || ".join(_claim(n, t) for n, _, t in results))
    for name, rc, text in results:
        print("--- arm check_%s (exit %d)" % (name, rc))
        sys.stdout.write(text if text.endswith("\n") or not text else text + "\n")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
