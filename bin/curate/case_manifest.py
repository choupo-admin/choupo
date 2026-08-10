#!/usr/bin/env python3
"""Generate the CASE MANIFEST + reverse indices -- generated/caseManifest.json.

    bin/curate/case_manifest.py            # regenerate
    bin/curate/case_manifest.py --check    # regenerate in memory, diff

WHAT THIS IS.  The third artefact of the operational memory (Vitor's ruling,
2026-08-10): every case classified by ROLE and by WHAT IT EXERCISES, plus the
inverted indices that answer "which cases use X" -- the question a developer
needs BEFORE editing, and used to need the full regression to answer after.

ROLES (a case may hold several -- the list is NON-EXCLUSIVE, and every flag
derives from an explicit, auditable repository fact; `roles: []` means "no
special-role marker detected", it is NOT an affirmative "tutorial"
classification -- pedagogical intent is not a marker this scan can audit):
  * witness     -- declared in tutorials/WITNESSES (the class rides along);
  * validationOp-- the case runs a `validation {}` op against a measured
                   dataset (the V&V SS3 battery);
  * anchored    -- its `expected` carries anchor rows (published values);
  * expectedFail-- ships `.expect-nonconvergence` (a teaching refusal);
  * knownBroken -- ships `.known-broken`.

WHY THE REVERSE MAP IS INDICES, NOT A FEATURE TABLE.  The ownership index
(docs/architecture/ownership-index.md) already carries feature -> witness ->
gates; duplicating a hand-written feature -> cases table here would be a
second home that rots.  What the manifest adds is the DERIVED half: invert
the per-case facts by unit type, model and op, and a reader intersects.
"Which cases does touching PitzerHMW endanger?" = byModel[pitzerHMW]
(+ byModel[pitzer] if the salt adapter moved too) -- candidates to consider,
never a claim of completeness (runtime dispatch can reach further; that is
what the witness tier and the closure regression are for).

LIMITS, stated so the artefact cannot over-claim:
  * fields come from a TEXTUAL scan of the dicts (the same grammar the
    corpus writes by convention); a computed or unusually formatted dict may
    under-report -- absence of a token here is weak evidence, presence is
    strong;
  * per-case runtime is NOT recorded: runTests does not time cases and this
    script will not run the corpus to measure;
  * membership in an index means the case DECLARES the token, not that
    every code path of that model runs.
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TUT = os.path.join(ROOT, "tutorials")
OUT = os.path.join(ROOT, "generated", "caseManifest.json")


def rel(p):
    return os.path.relpath(p, ROOT)


def read(p):
    try:
        return open(p, encoding="utf-8", errors="replace").read()
    except OSError:
        return ""


def strip_comments(s):
    s = re.sub(r"/\*.*?\*/", " ", s, flags=re.S)
    s = re.sub(r"//[^\n]*", " ", s)
    return s


def witnesses():
    w = {}
    p = os.path.join(TUT, "WITNESSES")
    if os.path.isfile(p):
        for raw in open(p, encoding="utf-8"):
            line = raw.strip()
            if line and not line.startswith("#"):
                parts = line.split()
                if len(parts) == 2:
                    w[parts[1]] = parts[0]        # path -> class
    return w


def scan_case(case_dir, wmap):
    sysd = os.path.join(case_dir, "system")
    const = os.path.join(case_dir, "constant")
    entry = {}

    ctrl = strip_comments(read(os.path.join(sysd, "controlDict")))
    m = re.search(r"^\s*application\s+(\w+)", ctrl, re.M)
    entry["application"] = m.group(1) if m else "unknown"

    fsd = strip_comments(read(os.path.join(sysd, "flowsheetDict")))
    unit_types = sorted(set(re.findall(r"^\s*type\s+(\w+)\s*;", fsd, re.M)))
    if unit_types:
        entry["unitTypes"] = unit_types
    models = sorted(set(re.findall(r"^\s*model\s+(\w+)\s*;", fsd, re.M)))
    if models:
        entry["unitModels"] = models

    props = strip_comments(read(os.path.join(sysd, "propsDict")))
    ops = sorted(set(re.findall(r"^\s*type\s+(\w+)\s*;", props, re.M)))
    if ops:
        entry["ops"] = ops

    thermo = strip_comments(read(os.path.join(const, "thermoPhysPropDict")))
    tp = {}
    for key in ("formulation", "eos", "vaporPressure"):
        m = re.search(rf"^\s*{key}\s+(\w+)\s*;", thermo, re.M)
        if m:
            tp[key] = m.group(1)
    #  activityModel appears as `activityModel X;` and as
    #  `activityModel { model X; ionic Y; molecular Z; }` -- collect all.
    am = set(re.findall(r"activityModel\s+(\w+)\s*;", thermo))
    blk = re.search(r"activityModel\s*\{([^}]*)\}", thermo)
    if blk:
        am |= set(re.findall(r"\b(?:model|ionic|molecular)\s+(\w+)\s*;",
                             blk.group(1)))
    #  per-unit thermo overrides in the flowsheet reach models too, and so
    #  do props ops (`activityModel pitzerHMW;` inside a speciate op) -- the
    #  first draft skipped propsDict and byModel could not answer the very
    #  question the index exists for ("which cases touch PitzerHMW?").
    am |= set(re.findall(r"activityModel\s+(\w+)\s*;", fsd))
    am |= set(re.findall(r"activityModel\s+(\w+)\s*;", props))
    pblk = re.search(r"activityModel\s*\{([^}]*)\}", props)
    if pblk:
        am |= set(re.findall(r"\b(?:model|ionic|molecular)\s+(\w+)\s*;",
                             pblk.group(1)))
    if am:
        tp["activityModels"] = sorted(am)
    #  `equilibrium {}` is the standard wrapper in EVERY thermo dict (the
    #  formulation lives inside it), so flagging it discriminated nothing --
    #  321 of 341 cases, found by M5's cold-brief query.  What discriminates
    #  is declared AQUEOUS CHEMISTRY.
    if re.search(r"\baqueous\s*\{", thermo):
        tp["aqueousChemistry"] = True
    if tp:
        entry["thermo"] = tp

    roles = []
    r = rel(case_dir)
    if r in wmap:
        roles.append("witness")
        entry["witnessClass"] = wmap[r]
    if re.search(r"^\s*validation\s*\{", props, re.M):
        roles.append("validationOp")
    exp = read(os.path.join(case_dir, "expected"))
    if re.search(r"^\s*\w+.*\banchor\s*$", exp, re.M):
        roles.append("anchored")
    if os.path.isfile(os.path.join(case_dir, ".expect-nonconvergence")):
        roles.append("expectedFail")
    if os.path.isfile(os.path.join(case_dir, ".known-broken")):
        roles.append("knownBroken")
    #  [] = no special-role marker detected (auditable markers only);
    #  NOT an affirmative "tutorial" classification.
    entry["roles"] = roles
    entry["hasGolden"] = bool(exp)
    return entry


def build():
    wmap = witnesses()
    cases = {}
    for dirpath, dirs, files in os.walk(TUT):
        if os.path.basename(dirpath) == "system" and "controlDict" in files:
            case_dir = os.path.dirname(dirpath)
            cases[rel(case_dir)] = scan_case(case_dir, wmap)
            dirs[:] = []
    cases = dict(sorted(cases.items()))

    by_unit, by_model, by_op, by_app = {}, {}, {}, {}
    for path, e in cases.items():
        by_app.setdefault(e["application"], []).append(path)
        for t in e.get("unitTypes", []):
            by_unit.setdefault(t, []).append(path)
        for t in e.get("ops", []):
            by_op.setdefault(t, []).append(path)
        th = e.get("thermo", {})
        for mdl in th.get("activityModels", []) + \
                ([th["eos"]] if "eos" in th else []):
            by_model.setdefault(mdl, []).append(path)

    return {
        "_generated_by": "bin/curate/case_manifest.py -- DO NOT EDIT",
        "limitations": {
            "scan": "textual dict scan; absence of a token is weak "
                    "evidence, presence is strong -- live example: "
                    "pitzer_hmw_hot_agreement exercises pitzerHMW through "
                    "the speciate op's engine selection without declaring "
                    "the token in any dict, so byModel[pitzerHMW] does not "
                    "list it",
            "indices": "membership = the case DECLARES the token; candidates"
                       " to consider, never completeness -- runtime dispatch"
                       " can reach further (witness tier + closure regression"
                       " cover that)",
            "runtime": "not recorded; runTests does not time per case and "
                       "this script does not run the corpus",
        },
        "counts": {"cases": len(cases),
                   "witnesses": sum(1 for e in cases.values()
                                    if "witness" in e["roles"]),
                   "validationOp": sum(1 for e in cases.values()
                                       if "validationOp" in e["roles"]),
                   "anchored": sum(1 for e in cases.values()
                                   if "anchored" in e["roles"])},
        "cases": cases,
        "indices": {"byApplication": {k: sorted(v) for k, v
                                      in sorted(by_app.items())},
                    "byUnitType": {k: sorted(v) for k, v
                                   in sorted(by_unit.items())},
                    "byModel": {k: sorted(v) for k, v
                                in sorted(by_model.items())},
                    "byOp": {k: sorted(v) for k, v
                             in sorted(by_op.items())}},
    }


def main():
    m = build()
    payload = json.dumps(m, indent=1) + "\n"
    if "--check" in sys.argv:
        if not os.path.isfile(OUT) or open(OUT, encoding="utf-8").read() != payload:
            print("case_manifest --check: STALE -- regenerate with "
                  "bin/curate/case_manifest.py")
            sys.exit(1)
        c = m["counts"]
        print(f"case_manifest --check: OK -- {c['cases']} cases "
              f"({c['witnesses']} witnesses, {c['validationOp']} "
              f"validation-op, {c['anchored']} anchored) match the tree")
        return
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w", encoding="utf-8").write(payload)
    c = m["counts"]
    print(f"wrote {rel(OUT)}: {c['cases']} cases, {c['witnesses']} "
          f"witnesses, {c['validationOp']} validation-op, {c['anchored']} "
          f"anchored; indices over {len(m['indices']['byUnitType'])} unit "
          f"types, {len(m['indices']['byModel'])} models, "
          f"{len(m['indices']['byOp'])} ops")


if __name__ == "__main__":
    main()
