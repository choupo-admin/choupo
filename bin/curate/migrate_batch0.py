#!/usr/bin/env python3
"""Relocate a batch case's inline unit-level initial{} -> 0/internalState (VERBATIM).

Batch vessels are closed (no continuous inlet), so there is NO 0/streamFaces -- only
the holdup lives in 0/.  The relocation is VERBATIM: the initial{} block's inner
text (all keys AND sub-dicts: T/P/V/totalMoles/molarComposition/initialLoading)
is moved unchanged into 0/internalState under units{ "<name>" { ... } }, and the
inline block is deleted from flowsheetDict.  Zero value translation -> the unit's
initialise() reads exactly what it read before.

Only HOLDUP unit types are touched (their initial{} is a unit-level holdup):
batchReactor, batchStill, batchCrystalliser, batchAccumulator, batchAdsorber.
fixedBedAdsorber is SKIPPED -- its `initial{}` is operation.initial (a bed Y
profile), an operation parameter, and its spatial state already lives in
0/bed.profile.
"""
import re, sys
from pathlib import Path

HOLDUP_TYPES = {"batchReactor", "batchStill", "batchCrystalliser",
                "batchAccumulator", "batchAdsorber"}

def matched(text, i):
    """Given index i at a '{', return index just past the matching '}'."""
    depth = 0
    for j in range(i, len(text)):
        if text[j] == '{': depth += 1
        elif text[j] == '}':
            depth -= 1
            if depth == 0: return j + 1
    raise ValueError("unbalanced braces")

def units_of(text):
    """Yield (name, type, unit_span, unit_inner) for each top-level unit dict in
    the flowsheetDict `units ( { ... } { ... } );` list."""
    m = re.search(r'(?m)^\s*units\s*\(', text)
    if not m: return
    # walk the list body, each '{' at list level starts a unit dict
    i = m.end()
    depth = 0  # inside the ( )
    while i < len(text):
        ch = text[i]
        if ch == ')' and depth == 0: break
        if ch == '{':
            end = matched(text, i)
            inner = text[i+1:end-1]
            nm = re.search(r'(?m)^\s*name\s+(\w+)\s*;', inner)
            ty = re.search(r'(?m)^\s*type\s+(\w+)\s*;', inner)
            yield (nm.group(1) if nm else None,
                   ty.group(1) if ty else None,
                   (i, end), inner)
            i = end
            continue
        i += 1

def unit_level_initial(unit_inner):
    """Return (span, inner) of the unit-level `initial { ... }` block (a direct
    child of the unit dict, NOT operation.initial), or (None, None)."""
    depth = 0
    i = 0
    while i < len(unit_inner):
        ch = unit_inner[i]
        if ch == '{':
            # a sub-block at unit level: check the keyword just before it
            # find the token preceding this '{'
            pre = unit_inner[:i]
            kw = re.search(r'(\w+)\s*$', pre)
            end = matched(unit_inner, i)
            if depth == 0 and kw and kw.group(1) == "initial":
                return (i - len(kw.group(1)) - (i - kw.end()), end), unit_inner[i+1:end-1]
            i = end
            continue
        i += 1
    return None, None

def migrate(case):
    fd = Path(case) / "system" / "flowsheetDict"
    txt = fd.read_text()
    entries = []          # (name, verbatim_inner)
    deletions = []        # (abs_start, abs_end) in txt of the initial{} block incl keyword
    touched = 0
    for name, utype, (us, ue), inner in units_of(txt):
        if utype not in HOLDUP_TYPES:
            continue
        span, iinner = unit_level_initial(inner)
        if span is None:
            continue
        # locate the keyword 'initial' start within `inner`
        km = re.search(r'(?m)^(\s*)initial\s*\{', inner)
        if not km:
            continue
        kstart = km.start(1) if km.group(1) else km.start()
        # brace end
        brace_i = inner.index('{', km.start())
        iend = matched(inner, brace_i)
        verbatim = inner[brace_i+1:iend-1]
        entries.append((name, verbatim))
        deletions.append((us + 1 + kstart, us + 1 + iend))  # +1 for the '{' of unit
        touched += 1

    if touched == 0:
        print(f"  {case}: no holdup initial{{}} to relocate -- skip")
        return

    # ---- write 0/internalState (verbatim per unit, re-indented to 8) --------
    def reindent(block):
        lines = block.split("\n")
        # drop leading/trailing blank lines
        while lines and lines[0].strip() == "": lines.pop(0)
        while lines and lines[-1].strip() == "": lines.pop()
        # common leading indent across non-blank lines
        indents = [len(l) - len(l.lstrip(" ")) for l in lines if l.strip()]
        cut = min(indents) if indents else 0
        return "\n".join(("        " + l[cut:]) if l.strip() else "" for l in lines)

    body = ""
    for name, verbatim in entries:
        body += f'    "{name}"\n    {{\n{reindent(verbatim)}\n    }}\n'
    istate = ("/*--------------------------------*- Choupo -*"
              "----------------------------------*\\\n"
              "  0/internalState -- the batch vessels' initial HOLDUP (the SINGLE source of\n"
              "  truth; the inline initial{} block is retired, no legacy).  Each unit's\n"
              "  block is its authored initial state VERBATIM (T, P, V, totalMoles,\n"
              "  molarComposition, ...); a closed vessel has no inlet, so there is no\n"
              "  0/streamFaces.  Reads back via the engine's own dict tokenizer.\n"
              "\\*-----------------------------------------------------------------------------*/\n\n"
              "time            0;\n"
              "application     batch;\n\n"
              "units\n{\n" + body + "}\n")
    (Path(case) / "0").mkdir(exist_ok=True)
    (Path(case) / "0" / "internalState").write_text(istate)

    # ---- delete the inline initial{} blocks (highest offset first) ----------
    for a, b in sorted(deletions, reverse=True):
        end = b
        while end < len(txt) and txt[end] in " \t": end += 1
        if end < len(txt) and txt[end] == "\n": end += 1
        # also swallow the indentation on the line the block started on
        line_start = txt.rfind("\n", 0, a) + 1
        if txt[line_start:a].strip() == "":
            a = line_start
        txt = txt[:a] + txt[end:]
    fd.write_text(txt)
    print(f"  {case}: {touched} holdup block(s) -> 0/internalState; inline removed")

for c in sys.argv[1:]:
    migrate(c)
