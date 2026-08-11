#!/usr/bin/env python3
"""Gate: the evidence vocabulary has ONE home, and the GUI never strengthens it.

    bin/curate/check_verdict_parity.py

WHY THIS EXISTS.  On 2026-08-11 the Component Inspector began drawing the
curation dossier's verdict in its coverage table, and to do that it declared
the five verdicts a SECOND time, in TypeScript:

    src/propertyOps/CurationDossier.cpp   verdictOf() -- the authority
    gui/src/case/componentRecord.ts       type CurationVerdict -- the copy
    gui/src/ui/explore/ComponentInspector.tsx   VERDICT{} -- the rendering

That is a scientific vocabulary with three homes, and the GUI tests could not
catch a divergence because they check TypeScript against TypeScript.  Vitor
asked the right question -- is the correspondence gated, or are we now
maintaining the same five-value vocabulary independently? -- and the answer was
that it was not.  This gate is the answer, and it is deliberately the smallest
one available: the project's own remedy for a fact with two homes is a gate
that RECOUNTS, never a generator.  No code is emitted; the three files stay
hand-written, and they may not disagree.

THE DOCTRINE IT PROTECTS (Vitor, 2026-08-11):

    The GUI may display scientific claims made by the evidence machinery;
    it may not infer stronger claims from apparently good data.

A sixth value invented in TypeScript would be exactly that inference: a
classification the engine never made, rendered as though it had.  Equally, a
verdict RETIRED in C++ and left standing in the GUI would render a claim the
engine can no longer produce.  Both directions fail here.

WHAT THIS GATE CHECKS.

  (a) SET PARITY, three ways.  The literals returned by verdictOf(), the
      members of the TS union, and the keys of the renderer's table must be
      the SAME set.  Checked in both directions, because the two failures are
      different lies: a value only in C++ is a verdict the GUI cannot draw
      (it would fall through to undefined); a value only in TS is a verdict
      the GUI can claim and the engine cannot make.

  (b) COMPARISON IS NOT HELD-OUT VALIDATION.  A pre-existing `validation {}`
      surface compares curated parameters against a dataset, and nothing there
      proves the dataset was excluded from the fit being assessed.  That
      operation is scientifically useful and is NOT being renamed.  But the
      phrase "HELD-OUT VALIDATION" makes a strictly stronger claim -- that the
      data were withheld -- so it may appear ONLY where an EvidencePartition
      is in scope to have withheld them.  This arm greps for the phrase and
      requires the same file to reach the partition.

WHAT THIS GATE DOES NOT CHECK.  It does not read the JSON the dossier writes,
so a verdict correctly spelled in all three files but written to the dossier
under a fourth name would pass here.  It also says nothing about whether a
verdict is CORRECT for a given fit -- that is check_evidence_partition's arm.
Stated because a gate that implies more coverage than it has is worse than one
that reports less.

Exit 1 listing the disagreements."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CPP = ROOT / "src" / "propertyOps" / "CurationDossier.cpp"
TS_UNION = ROOT / "gui" / "src" / "case" / "componentRecord.ts"
TS_RENDER = ROOT / "gui" / "src" / "ui" / "explore" / "ComponentInspector.tsx"

#  Files allowed to say "HELD-OUT VALIDATION": each must ALSO reach an
#  EvidencePartition, which is what makes the claim true rather than a label.
PARTITION_MARK = re.compile(r"EvidencePartition|\bpart\.(fit|validation|engaged)")


def cpp_verdicts(text: str) -> set:
    """Every string literal verdictOf() can return.

    Scoped to the function body -- the header's prose lists the same five
    names in a comment, and harvesting THAT would make the gate compare a
    docstring with itself.  Inside the body EVERY literal is a verdict (the
    only other text is a comment, which is stripped), so the harvest is
    literal-based rather than shaped around today's control flow: the first
    version keyed on `return "..."` and silently lost `validated`, which is
    returned from a ternary.  A harvest that depends on how the branches are
    written breaks the day someone rewrites them, which is precisely when a
    parity gate is most needed."""
    m = re.search(r"verdictOf\s*\([^)]*\)[^{]*\{(.*?)\n\}", text, re.S)
    if not m:
        return set()
    body = re.sub(r"//[^\n]*", "", m.group(1))
    return set(re.findall(r'"([A-Za-z]+)"', body))


def ts_union(text: str) -> set:
    m = re.search(r"export type CurationVerdict\s*=(.*?);", text, re.S)
    return set(re.findall(r'"([A-Za-z]+)"', m.group(1))) if m else set()


def ts_render_keys(text: str) -> set:
    m = re.search(r"const VERDICT\s*:[^=]*=\s*\{(.*?)\n\};", text, re.S)
    return set(re.findall(r"^\s*([A-Za-z]+)\s*:\s*\{", m.group(1), re.M)) if m else set()


def main() -> int:
    failures = []

    cpp = cpp_verdicts(CPP.read_text())
    union = ts_union(TS_UNION.read_text())
    render = ts_render_keys(TS_RENDER.read_text())

    #  An empty harvest is a gate that cannot run, and a check that cannot run
    #  must not pass (the check_true_ions lesson, 2026-08-05).
    for label, got, path in (("verdictOf()", cpp, CPP),
                             ("CurationVerdict union", union, TS_UNION),
                             ("VERDICT renderer table", render, TS_RENDER)):
        if not got:
            failures.append(
                f"harvested NOTHING from {label} ({path.relative_to(ROOT)}) -- "
                f"the shape it is parsed from has changed, so this gate is "
                f"blind rather than satisfied")

    if not failures:
        if cpp != union:
            failures.append(
                f"verdictOf() and the TS union disagree: "
                f"only in C++ {sorted(cpp - union) or '-'}, "
                f"only in TS {sorted(union - cpp) or '-'}.  A verdict only in "
                f"C++ cannot be drawn; a verdict only in TS is a claim the "
                f"engine cannot make.")
        if union != render:
            failures.append(
                f"the TS union and the renderer table disagree: "
                f"only in the union {sorted(union - render) or '-'}, "
                f"only in the table {sorted(render - union) or '-'}.  A union "
                f"member with no row renders as undefined.")

    #  (b) the phrase that makes the stronger claim
    for path in sorted((ROOT / "src").rglob("*.cpp")) + sorted((ROOT / "src").rglob("*.H")):
        text = path.read_text(errors="ignore")
        if "HELD-OUT VALIDATION" not in text.upper():
            continue
        if not PARTITION_MARK.search(text):
            failures.append(
                f"{path.relative_to(ROOT)} prints \"HELD-OUT VALIDATION\" but "
                f"never reaches an EvidencePartition.  Comparison asks whether "
                f"a model agrees with data; held-out validation additionally "
                f"proves those data were excluded from the fit being assessed. "
                f"Without the partition nothing withheld them, so the phrase "
                f"claims more than the code did.")

    if failures:
        print("check_verdict_parity: FAILED")
        for f in failures:
            print("  " + f)
        return 1

    print(f"check_verdict_parity: OK -- the {len(cpp)} curation verdicts "
          f"({', '.join(sorted(cpp))}) are spelled identically in "
          f"CurationDossier.cpp, the TS union and the renderer table; every "
          f"\"HELD-OUT VALIDATION\" in src/ sits where a partition withheld "
          f"the data.  Does NOT check the dossier's written JSON, nor whether "
          f"a verdict is correct for a given fit.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
