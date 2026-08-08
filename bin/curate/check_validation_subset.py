#!/usr/bin/env python3
"""Gate: the named validation subset is RECOUNTED, never remembered.

    bin/curate/check_validation_subset.py

WHY THIS EXISTS.  Found 2026-08-08, on the validation loop's FIRST iteration:
the planned first case (Pitzer NaCl gamma/phi against Hamer & Wu) already
existed in the corpus -- six salts, AAD KPIs, an honesty note about the refit
LiCl arm -- and verification-and-validation.md SS3 did not name it.  The
governing document called the subset "small and named" while enumerating
seven cases and omitting a property-surface battery of eight.  Every
project-level assessment of the "validation deficit" (including the ~15 %
axis reading ratified the same day) inherited the undercount.  A list
consulted as an authority answers wrongly with authority -- the decision
index's lesson, replayed on the V&V doc.

WHAT THIS CHECKS.
  (a) COMPLETENESS: every case whose propsDict carries a `validation {}` op
      with a measured (non-synthetic) dataset appears in SS3 by name.  This is
      the arm that would have caught the original omission.
  (b) EXISTENCE: every case SS3 names exists on disk -- a renamed or deleted
      case may not survive as a phantom row.
  (c) NO SYNTHETIC ANCHORS: a dataset whose filename says `synthetic` is a
      teaching surrogate; SS3 may never cite one as validation.
  (d) FIT-CONSISTENCY IS MARKED: the cases whose own headers say their
      parameters were fit to the very table they are checked against
      (farelo_licl_range; pitzer_nacl_sp77_hot; the hamer_wu LiCl arm) must
      carry the words "fit-consistency" in their SS3 row.  Quoting a
      fit-consistency check as independent validation inflates exactly the
      claim the V&V doc exists to deflate.

WHAT THIS DOES NOT CHECK, said plainly:
  * WHETHER AN ANCHOR IS RIGHT.  It verifies enumeration and labelling, not
    that any case's numbers agree with its dataset -- that is each case's own
    golden and AAD KPIs.
  * ANCHORED-GOLDEN cases (a published number carried in `expected` with the
    provenance in the header, no `validation {}` op) are found only if
    hand-listed in SS3; arm (a) cannot see them.  The remedy when adding one
    is the op mechanism, which is detectable.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOC = ROOT / "docs" / "architecture" / "verification-and-validation.md"

FIT_CONSISTENCY = ["farelo_licl_range", "pitzer_nacl_sp77_hot", "pitzer01_nacl"]


def main() -> int:
    fail = []
    if not DOC.is_file():
        print("check_validation_subset: FAILED\n  the V&V document is missing")
        return 1
    doc = DOC.read_text()
    m = re.search(r'## 3\..*?(?=\n## )', doc, re.S)
    if not m:
        print("check_validation_subset: FAILED\n  V&V has no SS3 section -- "
              "the named subset this gate recounts has no home")
        return 1
    sec = m.group(0)

    # (a) completeness: validation-op cases with measured datasets
    op_cases = []
    for pd in (ROOT / "tutorials").rglob("system/propsDict"):
        text = pd.read_text()
        if not re.search(r'\bvalidation\s*\{', text):
            continue
        datasets = re.findall(r'dataset\s+"([^"]+)"', text)
        if datasets and all("synthetic" in d for d in datasets):
            continue
        op_cases.append(pd.parent.parent)
    for case in op_cases:
        if case.name not in sec:
            fail.append(
                f"{case.relative_to(ROOT)} carries a `validation {{}}` op "
                "with a measured dataset and is NOT named in V&V SS3 -- the "
                "exact omission this gate was built after.")

    # (b) existence of every named case
    for name in re.findall(r'`(?:tutorials/)?((?:steady|ctrl|props|plant|batch)/[\w/]+)`', sec):
        if not (ROOT / "tutorials" / name).is_dir():
            fail.append(f"SS3 names `{name}` and no such case exists -- a "
                        "phantom row in the subset the document calls named")

    # (c) no synthetic anchors
    if re.search(r'\w*synthetic\w*\.dat', sec):
        fail.append("SS3 cites a *synthetic* dataset as a validation anchor "
                    "-- teaching surrogates may never carry that claim")

    # (d) fit-consistency marked
    for case in FIT_CONSISTENCY:
        row = next((l for l in sec.splitlines() if case in l), "")
        if row and "fit-consistency" not in row:
            fail.append(
                f"SS3's row for {case} does not say 'fit-consistency', but "
                "the case's own header says its parameters were fit to the "
                "table it is checked against.  Independence may not be "
                "implied where the case itself disclaims it.")
        if not row:
            fail.append(f"{case} is a known fit-consistency case and has no "
                        "SS3 row at all -- it left the table without its "
                        "classification going with it")

    if fail:
        print("check_validation_subset: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    print(
        "check_validation_subset: OK -- all "
        f"{len(op_cases)} validation-op case(s) with measured datasets are "
        "named in V&V SS3, every named case exists on disk, no synthetic "
        "dataset is cited as an anchor, and the known fit-consistency cases "
        f"({', '.join(FIT_CONSISTENCY)}, plus the hamer_wu LiCl arm in its "
        "row) are labelled as such rather than counted as independent.  NOT "
        "CHECKED: whether any anchor is RIGHT (that is each case's own AAD "
        "and golden), and anchored-golden cases without a validation op are "
        "visible to this gate only through their hand-listed rows.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
