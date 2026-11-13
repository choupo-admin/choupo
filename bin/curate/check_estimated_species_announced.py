#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_estimated_species_announced -- an ESTIMATED species datum is ANNOUNCED
when a run consumes it, and only then.

    bin/curate/check_estimated_species_announced.py

WHY (C376, 2026-11-13).  C373/C376 put formation enthalpies and entropies into
the species records, some with a per-datum `provenance { hfAq { origin
estimated; method ...; } }` block (the paper's own correlation estimates).  The
engine read the number and dropped the word, so an estimate entered an energy
balance in the same silence as a measurement.  The species tier now raises one
`[estimate] species '<name>'` line per species and datum per run through
AdvisoryLog::addAnnouncedOnce (console + result JSON advisories -> caveat
block), at the point where the number ENTERS A RESULT:
  hfAq -- ionAqReference(), the aqueous ion reference of a salt (the enthalpy
          datum of the electrolyte);
  cpAq -- ThermoPackageBuilder, only on the constant ion-Cp tier (no
          Criss-Cobble entry), which is what extends the reference away from
          25 C;
  sAq  -- no consumer exists in the engine today; the helper
          (announceEstimatedSpeciesDatum) is ready for the first one.
Reading a record is not consuming it: a run that never reaches the consumer
says nothing.  Announcing moves no number.

ARMS (a real choupoProps run each, on a COPY of the witness case; a run that
cannot run FAILS, never passes):
  (a) the witness as shipped (OH-minus's hfAq declared estimated): exactly one
      `[estimate] species 'OH'` line naming hfAq, the origin word, the method
      the record states and what depended on it; none for Na; and an advisory
      of category provenance, locus `species 'OH'`, in the result JSON.
  (b) the same case with the provenance block deleted: NO `[estimate] species`
      line -- silence keeps meaning "nothing was estimated".
  (c) the same case with the estimate moved to sAq, which nothing consumes:
      NO line -- a record that is read but not consumed does not speak.
  (d) (a) and (b) publish IDENTICAL diagnostics: the announcement moves no
      number.
  (e) ONE ARM PER ANNOUNCED WORD (ES-02, 2026-11-13): the witness's word
      replaced by each of the other three non-measurement classes the
      function announces (predictive, assumed, placeholder): each must print
      exactly one line carrying its own word, and reach the result JSON.  An
      early return on any ONE of them fails this arm.
  (f) THE cpAq ROAD: the estimate moved to cpAq AND the record's Criss-Cobble
      nodes removed, so the constant ion-Cp tier is what extends the
      reference: exactly one line naming cpAq and that tier; with the nodes
      kept, cpAq is not used and the run is silent.
  (g) THE VAN 'T HOFF ROAD (ES-01): a speciation of glutaric acid on the
      catalogue records, whose reaction enthalpies carry the word of their
      least certain formation input.  At 353.15 K the run moves log K with
      them and must print one `[estimate] reaction` line per record it moves
      (HGlut-formation, Glut-formation), naming the dH, the word and the van
      't Hoff use, and carry them in the result JSON; at 298.15 K, where no
      van 't Hoff term is applied, it must say nothing; a case-local copy of
      HGlut-formation without the provenance block must say nothing for it.
  (h) A WORD THE ENGINE DOES NOT KNOW (ES-03): `calculated` on the witness's
      hfAq, and on a case-local HGlut-formation's dH at 353.15 K, each prints
      one `[provenance]` line saying the word is not registered (naming the
      datum and the word), and NO `[estimate]` line for it.

NOT CHECKED: that any catalogue estimate is physically right (that is the
curation's claim, with its method sentence); the synonyms core/Origin.H
accepts beside the four class words (they resolve through the same
originFromWord the class words do).
Sabotage by hand: make announceEstimatedSpeciesDatum return at its top and
rebuild -> arm (a) fails; return early on any one of the four words -> (a) or
(e) fails; drop the cpAq call in ThermoPackageBuilder -> (f) fails; drop the
van 't Hoff announcement in SpeciationSolver -> (g) fails; drop the
unrecognised-word branch -> (h) fails.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPS = ROOT / "choupoProps"
WITNESS = ROOT / "tutorials/props/electrolyte/estimatedSpecies01_announced"
LINE = "[estimate] species 'OH'"


def run(case):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(PROPS), "."], cwd=str(case), env=env,
                       capture_output=True, text=True, timeout=300)
    return p.returncode, p.stdout + p.stderr


def result(out):
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if not m:
        return None, None
    try:
        js = json.loads(m.group(1))
    except json.JSONDecodeError:
        return None, None
    diag = []
    for op in js.get("operationResults", []):
        for k, v in sorted(op.get("diagnostics", {}).items()):
            diag.append((op.get("name"), k, v))
    return diag, js.get("advisories", [])


def speciate_case(tmp, name, T, chem=None):
    """a scratch choupoProps case speciating glutaric acid at T [K] on the
    catalogue chemistry; `chem` = {file name: text} placed in constant/chemistry/
    (a case-local record shadows the catalogue record of the same name)."""
    d = tmp / name
    (d / "system").mkdir(parents=True)
    (d / "constant/components").mkdir(parents=True)
    (d / f"{name}.cho").write_text("")
    (d / "system/controlDict").write_text(
        'application choupoProps;\ndescription "gate probe";\nverbosity 2;\n')
    (d / "constant/thermoPhysPropDict").write_text(
        "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
        "components ( water );\naqueousProperties { activityCoefficients "
        "{ model Davies; referenceBasis aqueousMolality; } }\n")
    shutil.copy(ROOT / "data/standards/components/water.dat",
                d / "constant/components/water.dat")
    (d / "system/propsDict").write_text(
        "operations\n(\n    { name sp; type speciate; activityModel davies; "
        f"temperature {T}; analyticalTotals {{ H2Glut 0.03 mol/kg; }} "
        "totalsBasis stoichiometric; pH solve; diagSpecies ( H2Glut HGlut Glut ); "
        "output { file sp.csv; } }\n);\n")
    if chem:
        (d / "constant/chemistry").mkdir(parents=True)
        for fn, text in chem.items():
            (d / "constant/chemistry" / fn).write_text(text)
    return d


def drop_dh_block(text):
    return re.sub(r"\nprovenance\s*\{\s*dH\s*\{[^}]*\}\s*\}\n?", "\n", text)


def variant(tmp, name, edit):
    dst = tmp / name
    shutil.copytree(WITNESS, dst)
    f = dst / "constant/species/OH.dat"
    f.write_text(edit(f.read_text()))
    return dst


def main():
    fails = []
    if not PROPS.exists():
        print("check_estimated_species_announced: FAIL choupoProps is not built")
        return 1
    if not WITNESS.is_dir():
        print("check_estimated_species_announced: FAIL witness case missing")
        return 1
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        rc, out = run(variant(tmp, "a", lambda s: s))
        if rc != 0:
            fails.append(f"(a) witness exited {rc}: {out[-300:]}")
        else:
            lines = [ln for ln in out.splitlines() if ln.startswith(LINE)]
            if len(lines) != 1:
                fails.append(f"(a) {len(lines)} `{LINE}` line(s); the rule is "
                             "exactly ONE per species and datum per run")
            else:
                for need in ("hfAq", "estimated", "WITNESS ONLY",
                             "aqueous ion reference"):
                    if need not in lines[0]:
                        fails.append(f"(a) the line does not carry `{need}`: "
                                     + lines[0])
            if "[estimate] species 'Na'" in out:
                fails.append("(a) Na carries no estimate yet was announced")
            _, adv = result(out)
            if not adv or not any(a.get("locus") == "species 'OH'"
                                  and a.get("category") == "provenance"
                                  and "hfAq" in a.get("message", "")
                                  for a in adv):
                fails.append("(a) the announcement is not in the result JSON "
                             "advisories -- it would never reach the caveat "
                             "block or the result's provenance")
        diag_a, _ = result(out)

        # (b) no provenance block at all
        def drop(s):
            return re.sub(r"provenance\s*\{\s*hfAq\s*\{[^}]*\}\s*\}\n", "", s)
        rc, outb = run(variant(tmp, "b", drop))
        if rc != 0:
            fails.append(f"(b) probe exited {rc}: {outb[-300:]}")
        else:
            if "[estimate] species" in outb:
                fails.append("(b) a record with no provenance was announced")
            diag_b, _ = result(outb)
            if not diag_a or not diag_b:
                fails.append("(d) could not compare diagnostics")
            elif diag_a != diag_b:
                fails.append("(d) the announcement moved a number")

        # (c) the estimate on sAq, which no consumer reads
        rc, outc = run(variant(tmp, "c",
                               lambda s: s.replace("    hfAq\n    {\n        origin  estimated;",
                                                   "    sAq\n    {\n        origin  estimated;")))
        if rc != 0:
            fails.append(f"(c) probe exited {rc}: {outc[-300:]}")
        elif "[estimate] species" in outc:
            fails.append("(c) an estimated sAq nothing consumes was announced "
                         "-- reading a record is not consuming it")
        # (e) one arm per announced word
        for word in ("predictive", "assumed", "placeholder"):
            rc, oute = run(variant(tmp, "e_" + word, lambda s, w=word: s.replace(
                "origin  estimated;", f"origin  {w};", 1)))
            if rc != 0:
                fails.append(f"(e) {word}: probe exited {rc}: {oute[-300:]}")
                continue
            lines = [ln for ln in oute.splitlines() if ln.startswith(LINE)]
            if len(lines) != 1 or word not in lines[0] or "hfAq" not in lines[0]:
                fails.append(f"(e) an hfAq declared `{word}` printed {len(lines)} "
                             f"line(s) carrying the word: {lines}")
            _, adv = result(oute)
            if not adv or not any(a.get("locus") == "species 'OH'"
                                  and word in a.get("message", "")
                                  for a in adv):
                fails.append(f"(e) an hfAq declared `{word}` is not in the "
                             "result JSON advisories")

        # (f) the cpAq road: the constant ion-Cp tier
        def to_cp(s):
            return s.replace("    hfAq\n    {\n        origin  estimated;",
                             "    cpAq\n    {\n        origin  estimated;")
        def no_cc(s):
            return re.sub(r"cpAvg298\s*\{.*?\n\}\n", "", to_cp(s), flags=re.S)
        rc, outf = run(variant(tmp, "f_tier", no_cc))
        if rc != 0:
            fails.append(f"(f) probe exited {rc}: {outf[-300:]}")
        else:
            lines = [ln for ln in outf.splitlines() if ln.startswith(LINE)]
            if (len(lines) != 1 or "cpAq" not in lines[0]
                    or "constant ion Cp tier" not in lines[0]):
                fails.append("(f) an estimated cpAq on the constant ion-Cp tier "
                             f"printed {len(lines)} matching line(s): {lines}")
            if "constant cpAq tier" not in outf:
                fails.append("(f) the probe did not reach the constant cpAq "
                             "tier (the Criss-Cobble nodes were not removed?)")
        rc, outf2 = run(variant(tmp, "f_cc", to_cp))
        if rc != 0:
            fails.append(f"(f) probe exited {rc}: {outf2[-300:]}")
        elif "[estimate] species" in outf2:
            fails.append("(f) an estimated cpAq the Criss-Cobble tier does not "
                         "use was announced")

        # (g) the van 't Hoff road on the catalogue records
        vh = "[estimate] reaction '"
        rc, outg = run(speciate_case(tmp, "g_hot", 353.15))
        if rc != 0:
            fails.append(f"(g) probe at 353.15 K exited {rc}: {outg[-300:]}")
        else:
            for rec in ("HGlut-formation", "Glut-formation"):
                lines = [ln for ln in outg.splitlines()
                         if ln.startswith(vh + rec + "'")]
                if (len(lines) != 1 or "dH" not in lines[0]
                        or "estimated" not in lines[0]
                        or "van 't Hoff" not in lines[0]):
                    fails.append(f"(g) at 353.15 K the record {rec} printed "
                                 f"{len(lines)} matching line(s): {lines}")
            _, adv = result(outg)
            if not adv or not any(a.get("locus") == "reaction 'HGlut-formation'"
                                  and a.get("category") == "provenance"
                                  for a in adv):
                fails.append("(g) the van 't Hoff announcement is not in the "
                             "result JSON advisories")
        rc, outg2 = run(speciate_case(tmp, "g_25", 298.15))
        if rc != 0:
            fails.append(f"(g) probe at 298.15 K exited {rc}: {outg2[-300:]}")
        elif vh in outg2:
            fails.append("(g) at 298.15 K no van 't Hoff term is applied, yet a "
                         "reaction enthalpy was announced")
        hg = (ROOT / "data/standards/chemistry/HGlut-formation.dat").read_text()
        if not re.search(r"^provenance\s*\{\s*dH\s*\{[^}]*origin\s+estimated\s*;",
                         hg, re.M):
            fails.append("(g) data/standards/chemistry/HGlut-formation.dat "
                         "carries no provenance block: the generator's mark is "
                         "gone (bin/curate/species_c373.py check)")
        rc, outg3 = run(speciate_case(tmp, "g_nomark", 353.15,
                                      {"HGlut-formation.dat": drop_dh_block(hg)}))
        if rc != 0:
            fails.append(f"(g) unmarked probe exited {rc}: {outg3[-300:]}")
        elif vh + "HGlut-formation'" in outg3:
            fails.append("(g) a reaction record with no provenance block was "
                         "announced")

        # (h) a word the engine does not know
        uw = "[provenance] "
        rc, outh = run(variant(tmp, "h_species", lambda s: s.replace(
            "origin  estimated;", "origin  calculated;", 1)))
        if rc != 0:
            fails.append(f"(h) probe exited {rc}: {outh[-300:]}")
        else:
            lines = [ln for ln in outh.splitlines()
                     if ln.startswith(uw + "species 'OH'")]
            if (len(lines) != 1 or "calculated" not in lines[0]
                    or "hfAq" not in lines[0] or "not registered" not in lines[0]):
                fails.append("(h) an unregistered word on hfAq printed "
                             f"{len(lines)} matching line(s): {lines}")
            if "[estimate] species 'OH'" in outh:
                fails.append("(h) an unregistered word was read as an estimate")
        rc, outh2 = run(speciate_case(tmp, "h_chem", 353.15, {
            "HGlut-formation.dat": hg.replace("origin  estimated;",
                                              "origin  calculated;", 1)}))
        if rc != 0:
            fails.append(f"(h) probe exited {rc}: {outh2[-300:]}")
        else:
            lines = [ln for ln in outh2.splitlines()
                     if ln.startswith(uw + "reaction 'HGlut-formation'")]
            if (len(lines) != 1 or "calculated" not in lines[0]
                    or "not registered" not in lines[0]):
                fails.append("(h) an unregistered word on a reaction dH printed "
                             f"{len(lines)} matching line(s): {lines}")
            if vh + "HGlut-formation'" in outh2:
                fails.append("(h) an unregistered word on a reaction dH was "
                             "read as an estimate")
    print("check_estimated_species_announced: " + ("FAIL" if fails else
          "OK a non-measured species datum is announced once per run "
          "(console + result advisory) for each of the four words "
          "(estimated, predictive, assumed, placeholder) on the hfAq road and "
          "on the constant ion-Cp tier's cpAq road; a reaction enthalpy formed "
          "from an estimated formation value is announced when the run moves "
          "log K with it (353.15 K) and not at 298.15 K; a record without "
          "provenance, an unconsumed sAq and a cpAq the Criss-Cobble tier does "
          "not use stay silent; an unregistered word is announced as such on "
          "both readers; diagnostics identical; arms (a)-(h); NOT checked: "
          "the synonyms of the four words, physical correctness of any "
          "catalogue estimate"))
    for f in fails:
        print("  - " + f)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
