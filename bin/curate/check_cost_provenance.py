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

SABOTAGE-VERIFIED 2026-08-27, six times; every quoted line is OBSERVED.

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


def main():
    if not BIN.exists():
        print("check_cost_provenance: FAIL -- choupoSolve missing; run `make all`")
        return 1

    tmp = tempfile.mkdtemp(prefix="cost_prov_")
    try:
        d = Path(tmp) / "probe"
        shutil.copytree(CASE, d)
        (d / "system" / "postDict").write_text(POST)
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
          "deliberately left to its own record.  NOT COVERED: whether any "
          "coefficient is RIGHT (no copy of that book is in this repository), "
          "the power-law items (crystalliser / spray dryer / cyclone), whether "
          "the size is a GOOD design, and any golden pinning of the `basis` "
          "word -- it is console-only and this gate is all that stands behind "
          "it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
