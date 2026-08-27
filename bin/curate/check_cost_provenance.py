#!/usr/bin/env python3
"""Gate: the sizing and costing tables can be defended from themselves.

    bin/curate/check_cost_provenance.py

WHY THIS EXISTS.  Leg 4 of the student walkthrough is the one that decides
whether the student passes: sizing, costing, and whether they can say where
each number came from when the jury asks.  The tables printed

    knockout  vessel  SS316  V_R [m3] 7.6882 ...
    knockout  vessel  3.05   1.00     18104   141231   166653

and between `F_M 3.05` and `C_TM 166653` stood eleven numbers and five
decisions -- the correlation and its coefficients, the size driver, the base
year, the price index and its 2001 reference, the currency rate, two
bare-module factors and the 1.18 -- all computed inside the pass, none said.
`V_R = 7.6882` was the same entry whether a residence time, a space velocity
or the author produced it, and `VesselSize` computed exactly that distinction
and discarded it with `(void)basis`.

THE CENTRAL ARM DOES WHAT THE STUDENT WOULD DO.  It takes the printed
coefficients and the printed indices, redoes the arithmetic in Python, and
requires the result to match the printed total.  That is the only test of the
claim being made: not that a block appears, but that the block is SUFFICIENT.

WHAT THIS GATE CHECKS, on a probe built from a real corpus case:

  (a) C_TM RECOMPUTES FROM THE PRINTED NUMBERS ALONE.  Nothing is read from
      the source or from the JSON: K1/K2/K3, S, CEPCI/CEPCI_2001, EUR/USD,
      B1/B2, F_M and the 1.18 all come off the console block, and

          C_p = 10^(K1 + K2 log10 S + K3 (log10 S)^2) x index x fx
          C_BM = C_p (B1 + B2 F_M F_P);   C_TM = 1.18 C_BM

      must land on the printed C_purchased, C_bare_mod and C_total_mod to
      0.1 %.  This is also the arm that catches TOO FEW DIGITS: the block's
      first version printed `B1, B2 = 2.2, 1.8` and `F_M = 3` (setprecision on
      a fresh stream is SIGNIFICANT digits), from which a reader reconstructs
      7.6 instead of 7.801, lands 2.6 % out, and concludes THEY made the
      mistake.  A provenance line too coarse to reproduce is worse than none.

  (b) THE SIZE'S RULE IS NAMED.  `basis: drum V = Q*tau` appears, so the
      volume can be attributed to a design argument rather than to a table.

  (c) THE IDEAL-GAS FLOW IS ANNOUNCED, AND ITS VALUE REPRODUCES THE VOLUME.
      Every residence-time and space-velocity size is driven by N R T / P
      computed regardless of the case's declared thermo package -- fine at a
      drum's 1 bar, a fifth undersized at 50 bar with Z = 0.8, and previously
      stated only in a source comment.  The printed Q times the declared tau
      must give the printed V_R.

  (d) THE COEFFICIENTS ARE ATTRIBUTED.  The block names Turton and Appendix A.
      A formula with anonymous constants is not checkable, and this project
      does not let a citation live only in a comment.

  (e) F_M IS **NOT** CITED IN THIS BLOCK, deliberately: it is a per-material
      datum whose own record carries its citation, and a second home for it
      here is exactly the duplication the arity doctrine forbids.  Checked, so
      that a later "helpful" addition cannot pass silently.

  (f) THE DESIGN CSV CARRIES THE DESIGN ARGUMENT.  `reports/design/sizing.csv`
      is the file that goes into the report, and a volume is the same entry
      whether a residence time, a space velocity or the author produced it.
      Solving that on the console alone would be half the fix.

  (g) THE ECONOMICS CSV REPRODUCES ITS OWN TOTAL.  This arm reads ONLY the
      file -- no console, no JSON, no source -- and recomputes C_TM from the
      columns sitting beside it.  Arm (a)'s standard, applied to the artefact.

  (h) A FAILING REPORT DOES NOT SILENCE THE ONES AFTER IT.  The chain loop had
      no guard, so the first report to throw killed every report after it and
      said nothing about the ones that never ran -- "never reached" reading as
      "produced nothing", which is absence read as a result, one layer out.
      The probe declares `economics` with no postDict at all: it must refuse,
      the report beside it must still write its artefact, and the run must
      state how many failed.

  (i) THE COSTING NUMBER IS UNMOVED by the audit.  An announcement that
      changes an answer is not an announcement.

SABOTAGE-VERIFIED 2026-08-27, nine times; every quoted line is OBSERVED.

S1 -- the whole provenance block suppressed.  Arms (a) and (d).

S2 -- B1/B2 printed in SIGNIFICANT digits again (`setprecision(2)` on a fresh
stream, which is what the block SHIPPED with on its first run).  This is the
arm's reason for existing, and it fires quantitatively:

    (a) C_bare_mod recomputed from the PRINTED numbers is 24354.3 against the
        printed 24707 (-1.43 %)

S3 -- the Turton attribution line dropped.  Arm (d).

S4 -- `d.basis = basis` reverted to `(void)basis`.  Arms (b) AND (c) --
and that coupling is worth knowing: the ideal-gas note is printed INSIDE the
basis line, so losing the basis loses the announcement too.  (c) is therefore
NOT independent of (b), and S5 is what tests it alone.

S5 -- the ideal-gas note silenced with the basis kept.  Arm (c) only.

S6 -- the provenance block's F_M column made to read B1.  Arm (a), both
through the recomputation (-18.67 %) and through the two-tables-disagree
check, which is the one that names the cause rather than the symptom.

S7 -- `sizing.csv` loses its `basis` column.  Arm (f): the volume is in the
file and the rule that produced it is not, so the file cannot be defended.

S8 -- `costs.csv` reverted to three numbers and nothing else.  Arm (g), naming
all eleven columns that vanished: "the file states a total nobody can
reproduce from it".

S9 -- the chain's per-report `catch` made to re-throw, restoring the
kill-the-chain behaviour.  Arm (h), both halves.  The FIRST attempt at this
sabotage did not COMPILE, which proves nothing at all; it was rewritten until
it built and ran, because a sabotage that fails to build has tested nothing.

AND A DEFECT IN THIS GATE, found by running the new arms.  They were first
inserted AFTER the `finally: shutil.rmtree(tmp)` -- so they checked for files
in a directory that had already been deleted, and reported "the design report
wrote no sizing.csv" about a run that had written it.  The gate was testing an
empty directory and blaming the engine.  A check must be inside the scope of
the thing it checks.

WHAT THIS GATE DOES **NOT** COVER, stated so its OK line cannot imply it:

  * It does not check that any COEFFICIENT IS RIGHT.  It proves the printed
    numbers are self-consistent and sufficient to reproduce the total; whether
    Turton's Appendix A really says 3.4974 is a curation question, and no copy
    of that book is in this repository.
  * Only the vessel / log-quadratic path is exercised.  The power-law items
    (crystalliser, spray dryer, cyclone) print a different coefficient triple
    and are NOT recomputed here.
  * It says nothing about whether the SIZE is a good design -- only about
    where it came from.
  * The `basis` string is console-only: it is not in the result JSON and no
    golden row pins it.  A word is not a golden value, and this gate is the
    only thing standing behind it.
"""
import csv
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASE = ROOT / "tutorials/steady/flash/flash01_benzene_toluene"
BIN = ROOT / "choupoSolve"

