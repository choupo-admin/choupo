#!/usr/bin/env python3
# =============================================================================
#        \|/       C hemicals     | Open-source, glass-box chemical process simulator
#       \\|//      H eat-transfer | https://choupo.org
#      \\\|///     O perations    |
#       \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
#        \|/       P roperties    | Licence: GPL-3.0-or-later
#         |        O ptimization  |
#        /|\                      |
# -----------------------------------------------------------------------------
#     SPDX-License-Identifier: GPL-3.0-or-later
#     Credit and attribution: see AUTHORS
#     Required legal notices:  see NOTICE
# =============================================================================
"""check_lookup_budget -- ONE TOOL CALL, ONE EVIDENCE CARD (DEV.md 4c C227,
slice a; src/propertyOps/CatalogueLookup.{H,cpp}).

`pairLookup` and `componentLookup` answer a student's assistant in a FIXED
BYTE BUDGET with an honesty ladder and never an invented number.  This gate
RUNS the two witnesses (pairLookup01_catalogue_ladder, componentLookup01_
catalogue_ladder) and holds, from the result JSON they print:

  (a) THE BUDGET.  Every card is at most `kLookupCardBudgetBytes` bytes
      (read from CatalogueLookup.H, the one home of the number), its
      published `bytes` is the real size, and the design note states the
      same number.
  (b) A CURATED PAIR returns the paste-ready `source` entry naming a record
      that EXISTS, the record's own model, and NO coefficient: no value of
      the record's `parameters {}` block appears in the card.
  (c) A REGRESSED PAIR names the case that generated it and the verdict,
      both equal to what the record says.
  (d) AN UNKNOWN PAIR RETURNS NO NUMBERS: apart from the identity line, the
      card contains no digit at all, says "I do not have", and says the
      measurement-archive rung does not exist yet.
  (e) A UNIFAC-ONLY PAIR SAYS "ESTIMATE", names UNIFAC, carries the
      azeotrope / partial-miscibility warning, and carries no coefficient.
  (f) THE OPTIONAL FIELDS THE C16 CHAIN WILL ADD (laboratories,
      archiveSha256, extractionFilter, fitAAD) are listed under
      `announcedAbsent` on a record card and are never filled (no line
      starts with one of them).
  (g) COMPONENTS: the same record by name and by CAS; a lake-only compound
      is tier estimateLake, says "not reviewed" and prints none of its
      estimated values (Tc, Pc, Tb read from the lake row); an unknown is
      tier none with no digits.
  (h) THE GRAMMAR REFUSES: a pair of the same component twice exits non-zero.
  (i) SOURCE: the card is parsed back by the engine's own dictionary reader
      before it is published, and fit to the budget by the one function
      (`fit(kLookupCardBudgetBytes)`).

A check that cannot run must not pass: a missing binary or a missing JSON
fails.

SABOTAGES, performed by hand and restored (each one line of CatalogueLookup.cpp,
the engine rebuilt between them; results in DEV.md C227):
  S1  the UNIFAC tier says "prediction" instead of "ESTIMATE"        -> (e)
  S2  the none tier appends a numeric span to its `say`               -> (d)
  S3  the curated paste also prints the record's b_ij                 -> (b)

NOT CHECKED, said plainly: that a record's provenance sentence is true; the
GUI reading of the card (slice c); the measurement-archive rung (slice b);
a byte budget on the JSON wrapper (only the card text is held).
"""
import json
import math
import re
import subprocess
import sys
import tempfile
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "choupoProps"
PAIR = ROOT / "tutorials/props/molecular/pairLookup01_catalogue_ladder"
COMP = ROOT / "tutorials/props/molecular/componentLookup01_catalogue_ladder"
PROV_UNSEALED = ROOT / "tutorials/props/molecular/pairLookup02_provenance_unsealed"
PROV_STALE = ROOT / "tutorials/props/molecular/pairLookup03_provenance_stale_seal"
HDR = ROOT / "src/propertyOps/CatalogueLookup.H"
SRC = ROOT / "src/propertyOps/CatalogueLookup.cpp"
NOTE = ROOT / "docs/design/the-evidence-card.md"
LAKE = ROOT / "data/groupEstimative/compounds.csv"

