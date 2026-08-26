#!/usr/bin/env python3
"""Gate: the ChemSep UNIFAC key is DERIVED, and nothing partial is written.

    bin/curate/check_unifac_key.py

WHY THIS EXISTS.  ChemSep gives a compound's UNIFAC decomposition as subgroup
IDS; Choupo names its subgroups.  Nothing in the ChemSep distribution carries
the key -- so the tempting move is to write the classic Fredenslund numbering
from memory.  It is wrong: ChemSep numbers water 17 and methanol 16 where the
classic table has 16 and 15.  A remembered key maps ethanol's OH onto a
neighbouring group and yields an activity coefficient that looks perfectly
reasonable.  There is no symptom, no crash, and no golden that moves --
UNIFAC answers for whatever molecule it is handed.

`bin/curate/unifac_key.py` therefore SOLVES the key from the 40 components
the curated catalogue and ChemSep both describe, matched by CAS.  This gate
guards two things about that: that it stays derived, and that its
INCOMPLETENESS stays honest.

WHAT THIS GATE CHECKS.

  (a) THE KEY HAS ONE HOME AND IS RECOMPUTED.  No `check_*`, no importer and
      no data file may carry a literal id -> name table.  A derived fact with
      a second home is the arity sin, and a stale key is undetectable: it
      still produces a decomposition.

  (b) THE DERIVATION IS SELF-CONSISTENT.  Zero contradictions across the
      overlap, and the solved key REPRODUCES every one of the curated
      decompositions it was solved from -- re-checked here from the records
      rather than trusted from the solver's own report.

  (c) EVERY WRITTEN BLOCK ROUND-TRIPS.  Each imported record carrying a
      `groups { unifac ( ... ) }` block is translated back to ids through the
      key and must equal, exactly and with counts, what ChemSep states for
      that CAS.  This is the arm with teeth: a corrupted key entry shows up
      here on every component that uses it.

  (d) NOTHING PARTIAL WAS WRITTEN.  A decomposition missing one subgroup is
      not partial information -- it is a DIFFERENT MOLECULE.  Every imported
      record either carries ALL of ChemSep's subgroups or none at all, and
      the ones ChemSep describes but the key cannot decode carry no block.

  (e) THE VOCABULARY IS THE CATALOGUE'S.  Every group name written appears in
      the curated catalogue's own `unifac` blocks.  This arm needs no
      archive, so it is the one that still runs on a clean checkout.

  (f) UNIFAC ACTUALLY RUNS on an imported component, and its gamma goes to 1
      in that component's own pure limit.  A block the engine cannot read is
      decoration.

WHAT THIS GATE DOES **NOT** COVER.  It does not check that the CURATED
decompositions are right -- it inherits them, which is the intent: the
catalogue is the one home for what a group name means here.  It does not
check ChemSep's decompositions either.  It says nothing about the 53
undetermined ids beyond that they were correctly refused, and nothing about
UnifacLLE or ModifiedUnifac, which use different subgroup sets and are not
imported.  And gamma going to 1 in a pure limit is a sanity check on the
plumbing, NOT a validation of any activity coefficient against measurement.

WITH NO ARCHIVE (the clean-checkout case: thirdParty/ is gitignored) arms
(b), (c) and (d) cannot run.  They are then reported as NOT RUN rather than
passed -- a check that cannot run must not pass -- and (a), (e) and (f) still
do.

SABOTAGE-VERIFIED 2026-08-26, four times; OBSERVED output below, verbatim.

S1 -- one key entry corrupted, id 15 keyed onto `CH3OH` instead of `OH` (the
neighbouring group, which is exactly the error a remembered numbering makes):

    - the derivation contradicts itself: ethanol: id 15 is keyed to `CH3OH`, which the ChemSep record uses 1 times and the curated record None times
    - the key does not reproduce the curated decomposition it was solved from (ethanol): decoded {'CH3': 1, 'CH2': 1, 'CH3OH': 1} vs curated {'CH3': 1, 'CH2': 1}
    - 1Heptanol declares group(s) ['OH'] the derived key does not contain
    ... 20 lines, every alcohol in the tree

S2 -- a PARTIAL decomposition written, 1-heptanol's OH silently dropped.  THE
ONE THAT MATTERS: nothing about `CH3 + 6 CH2` looks wrong, UNIFAC answers for
it without complaint, and the answer is heptane's:

    - 1Heptanol: the written block decodes to {1: 1, 2: 6} but ChemSep states {1: 1, 2: 6, 15: 1} -- the key and the records disagree

S3 -- the derivation's IMPORT_MARK exclusion removed, so it counts its own
output as evidence.  This is not hypothetical: it is what the first version
did, and the gate's first green line said "solved from 232 components" where
the overlap is 40:

    - the key was solved partly from isopropanol, a record this importer WROTE -- evidence must be independent of what it is used to produce, or a corrupted block reinforces a corrupted key
    ... 20+ lines

S4 -- an invented group name (`OHX`) written into a record, caught by two
independent arms, one of which needs no archive:

    - 1Heptanol declares UNIFAC group `OHX`, which no curated component uses -- the vocabulary must be the catalogue's, never invented by the importer
    - 1Heptanol declares group(s) ['OHX'] the derived key does not contain
"""