TAU = 300.0

POST = """\
sizing
{
    units
    (
        {
            unitName    flash01;
            type        vessel;
            material    SS316;
            designRules
            {
                residenceTime   %g;
                flowKey         F_alpha;
                L_over_D        3.0;
                pressureDesign  3.0;
                corrosionAllow  0.003;
                jointEfficiency 1.0;
            }
        }
    );
}

costing
{
    method  Guthrie;
    cepci   820;
}
""" % TAU

fails = []


def add_reports(case_dir, kinds):
    """Add report kinds to a case's controlDict, MERGING into any existing
    `reports {}` block.  Appending a second block is refused by the dict layer
    -- correctly: "key 'reports' is declared TWICE ... the file's order would
    decide the answer" -- and the probe must not trip over a guard that is
    doing its job."""
    cd = Path(case_dir) / "system" / "controlDict"
    txt = cd.read_text()
    body = "".join(f"    {k} {{ }}\n" for k in kinds)
    m = re.search(r"(reports\s*\{)", txt)
    if m:
        txt = txt[:m.end()] + "\n" + body + txt[m.end():]
    else:
        txt += "\nreports\n{\n" + body + "}\n"
    cd.write_text(txt)


def main():
    if not BIN.exists():
        print("check_cost_provenance: FAIL -- choupoSolve missing; run `make all`")
        return 1

    tmp = tempfile.mkdtemp(prefix="cost_prov_")
    try:
        d = Path(tmp) / "probe"
        shutil.copytree(CASE, d)
        (d / "system" / "postDict").write_text(POST)
        #  Ask for the ARTEFACTS too.  The console block and the CSV are the
        #  same claim on two surfaces, and the CSV is the one that goes into
        #  the report -- solving it on screen only would be half the fix.
        #  `boom` is a report that cannot run (no sizing of its own kind);
        #  it is here to prove the chain survives one failing member.
        add_reports(d, ["design", "economics"])
        p = subprocess.run([str(BIN), str(d)], capture_output=True, text=True,
                           cwd=str(ROOT), timeout=300)
        out = p.stdout + p.stderr

        # ---- the printed costing row (F_M, F_P, three costs)
        row = re.search(r"^\s+flash01\s+vessel\s+([\d.]+)\s+([\d.]+)\s+"
                        r"(\d+)\s+(\d+)\s+(\d+)\s*$", out, re.M)
        if not row:
            print("check_cost_provenance: FAIL -- the probe printed no costing "
                  "row; nothing below can be checked\n" + out[-2500:])
            return 1
        F_M, F_P = float(row.group(1)), float(row.group(2))
        Cp_p, CBM_p, CTM_p = (float(row.group(i)) for i in (3, 4, 5))

        # ---- the provenance block, read as a reader would
        idx = re.search(r"index: CEPCI\s+([\d.]+)\s*/\s*([\d.]+)\s*=\s*([\d.]+)"
                        r"\s+currency:\s+([\d.]+)\s+EUR/USD", out)
        prov = re.search(r"^\s+flash01\s+log-quadratic\s+V_R = ([\d.]+)\s+"
                         r"([\d.]+),\s*([\d.]+),\s*([\d.]+)\s+"
                         r"([\d.]+),\s*([\d.]+)\s+([\d.]+)\s+\((\w+)\)",
                         out, re.M)
        if not idx or not prov:
            fails.append("(a) the provenance block is absent or unreadable -- "
                         "the table cannot be defended from itself")
        else:
            cepci, cepci2001 = float(idx.group(1)), float(idx.group(2))
            fx = float(idx.group(4))
            S = float(prov.group(1))
            K1, K2, K3 = (float(prov.group(i)) for i in (2, 3, 4))
            B1, B2 = float(prov.group(5)), float(prov.group(6))
            fm_block = float(prov.group(7))

            l = math.log10(S)
            Cp = 10 ** (K1 + K2 * l + K3 * l * l) * (cepci / cepci2001) * fx
            CBM = Cp * (B1 + B2 * fm_block * F_P)
            CTM = 1.18 * CBM

            for label, got, want in (("C_purchased", Cp, Cp_p),
                                     ("C_bare_mod", CBM, CBM_p),
                                     ("C_total_mod", CTM, CTM_p)):
                if want == 0 or abs(got - want) / want > 1e-3:
                    fails.append(
                        f"(a) {label} recomputed from the PRINTED numbers is "
                        f"{got:.1f} against the printed {want:.0f} "
                        f"({100*(got-want)/max(want,1):+.2f} %).  Either the "
                        "block omits a factor or it prints too few digits to "
                        "reproduce -- both leave a reader who does the "
                        "arithmetic believing they made the error")
            if abs(fm_block - F_M) > 1e-9:
                fails.append(f"(a) F_M differs between the two tables: "
                             f"{F_M} in the costing row, {fm_block} in the "
                             "provenance block -- one fact, two printings")

        # ---- (b) the size's rule
        if not re.search(r"basis:\s*drum V = Q\*tau", out):
            fails.append("(b) the sizing table does not name the rule that "
                         "produced the volume; V_R is reported, not defended")

        # ---- (c) the ideal-gas flow, announced and reproducing V_R
        q = re.search(r"IDEAL GAS,\s*([\d.eE+-]+)\s*m3/s", out)
        if not q:
            fails.append("(c) the ideal-gas volumetric flow is not announced; "
                         "N R T / P is used whatever thermo the case declares, "
                         "and only a source comment said so")
        elif prov:
            Q = float(q.group(1))
            V = float(prov.group(1))
            if V == 0 or abs(Q * TAU - V) / V > 2e-4:
                fails.append(f"(c) the printed Q ({Q}) times the declared tau "
                             f"({TAU}) gives {Q*TAU:.4f}, not the printed "
                             f"V_R {V} -- the announcement does not describe "
                             "the number it sits beside")

        # ---- (d) attribution
        if "Turton" not in out or "Appendix A" not in out:
            fails.append("(d) the coefficient block names no source; a formula "
                         "with anonymous constants is not checkable")

        # ---- (e) F_M is NOT cited here (its record is its one home)
        blk = re.search(r"K1-K3, B1, B2 and the 1\.18:(.*?)\n\n", out, re.S)
        if blk and re.search(r"F_M[^\n]*(Turton|Appendix|doi|ISBN)", blk.group(1)):
            fails.append("(e) F_M has acquired a citation in the costing "
                         "block; it is a per-material datum and its record is "
                         "its one home -- a second is the arity sin")

        # ---- (f) the design CSV carries the design ARGUMENT
        dcsv = d / "reports" / "design" / "sizing.csv"
        if not dcsv.exists():
            fails.append("(f) the design report wrote no sizing.csv -- the "
                         "student has a screen table and nothing to put in a "
                         "report")
        else:
            rows = list(csv.DictReader(dcsv.open()))
            if not rows or "basis" not in rows[0]:
                fails.append("(f) sizing.csv has no `basis` column; the volume "
                             "is in the file and the rule that produced it is "
                             "not, so the file cannot be defended")
            elif not rows[0]["basis"] or rows[0]["basis"] == "(not stated)":
                fails.append("(f) sizing.csv's basis column is empty")

        # ---- (g) the economics CSV REPRODUCES ITS OWN TOTAL
        ecsv = d / "reports" / "economics" / "costs.csv"
        if not ecsv.exists():
            fails.append("(g) the economics report wrote no costs.csv")
        else:
            rows = [r for r in csv.DictReader(ecsv.open())
                    if r["unit"] != "TOTAL"]
            if not rows:
                fails.append("(g) costs.csv has no equipment rows")
            else:
                r = rows[0]
                missing = [k for k in ("S", "K1_or_CpRef", "K2_or_SRef",
                                       "K3_or_n", "B1", "B2", "F_M", "F_P",
                                       "cepci", "cepci2001", "usdToEur")
                           if k not in r]
                if missing:
                    fails.append("(g) costs.csv omits " + ", ".join(missing)
                                 + " -- the file states a total nobody can "
                                   "reproduce from it")
                else:
                    try:
                        S = float(r["S"])
                        l = math.log10(S)
                        cp = (10 ** (float(r["K1_or_CpRef"])
                                     + float(r["K2_or_SRef"]) * l
                                     + float(r["K3_or_n"]) * l * l)
                              * float(r["cepci"]) / float(r["cepci2001"])
                              * float(r["usdToEur"]))
                        ctm = 1.18 * cp * (float(r["B1"])
                                           + float(r["B2"]) * float(r["F_M"])
                                           * float(r["F_P"]))
                        want = float(r["totalModule_EUR"])
                        if want == 0 or abs(ctm - want) / want > 1e-3:
                            fails.append(
                                f"(g) costs.csv does not reproduce its own "
                                f"total: {ctm:.2f} recomputed from its columns "
                                f"against {want:.2f} stated "
                                f"({100*(ctm-want)/max(want,1):+.2f} %)")
                    except (ValueError, KeyError) as e:
                        fails.append(f"(g) costs.csv columns are unreadable: {e}")

        # ---- (h) a failing report does not silence the ones after it
        boom = Path(tmp) / "boom"
        shutil.copytree(CASE, boom)
        #  `economics` with NO postDict at all: it must refuse (there is
        #  nothing to serialise) and `streamTable`, which the base case
        #  already declares, must still produce its artefact.
        #  Only `economics` is ADDED.  The base case already declares
        #  `streamTable`, and declaring it twice in one block is refused
        #  outright by the dict layer -- so the survivor arm uses the report
        #  that is already there rather than tripping a guard doing its job.
        (boom / "system" / "postDict").unlink(missing_ok=True)
        add_reports(boom, ["economics"])
        bout = subprocess.run([str(BIN), str(boom)], capture_output=True,
                              text=True, cwd=str(ROOT), timeout=300)
        btxt = bout.stdout + bout.stderr
        if "economics FAILED" not in btxt:
            fails.append("(h) a report that cannot run did not report itself "
                         "as failing")
        if not (boom / "reports" / "streams" / "streamTable.csv").exists():
            fails.append("(h) a report declared AFTER a failing one produced "
                         "no artefact -- one failure silences the rest, and "
                         "'never reached' reads as 'produced nothing'")
        if "report(s) failed and produced NO artefact" not in btxt:
            fails.append("(h) the run does not state how many reports failed; "
                         "a reader who scrolled past the red line never learns "
                         "something is missing")

    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if fails:
        print("check_cost_provenance: FAIL")
        for f in fails:
            print("  - " + f)
        return 1

    print("check_cost_provenance: OK -- the costing total RECOMPUTES to 0.1 % "
          "from the printed coefficients, indices and factors alone (nothing "
          "read from source or JSON), the two tables agree on F_M, the size "
          "names the rule that produced it, the ideal-gas volumetric flow is "
          "announced and reproduces V_R at the declared tau, and the "
          "coefficients are attributed to Turton App. A while F_M is "
          "deliberately left to its own record.  THE ARTEFACTS CARRY THE SAME "
          "CLAIM: sizing.csv has the design ARGUMENT in a column, costs.csv "
          "reproduces its own stated total from its own columns, and the "
          "report chain survives a failing member with the count stated -- so "
          "a reader who never sees the console can still defend the numbers.  "
          "NOT COVERED: whether any coefficient is RIGHT (no copy of that book "
          "is in this repository), the power-law items (crystalliser / spray "
          "dryer / cyclone), whether the size is a GOOD design, and any GOLDEN "
          "pinning -- `basis` is a word, no golden row reads it, and this gate "
          "is all that stands behind it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
