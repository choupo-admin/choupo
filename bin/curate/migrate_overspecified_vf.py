#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""migrate_overspecified_vf -- the ONE-SHOT migration of stream state files
that declared T, P AND `vaporFraction` for a MIXTURE (2026-10-03, Vitor's
rule on the landing case flash01: "Se especificas fracao de vapor nao podes
especificar uma das outras variaveis na corrente de entrada!").

A stream of known component flows is fixed by TWO intensive variables
(Duhem's theorem).  For a mixture (T, P) already fix the vapour fraction, so
a `vaporFraction` beside them is redundant when it agrees with the (T, P)
flash and a contradiction when it does not -- and the reader now REFUSES it
(src/streams/StreamStateIO.cpp, "A STREAM IS FIXED BY TWO VARIABLES").  The
writer that put the line there (`converged/` views and `choupo-init0` seeds
stamped the (T, P)-resolved split beside the T and P that fixed it) no longer
emits it for a mixture.  This tool brings the AUTHORED files into line:

    mixture, 0 < q < 1   ->  the `vaporFraction` line is DELETED; the engine
                             resolves the unpinned stream at its own (T, P, z)
                             (R-E1) and shows that state on every surface;
    mixture, q = 0 or 1  ->  the line is REPLACED by `phase liquid;` or
                             `phase gas;` -- the same pin (vf 0/1, phasePinned)
                             in the legible spelling; the ProcessStream the
                             reader builds is IDENTICAL, so no number moves;
    pure component       ->  LEFT ALONE: on its saturation curve (T, P) do not
                             fix the split, and the pin is information.

The trailing comment of a replaced line is kept; the trailing comment of a
deleted line goes with it (it described a value that is no longer declared).
A `vaporFraction` inside a `derived {}` block (the legacy diagnostics layer)
is not touched.  Prose in a file's header that names the line is NOT edited
here -- a header is the author's and is listed for hand review.

Deterministic, idempotent (a file with nothing to do is left byte-identical),
refuses any path under data/standards/ (a curation tool never writes the
frozen tree), and reports what it did per file.

Usage:
    bin/curate/migrate_overspecified_vf.py <path> [<path> ...]
    bin/curate/migrate_overspecified_vf.py --check <path> ...   (report, write nothing)

<path> is a case directory, a state directory (`0/`) or a tree to walk; every
regular file under a directory named `0` (not under `internalStates/`) that
looks like a stream state file is considered.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STANDARDS = (ROOT / "data" / "standards").resolve()

MATERIAL_KEYS = ("componentMolarFlows", "componentMassFlows", "componentFlows",
                 "moleFractions", "massFractions")
VF_LINE = re.compile(r"^(?P<indent>\s*)vaporFraction\s+(?P<q>[-+0-9.eE]+)\s*;"
                     r"(?P<tail>.*)$")


class Refused(Exception):
    pass


def strip_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//.*", "", text)


def looks_like_stream_state(code: str) -> bool:
    return any(re.search(r"\b%s\b" % k, code) for k in MATERIAL_KEYS)


def present_components(code: str) -> int:
    """Number of components with a NON-ZERO entry in the material block."""
    m = re.search(r"(%s)\s*\{(.*?)\}" % "|".join(MATERIAL_KEYS), code, re.S)
    if not m:
        return 0
    n = 0
    for line in m.group(2).splitlines():
        mm = re.match(r"\s*(\S+)\s+([-+0-9.eE]+)", line)
        if mm and float(mm.group(2)) != 0.0:
            n += 1
    return n


def top_level_vf(code: str):
    """The top-level `vaporFraction q;` (not one inside derived {}) or None."""
    depth = 0
    for line in code.splitlines():
        stripped = line.strip()
        if depth == 0:
            m = VF_LINE.match(line)
            if m:
                return float(m.group("q"))
        depth += stripped.count("{") - stripped.count("}")
    return None


def has_key(code: str, key: str) -> bool:
    return re.search(r"^\s*%s\s+\S" % key, code, re.M) is not None


def classify(path: Path):
    """Return (action, q, n) with action in {skip, delete, phase}."""
    text = path.read_text(encoding="utf-8", errors="replace")
    code = strip_comments(text)
    if not looks_like_stream_state(code):
        return ("skip", None, 0, "not a stream state file")
    q = top_level_vf(code)
    if q is None:
        return ("skip", None, 0, "no top-level vaporFraction")
    if not (has_key(code, "T") and has_key(code, "P")):
        return ("skip", q, 0, "vaporFraction without both T and P (not this tool's case)")
    n = present_components(code)
    if n <= 1:
        return ("skip", q, n, "pure component: the pin stays")
    if 1e-9 < q < 1.0 - 1e-9:
        return ("delete", q, n, "mixture, two-phase q: (T, P) fix the split")
    return ("phase", q, n, "mixture, q = %d: the pin is spelled `phase`" % (0 if q <= 1e-9 else 1))


def rewrite(path: Path, action: str) -> str:
    """Apply the action to the file's text; return the new text."""
    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    out = []
    depth = 0
    done = False
    for line in lines:
        code_line = strip_comments(line)
        if depth == 0 and not done:
            m = VF_LINE.match(line.rstrip("\n"))
            if m:
                done = True
                if action == "delete":
                    continue
                q = float(m.group("q"))
                word = "liquid" if q <= 1e-9 else "gas"
                tail = m.group("tail")
                out.append("%sphase           %s;%s\n" % (m.group("indent"), word, tail))
                continue
        depth += code_line.count("{") - code_line.count("}")
        out.append(line)
    return "".join(out)


def state_files(paths):
    for p in paths:
        p = Path(p)
        if p.is_file():
            yield p
            continue
        for f in sorted(p.rglob("*")):
            if not f.is_file():
                continue
            parts = f.relative_to(p).parts if f != p else ()
            allparts = f.parts
            if "0" not in allparts:
                continue
            i0 = len(allparts) - 1 - allparts[::-1].index("0")
            if "internalStates" in allparts[i0:]:
                continue
            if f.name in ("manifest.dat",):
                continue
            yield f


def main(argv) -> int:
    check = False
    args = []
    for a in argv:
        if a == "--check":
            check = True
        else:
            args.append(a)
    if not args:
        print(__doc__)
        return 2
    tally = {"delete": 0, "phase": 0, "pure": 0, "skip": 0}
    header_review = []
    for f in state_files(args):
        try:
            if STANDARDS in f.resolve().parents:
                raise Refused("%s is under data/standards/ -- a curation tool never writes the frozen tree" % f)
        except Refused as e:
            print("REFUSED:", e)
            return 1
        action, q, n, why = classify(f)
        if action == "skip":
            if why.startswith("pure"):
                tally["pure"] += 1
                print("  keep    %s  (q = %s, 1 component)" % (f, q))
            else:
                tally["skip"] += 1
            continue
        tally[action] += 1
        verb = "DELETE" if action == "delete" else "PHASE "
        print("  %s  %s  (q = %s, %d components)" % (verb, f, q, n))
        text = f.read_text(encoding="utf-8")
        if len(re.findall(r"vaporFraction", text)) > 1:
            header_review.append(str(f))
        if not check:
            f.write_text(rewrite(f, action), encoding="utf-8")
    print("\nmigrate_overspecified_vf: %s -- %d line(s) deleted (mixture, 0<q<1), "
          "%d replaced by `phase` (mixture, q in {0,1}), %d pure-component pin(s) kept, "
          "%d file(s) with nothing to do"
          % ("CHECK ONLY" if check else "WRITTEN", tally["delete"], tally["phase"],
             tally["pure"], tally["skip"]))
    if header_review:
        print("HAND REVIEW -- these files also name `vaporFraction` in prose, which this tool does not edit:")
        for h in header_review:
            print("   ", h)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