import importlib.util
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMP = ROOT / "data" / "standards" / "components"
BUILD = ROOT / "build" / "linux64Gcc"
XML = ROOT / "thirdParty" / "chemsep" / "chemsep1.xml"
MARK = 'importedBy    "chemsep_to_choupo"'

spec = importlib.util.spec_from_file_location(
    "unifac_key", Path(__file__).with_name("unifac_key.py"))
UK = importlib.util.module_from_spec(spec)
spec.loader.exec_module(UK)


def groups_of(text):
    m = re.search(r"\bunifac\s*\((.*?)\)\s*;", text, re.S)
    if not m:
        return None
    return {gm.group(1): int(gm.group(2)) for gm in re.finditer(
        r"\{\s*group\s+(\S+?)\s*;\s*count\s+(\d+)\s*;\s*\}", m.group(1))}


def cas_of(text):
    m = re.search(r"^\s*CAS\s+([0-9-]+)\s*;", text, re.M)
    return m.group(1) if m else None


def main() -> int:
    fails, notes, notrun = [], [], []
    records = {p: p.read_text(errors="ignore") for p in sorted(COMP.glob("*.dat"))}
    imported = {p: t for p, t in records.items() if MARK in t}

    # ---- (a) one home ----------------------------------------------------
    #  A literal key is a mapping from a bare integer to a quoted group name.
    #  Searching for that SHAPE catches a table however it is spelled.
    pattern = re.compile(r"\b\d+\s*:\s*['\"](?:CH3|CH2|OH|H2O|ACH|CH3OH)['\"]")
    for p in sorted((ROOT / "bin" / "curate").glob("*.py")):
        if p.name == "unifac_key.py":
            continue
        if pattern.search(p.read_text(errors="ignore")):
            fails.append(f"{p.relative_to(ROOT)} carries a literal UNIFAC id ->"
                         " name table -- the key is DERIVED and has one home"
                         " (bin/curate/unifac_key.py); a second copy goes stale"
                         " silently, because a stale key still decodes")
    if not fails:
        notes.append("the key has one home")

    # ---- (e) the vocabulary is the catalogue's (runs without the archive) --
    vocab = set()
    for p, t in records.items():
        if MARK in t:
            continue
        g = groups_of(t)
        if g:
            vocab |= set(g)
    written = 0
    for p, t in imported.items():
        g = groups_of(t)
        if not g:
            continue
        written += 1
        for nm in g:
            if nm not in vocab:
                fails.append(f"{p.stem} declares UNIFAC group `{nm}`, which no"
                             " curated component uses -- the vocabulary must be"
                             " the catalogue's, never invented by the importer")
    notes.append(f"{written} imported record(s) carry groups, all in the"
                 " catalogue's own vocabulary")

    key, contra, nobs = UK.derive()

    if not nobs:
        notrun += ["(b) the derivation's self-consistency",
                   "(c) the id round-trip of every written block",
                   "(d) the no-partial-decomposition check"]
        if written:
            fails.append(f"{written} imported record(s) carry UNIFAC groups but"
                         " the ChemSep archive is absent, so nothing can verify"
                         " them -- they were written by a run that had it, and"
                         " this run cannot confirm they still agree")
    else:
        # ---- (b0) THE EVIDENCE IS INDEPENDENT OF THE OUTPUT --------------
        #  The first run of this gate reported the key solved from 232
        #  components where the overlap is 40: the emitted records carry
        #  `unifac` blocks too, so a naive scan counted the importer's own
        #  output as curated evidence.  Nothing broke and the key came out
        #  identical -- which is why it needs a gate rather than a reader.
        #  From then on a corrupted written block would have REINFORCED a
        #  corrupted key instead of contradicting it.
        for stem, _, _ in UK.observations():
            hit = COMP / f"{stem}.dat"
            if hit.is_file() and MARK in hit.read_text(errors="ignore"):
                fails.append(f"the key was solved partly from {stem}, a record"
                             " this importer WROTE -- evidence must be"
                             " independent of what it is used to produce, or a"
                             " corrupted block reinforces a corrupted key")
        if not fails:
            notes.append("every solving component is hand-curated, none written"
                         " by the importer")

        # ---- (b) self-consistency ---------------------------------------
        for c in contra:
            fails.append("the derivation contradicts itself: " + c)
        obs = UK.observations()
        for stem, names, ids in obs:
            decoded = {}
            for i, n in ids.items():
                if i in key:
                    decoded[key[i]] = decoded.get(key[i], 0) + n
            known = {k: v for k, v in names.items() if k in decoded}
            if decoded != known:
                fails.append(f"the key does not reproduce the curated"
                             f" decomposition it was solved from ({stem}):"
                             f" decoded {decoded} vs curated {known}")
        if not contra:
            notes.append(f"{len(key)} id(s) solved from {nobs} components, no"
                         " contradiction, every curated decomposition reproduced")

        # ---- (c) and (d): round-trip every written block ------------------
        chem = {}
        for c in ET.parse(XML).getroot():
            ce, ue = c.find("CAS"), c.find("UnifacVLE")
            if ce is None or ue is None:
                continue
            try:
                chem[ce.get("value")] = {int(g.get("id")): int(g.get("value"))
                                         for g in ue.findall("group")}
            except (TypeError, ValueError):
                pass
        blocked_ok = 0
        for p, t in imported.items():
            cas = cas_of(t)
            g = groups_of(t)
            src = chem.get(cas)
            if g is None:
                #  (d) the negative: a component ChemSep describes but the key
                #  cannot fully decode must carry NO block.  Without this the
                #  gate would pass just as happily if nothing were imported.
                if src is not None and all(i in key for i in src):
                    fails.append(f"{p.stem}: every ChemSep subgroup id is"
                                 " determined, yet no groups were written --"
                                 " the import silently dropped a decodable"
                                 " decomposition")
                elif src is not None:
                    blocked_ok += 1
                continue
            if src is None:
                fails.append(f"{p.stem} carries UNIFAC groups but ChemSep states"
                             " none for its CAS -- where did they come from?")
                continue
            back = {}
            unknown = [nm for nm in g if nm not in set(key.values())]
            if unknown:
                fails.append(f"{p.stem} declares group(s) {unknown} the derived"
                             " key does not contain")
                continue
            inv = {v: k for k, v in key.items()}
            for nm, n in g.items():
                back[inv[nm]] = n
            if back != src:
                fails.append(f"{p.stem}: the written block decodes to {back} but"
                             f" ChemSep states {src} -- the key and the records"
                             " disagree")
        if blocked_ok:
            notes.append(f"{blocked_ok} record(s) correctly carry NO block"
                         " because at least one subgroup id is undetermined")

    # ---- (f) the engine reads it ----------------------------------------
    probe = next((p for p, t in imported.items() if groups_of(t)), None)
    if probe is None:
        if nobs:
            fails.append("no imported record carries UNIFAC groups, so arm (f)"
                         " has no subject -- a gate whose positive cannot fire"
                         " pins nothing")
    else:
        tmp = Path(tempfile.mkdtemp(prefix="unifac_gate_"))
        try:
            (tmp / "system").mkdir(); (tmp / "constant").mkdir()
            (tmp / "system" / "controlDict").write_text(
                'application choupoProps;\ndescription "unifac key probe";\n'
                'verbosity 3;\n')
            (tmp / "constant" / "thermoPhysPropDict").write_text(
                "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
                f"components ( {probe.stem} water );\nequilibrium\n{{\n"
                " formulation gammaPhi;\n"
                " liquid { activityModel UNIFAC; standardState pureLiquid; }\n"
                " vapour { fugacityModel idealGas; }\n}\n")
            (tmp / "system" / "propsDict").write_text(
                "operations\n(\n    {\n        name g;\n"
                "        type propertyScan1D;\n"
                f"        vary {{ variable x[{probe.stem}]; from 0.9999; to 0.99999; n 2; }}\n"
                f"        state {{ T 350 K; P 1 bar; composition {{ {probe.stem} 0.5; water 0.5; }} }}\n"
                f"        properties ( gamma_{probe.stem} );\n"
                "        output { file g.csv; }\n    }\n);\n")
            r = subprocess.run([str(BUILD / "choupoProps"), str(tmp)],
                               capture_output=True, text=True, timeout=300)
            hit = list(tmp.rglob("g.csv"))
            if r.returncode != 0 or not hit:
                fails.append(f"UNIFAC did not run on {probe.stem}, whose groups"
                             " this import wrote -- a block the engine cannot"
                             " read is decoration")
            else:
                rows = [l for l in hit[0].read_text().splitlines()
                        if l and not l[0].isalpha()]
                gam = float(rows[-1].split(",")[1])
                if abs(gam - 1.0) > 1e-3:
                    fails.append(f"UNIFAC gives gamma = {gam:.6g} for"
                                 f" {probe.stem} at x -> 1; a pure component's"
                                 " activity coefficient must go to 1")
                else:
                    notes.append(f"UNIFAC runs on {probe.stem}, gamma -> 1 in"
                                 " its pure limit")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    if fails:
        print("check_unifac_key: FAILED")
        for f in fails:
            print("  -", f)
        return 1

    line = ("check_unifac_key: OK -- " + "; ".join(notes) + ".")
    if notrun:
        line += ("  NOT RUN (the ChemSep archive is gitignored and absent here,"
                 " so these have no evidence to check against and are reported"
                 " rather than passed): " + "; ".join(notrun) + ".")
    line += ("  NOT COVERED: whether the CURATED decompositions are right (they"
             " are inherited -- the catalogue is the one home for what a group"
             " name means), whether ChemSep's are, the 53 undetermined ids"
             " beyond their correct refusal, UnifacLLE and ModifiedUnifac"
             " (different subgroup sets, not imported), and any agreement with"
             " MEASURED activity coefficients -- gamma -> 1 in a pure limit is"
             " a check on the plumbing, not a validation.")
    print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
