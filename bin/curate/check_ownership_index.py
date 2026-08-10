#!/usr/bin/env python3
"""Gate: the ownership index resolves -- every pointer points at something.

    bin/curate/check_ownership_index.py

WHY THIS EXISTS.  `docs/architecture/ownership-index.md` is the address book
a developer fills the impact brief from (Vitor's operational-memory ruling,
2026-08-10): feature -> owner -> producers/consumers -> contract -> witness
-> gates.  An address book whose addresses rot is worse than none -- a brief
filled from a dangling row inspects the wrong blast radius with confidence.
This is the check_witness_tier posture applied to the index: resolvability
is gated, JUDGEMENT is not.

WHAT THIS CHECKS:

  (O1) every backticked REPO path resolves to an existing file or directory
       -- a token counts as a repo path only when it starts with a top-level
       tree (src/ docs/ bin/ data/ gui/ tutorials/ generated/), because the
       index also names CASE-relative structure (`converged/`,
       `system/solverDict`) which is vocabulary, not an address.  A
       `Class::method` suffix and a `{H,cpp}` brace-expansion are stripped;
       `<`/`*` placeholders are skipped;
  (O2) every named `check_*` gate exists as bin/curate/check_*.py;
  (O3) every `Witness:` line names a class declared in tutorials/WITNESSES
       (or states in words why there is none -- a bare dash is refused, an
       absence must carry its reason);
  (O4) every feature block carries a Contract line and a Gates line -- a row
       with no binding record or no focused test cannot fill a brief;
  (O5) the index is non-trivial (>= 15 feature blocks).

WHAT THIS DOES **NOT** COVER, stated so the green line cannot imply it:

  * whether a row's CONTENT is right -- who really owns a feature, whether
    the producer/consumer lists are complete.  Prose rots silently; that is
    why every row must also point at machinery (gates, witnesses) that fails
    in the engine when the architecture moves.  This gate keeps the pointers
    live; the pointed-at machinery keeps the claims honest.
  * completeness of the FEATURE list -- a new subsystem does not fail this
    gate; adding its row is part of shipping the subsystem.

SABOTAGE-VERIFIED 2026-08-10; OBSERVED output recorded, not predicted.

Sabotage 1 -- an owner path renamed to a file that does not exist:

    check_ownership_index: FAILED
      O1: `src/thermo/electrolyte/SpeciationSolverX.cpp` (feature T2) does
      not exist

Sabotage 2 -- a witness class not declared in tutorials/WITNESSES:

    check_ownership_index: FAILED
      O3: feature T4 names witness class 'propsBenchX' -- not declared in
      tutorials/WITNESSES
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DOC = os.path.join(ROOT, "docs", "architecture", "ownership-index.md")
WITNESSES = os.path.join(ROOT, "tutorials", "WITNESSES")

fails = []

if not os.path.isfile(DOC):
    print("check_ownership_index: FAILED")
    print("  docs/architecture/ownership-index.md is missing")
    sys.exit(1)

witness_classes = set()
if os.path.isfile(WITNESSES):
    for raw in open(WITNESSES, encoding="utf-8"):
        line = raw.strip()
        if line and not line.startswith("#"):
            parts = line.split()
            if len(parts) == 2:
                witness_classes.add(parts[0])
else:
    fails.append("O3: tutorials/WITNESSES is missing -- witness classes "
                 "cannot be resolved at all")

text = open(DOC, encoding="utf-8").read()

# ---- split into feature blocks: '**X1 — title**' headers -----------------
blocks = re.split(r"\n\*\*([A-Z]+\d+) — ", text)
# blocks[0] = preamble; then alternating (id, body)
features = list(zip(blocks[1::2], blocks[2::2]))

if len(features) < 15:
    fails.append(f"O5: only {len(features)} feature block(s) found -- the "
                 f"index is not the index (expected >= 15)")


def expand_braces(tok):
    """A `Foo.{H,cpp}` token names two files."""
    m = re.match(r"^(.*)\{([^}]*)\}(.*)$", tok)
    if not m:
        return [tok]
    return [m.group(1) + alt + m.group(3) for alt in m.group(2).split(",")]


for fid, body in features:
    # O1: backticked path tokens
    for tok in re.findall(r"`([^`]+)`", body):
        if "/" not in tok:
            continue
        if "<" in tok or "*" in tok or " " in tok:
            continue                      # glob/placeholder/prose, not a path
        #  Only repo-rooted tokens are addresses; `converged/` and
        #  `system/solverDict` are case-structure vocabulary.
        if tok.split("/")[0] not in ("src", "docs", "bin", "data", "gui",
                                     "tutorials", "generated"):
            continue
        base = tok.split("::")[0]         # strip Class::method
        for cand in expand_braces(base):
            p = os.path.join(ROOT, cand)
            if not (os.path.isfile(p) or os.path.isdir(p)):
                fails.append(f"O1: `{cand}` (feature {fid}) does not exist")

    # O2: named gates
    for g in set(re.findall(r"\bcheck_\w+", body)):
        if not os.path.isfile(os.path.join(ROOT, "bin", "curate", g + ".py")):
            fails.append(f"O2: feature {fid} names gate {g} -- no "
                         f"bin/curate/{g}.py")

    # O3 + O4: the per-block required lines
    wm = re.search(r"Witness:\s*`?([A-Za-z]\w*)`?", body)
    if not wm:
        # an absence must be words, not a dash
        if re.search(r"Witness:\s*[-—]\s", body) or "Witness:" not in body:
            fails.append(f"O3: feature {fid} has no Witness line (or a bare "
                         f"dash) -- name a class from tutorials/WITNESSES or "
                         f"state in words why none applies")
    else:
        wc = wm.group(1)
        if wc not in witness_classes:
            fails.append(f"O3: feature {fid} names witness class '{wc}' -- "
                         f"not declared in tutorials/WITNESSES")

    if "Contract:" not in body:
        fails.append(f"O4: feature {fid} has no Contract line -- a row with "
                     f"no binding record cannot fill a brief")
    if "Gates:" not in body:
        fails.append(f"O4: feature {fid} has no Gates line -- a row with no "
                     f"focused test cannot fill a brief")

if fails:
    print("check_ownership_index: FAILED")
    for f in fails:
        print("  " + f)
    sys.exit(1)

print(f"check_ownership_index: OK -- {len(features)} feature block(s); every "
      "backticked path exists, every named gate exists, every witness class "
      "is declared in tutorials/WITNESSES, every block carries Contract and "
      "Gates lines.  NOT COVERED: whether any row's content is RIGHT (the "
      "pointed-at gates and witnesses carry that), and completeness of the "
      "feature list (a new subsystem ships its own row).")
