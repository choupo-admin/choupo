#!/usr/bin/env python3
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


if __name__ == "__main__":
    sys.exit(main())