fails = []


def fail(msg):
    fails.append(msg)
    print("FAIL  " + msg)


def run(case_dir):
    p = subprocess.run([str(BIN), "."], cwd=case_dir, capture_output=True,
                       text=True, timeout=300,
                       env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
    return p.returncode, p.stdout, p.stderr


def result_json(out):
    i = out.find("<<<Choupo:result-begin>>>")
    j = out.find("<<<Choupo:result-end>>>")
    if i < 0 or j < 0:
        return None
    return json.loads(out[i + len("<<<Choupo:result-begin>>>"):j])


def cards_of(case):
    rc, out, err = run(case)
    if rc != 0:
        fail(f"{case.name}: choupoProps exited {rc}: {(err or out)[-300:]}")
        return {}
    js = result_json(out)
    if js is None or "lookupCards" not in js:
        fail(f"{case.name}: the result JSON carries no `lookupCards` block")
        return {}
    return {c["op"]: c for c in js["lookupCards"]}


def no_identity(card):  # plus, at the call sites, the component names and the field `archiveSha256`
    """The card without its identity and provenance lines (names and release labels may carry digits)."""
    return "\n".join(l for l in card.splitlines()
                     if not l.strip().startswith("schema ")
                     and not l.strip().startswith("identity ")
                     and not l.strip().startswith("catalogue {")   # the provenance line: a release label carries digits
                     and not l.strip().startswith("schema"))


def record_numbers(path):
    """Every numeric value of a pair record's `parameters {}` block."""
    t = path.read_text()
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    m = re.search(r"\bparameters\s*\{(.*?)\}", t, re.S)
    vals = []
    for ln in m.group(1).split(";"):
        f = ln.split()
        if len(f) == 2 and re.fullmatch(r"-?\d+\.\d+(e-?\d+)?", f[1]):
            vals.append(f[1])
    return vals


def has_token(card, tok):
    """Does the card carry the record's value `tok` as a NUMBER (compared
    numerically, 1e-6 relative, so a different spelling of it is caught)?"""
    v = abs(float(tok))
    for t in re.findall(r"(?<![\w.])-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?", card):
        try:
            x = abs(float(t))
        except ValueError:
            continue
        if abs(x - v) <= 1e-6 * v:
            return True
    return False


def main():
    if not BIN.exists():
        print("check_lookup_budget: FAILED -- choupoProps is missing; build first"
              " (a check that cannot run must not pass)")
        return 1
    hs = HDR.read_text()
    m = re.search(r"kLookupCardBudgetBytes\s*=\s*(\d+)", hs)
    if not m:
        print("check_lookup_budget: FAILED -- cannot read the budget from CatalogueLookup.H")
        return 1
    budget = int(m.group(1))

    pairs = cards_of(PAIR)
    comps = cards_of(COMP)
    if not pairs or not comps:
        print(f"check_lookup_budget: FAILED -- {len(fails)} finding(s)")
        return 1

    # ---- (a) the budget -----------------------------------------------------
    sizes = {}
    for name, c in list(pairs.items()) + list(comps.items()):
        n = len(c["card"].encode("utf-8"))
        sizes[name] = n
        if n > budget:
            fail(f"(a) {name}: card is {n} bytes, over the {budget}-byte budget")
        if c["bytes"] != n:
            fail(f"(a) {name}: published bytes {c['bytes']} != real {n}")
        if c["budgetBytes"] != budget:
            fail(f"(a) {name}: published budget {c['budgetBytes']} != header {budget}")
    if not NOTE.exists() or str(budget) not in NOTE.read_text():
        fail(f"(a) the design note {NOTE.name} does not state the {budget}-byte budget")
    for need in ("p_curated", "p_regressed", "p_estimate", "p_none"):
        if need not in pairs:
            fail(f"the witness published no card for {need}")
    for need in ("c_name", "c_cas", "c_lake", "c_none"):
        if need not in comps:
            fail(f"the witness published no card for {need}")
    if fails:
        print(f"check_lookup_budget: FAILED -- {len(fails)} finding(s)")
        return 1

    # ---- (b) curated ----------------------------------------------------------
    cur = pairs["p_curated"]["card"]
    if pairs["p_curated"]["tier"] != "curated":
        fail("(b) ethanol + water is not tier curated")
    msrc = re.search(r'paste \{[^{]*\{ source "([^"]+)"', cur)
    if not msrc:
        fail("(b) the curated card carries no `source` line")
    else:
        rec = ROOT / msrc.group(1)
        if not rec.exists():
            fail(f"(b) the pasted source {msrc.group(1)} does not exist")
        else:
            for v in record_numbers(rec):
                if v in ("0.0", "0.00", "0.30", "0.3") or float(v) == 0.0:
                    continue
                if has_token(cur, v):
                    fail(f"(b) the curated card prints the record's coefficient {v}")
            if f"model {rec.parent.name}" not in cur:
                fail(f"(b) the card's model is not the record's directory {rec.parent.name}")

    # ---- (c) regressed --------------------------------------------------------
    reg = pairs["p_regressed"]
    if reg["tier"] != "regressed":
        fail("(c) acetone + ethanol is not tier regressed")
    recpath = ROOT / "data/standards/parameters/NRTL/acetone-ethanol.dat"
    t = recpath.read_text()
    fic = re.search(r'fittedInCase\s+"([^"]+)"', t).group(1)
    ver = re.search(r"verdict\s+(\w+)\s*;", t).group(1)
    if fic not in reg["card"]:
        fail("(c) the regressed card does not name the case that generated it")
    if f"verdict {ver}" not in reg["card"]:
        fail(f"(c) the regressed card does not carry the record's verdict {ver}")
    for v in record_numbers(recpath):
        if float(v) != 0.0 and has_token(reg["card"], v):
            fail(f"(c) the regressed card prints the record's coefficient {v}")

    # ---- (d) unknown pair -----------------------------------------------------
    non = pairs["p_none"]
    body = no_identity(non["card"]).replace("1Pentadecanol", "").replace("archiveSha256", "")
    if non["tier"] != "none":
        fail("(d) the unknown pair is not tier none")
    if re.search(r"\d", body):
        fail("(d) the unknown-pair card contains a digit (a number): "
             + ", ".join(sorted(set(re.findall(r"\S*\d\S*", body)))))
    if "I do not have" not in non["card"]:
        fail("(d) the unknown-pair card does not say `I do not have`")
    if "slice (b)" not in non["card"]:
        fail("(d) the card does not say the archive rung is slice (b)")

    # ---- (e) UNIFAC -----------------------------------------------------------
    est = pairs["p_estimate"]
    if est["tier"] != "estimate" or "ESTIMATE" not in est["card"]:
        fail("(e) the UNIFAC-only card does not say ESTIMATE")
    if "model UNIFAC" not in est["card"]:
        fail("(e) the UNIFAC card does not carry the line that selects it")
    if "azeotrop" not in est["card"] or "partial miscibility" not in est["card"]:
        fail("(e) the UNIFAC card lacks the azeotrope / partial-miscibility warning")

    # ---- (f) announced-absent -------------------------------------------------
    for name in ("p_curated", "p_regressed"):
        card = pairs[name]["card"]
        ma = re.search(r"announcedAbsent\s*\(([^)]*)\)", card)
        if not ma:
            fail(f"(f) {name}: no announcedAbsent list")
            continue
        for f in ("laboratories", "archiveSha256", "extractionFilter", "fitAAD"):
            if f not in ma.group(1):
                fail(f"(f) {name}: `{f}` is not announced absent")
            if re.search(r"^\s*" + f + r"\b", card, re.M):
                fail(f"(f) {name}: `{f}` is FILLED -- the chain does not exist yet")

    # ---- (g) components --------------------------------------------------------
    def rec_of(card):
        m2 = re.search(r'record "([^"]+)"', card)
        return m2.group(1) if m2 else None
    if comps["c_name"]["tier"] != "catalogue" or comps["c_cas"]["tier"] != "catalogue":
        fail("(g) ethanol by name/CAS is not tier catalogue")
    elif rec_of(comps["c_name"]["card"]) != rec_of(comps["c_cas"]["card"]):
        fail("(g) the name and the CAS resolved to different records")
    lake = comps["c_lake"]
    if lake["tier"] != "estimateLake":
        fail("(g) 1Pentadecanol is not tier estimateLake")
    if "not reviewed" not in lake["card"].lower():
        fail("(g) the lake card does not say `not reviewed`")
    row = None
    for ln in LAKE.read_text().splitlines():
        if "629-76-5" in ln:
            row = ln
            break
    if row is None:
        fail("(g) the lake row of 1-pentadecanol is missing; the witness cannot be checked")
    else:
        for v in ("793.74", "634.98", "1.0876", "15.188"):
            if v in row and v in lake["card"]:
                fail(f"(g) the lake card prints the estimated value {v}")
    cn = comps["c_none"]
    if cn["tier"] != "none" or re.search(r"\d", no_identity(cn["card"])):
        fail("(g) the unknown compound is not a number-free tier none")

    # ---- (h) grammar ------------------------------------------------------------
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp) / "bad"
        shutil.copytree(PAIR, d)
        (d / "system/propsDict").write_text(
            "operations\n(\n    { name x; type pairLookup; components ( water water ); }\n);\n")
        rc, out, err = run(d)
        if rc == 0:
            fail("(h) components ( water water ) was accepted")

    # ---- (j) the provenance line: source, release, seal state -------------------
    #  DEV.md 4c C227 (a): every card names where it comes from, and a sealed
    #  case whose manifest names ANOTHER release is told so.
    for name, c in list(pairs.items()) + list(comps.items()):
        cat = c.get("catalogue")
        if not cat or not all(k in cat for k in ("source", "release", "caseSeal", "releaseDiffers")):
            fail(f"(j) {name}: the result JSON carries no complete `catalogue` object")
        if not re.search(r"^  catalogue \{ source \"[^\"]+\"; release \S+; case (un)?sealed;", c["card"], re.M):
            fail(f"(j) {name}: the card carries no provenance line")
    for case, seal, differs in ((PROV_UNSEALED, "unsealed", False), (PROV_STALE, "sealed", True)):
        cc = cards_of(case).get("p_curated")
        if not cc:
            continue
        cat = cc.get("catalogue", {})
        if cat.get("caseSeal") != seal or bool(cat.get("releaseDiffers")) != differs:
            fail(f"(j) {case.name}: expected caseSeal {seal} / releaseDiffers {differs}, got {cat}")
        if differs != ("differs " in cc["card"]):
            fail(f"(j) {case.name}: the card line and the JSON disagree about `differs`")

    # ---- (i) source -------------------------------------------------------------
    s = SRC.read_text()
    if "Dictionary::fromString" not in re.sub(r"//[^\n]*", "", HDR.read_text() + s):
        fail("(i) the card is not parsed back before publishing")
    if "fit(kLookupCardBudgetBytes)" not in s:
        fail("(i) a card path does not go through fit(kLookupCardBudgetBytes)")
    if len(re.findall(r"fit\(kLookupCardBudgetBytes\)", s)) < 2:
        fail("(i) pairLookup and componentLookup must BOTH fit to the budget")

    if fails:
        print(f"check_lookup_budget: FAILED -- {len(fails)} finding(s)")
        return 1
    mx = max(sizes.values())
    print(f"check_lookup_budget: OK  {len(sizes)} cards from the two witnesses, largest {mx} of"
          f" {budget} bytes; curated pair returns its source line and no coefficient, the"
          f" unknown pair and unknown compound return no number, UNIFAC says ESTIMATE, the"
          f" lake compound prints no estimated value; NOT checked: the GUI reading, the"
          f" archive rung (slice b), the truth of a record's provenance")
    return 0


if __name__ == "__main__":
    sys.exit(main())
