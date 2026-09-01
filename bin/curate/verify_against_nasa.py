#!/usr/bin/env python3
"""Read the catalogue's formation data back against NASA TM-4513.

    pip install cantera && python3 bin/curate/verify_against_nasa.py

A TOOL, NOT A GATE, and deliberately so -- the same posture as
`verify_against_poling.py`.  It needs `cantera` (for the bundled
`nasa_gas.yaml`), which is not a project dependency and never will be, so in
CI it could only skip; and *a check that cannot run must not pass*.  A
skip-when-absent gate would be permanently green exactly where it matters.

WHY IT EXISTS.  36 component records name Burcat/ReSpecTh -- a NonCommercial
compilation -- as the origin of their `dHf_298` / `s_298`
(`debt_registry.NC_COMPILATION`, and
`docs/design/a-noncommercial-compilation-in-the-public-tree.md`).  The stated
remedy is re-import from **NASA TM-4513** (McBride, Gordon & Reno 1993, a US
government work, PUBLIC DOMAIN), which is what `bin/curate/import_gibbs_nasa.py`
already reads.  Before anybody re-imports anything, somebody has to know how
far the two compilations actually sit apart -- because that distance decides
whether discharging a pin is bookkeeping or a value change that moves goldens.

WHAT IT DOES NOT DO.  It writes no `.dat`, changes no value, and flips no
`reviewStatus`.  It prints a table.  Deciding what to do with a disagreement
is a curation act with a primary in hand.

MATCHING.  By species NAME, then VERIFIED against the record's own `formula`:
a name that resolves to a different elemental composition is REFUSED, not
reported as a disagreement.  The residual blind spot is stated rather than
papered over: **same formula, different isomer is invisible here** -- NASA
names many species by formula alone, and `N2H2` is trans-diazene in one
compilation and the 1,1- isomer in another, a ~90 kJ/mol difference between
two correct numbers.  That is what the large-deviation flag is for, and why
this tool reports instead of importing.

THE ENTROPY COLUMN IS REPORTED TWICE, AND THE FIRST DRAFT GOT IT WRONG.
Cantera labels its NASA polynomials with a reference pressure of 1 atm, so the
first version "corrected" every TM-4513 entropy by

    R ln(101325 / 1e5) = +0.1094 J/(mol.K)

before comparing -- and the median difference across the catalogue then came
out at exactly 0.109, which reads like a systematic convention error in this
project's records.  It was the correction itself.  MEASURED WITHOUT IT, the
median |s_298 difference| is **0.0022 J/(mol.K)**: the two tables are on the
same convention and agree far better than anyone measured.  Cantera's
`reference_pressure` is a property of its own gas model, not a claim about the
convention the table was printed on.

*A correction applied on the strength of a label, rather than measured, will
manufacture exactly the discrepancy it was meant to remove.*  Both columns are
printed so the next reader can see that the uncorrected one is the small one.

NOT COMPARED: the Cp polynomial.  Choupo stores a 4-term fit and TM-4513 a
NASA-7 pair, so comparing them means refitting, and a refit residual would say
more about the fit than about either table.
"""
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/local/NASA-TM4513-COMPARISON.md"
R = 8.31446261815324
S_ATM_TO_BAR = R * math.log(101325.0 / 1.0e5)

#  Bands, chosen to say three different things rather than pass/fail.
NEAR = 0.5    # kJ/mol -- indistinguishable at the precision either prints
DIFF = 5.0    # kJ/mol -- import_gibbs_nasa.py's own isomer-guard threshold


def parse_record(text):
    def num(key):
        m = re.search(rf'^\s*{key}\s+(-?[\d.eE+-]+)\s*;', text, re.M)
        return float(m.group(1)) if m else None
    block = re.search(r'standardThermochemistry\s*\{(.*?)\}', text, re.S)
    if not block:
        return None
    b = block.group(1)
    def bnum(key):
        #  The value, not a stray dimension token: a number, optionally
        #  signed, with at least one digit, terminated by `;`.  The first
        #  draft accepted a bare '-' out of a `[-1 2 1 0 0]` dimension.
        m = re.search(rf'^\s*{key}\s+(-?\d[\d.eE+-]*)\s*;', b, re.M)
        return float(m.group(1)) if m else None
    f = re.search(r'^\s*formula\s+(\S+?)\s*;', text, re.M)
    rung = re.search(r'referenceState\s+(\w+)', b)
    return {"dHf": bnum("dHf_298"), "s": bnum("s_298"),
            "formula": f.group(1) if f else None,
            "rung": rung.group(1) if rung else "idealGas",
            "mw": num("MW")}


def comp_of(formula):
    """{element: count} from a formula string, or None if it is not one."""
    if not formula or not re.fullmatch(r'([A-Z][a-z]?\d*)+', formula):
        return None
    out = {}
    for el, n in re.findall(r'([A-Z][a-z]?)(\d*)', formula):
        if el:
            out[el] = out.get(el, 0) + (int(n) if n else 1)
    return out


def main() -> int:
    try:
        import cantera as ct
    except ImportError:
        print("verify_against_nasa: cantera is not installed -- `pip install "
              "cantera`.  This tool REFUSES rather than skipping: a comparison "
              "that did not happen must not read as one that found nothing.")
        return 1
    nasa = {s.name: s for s in ct.Species.list_from_file('nasa_gas.yaml')}

    rows, refused, nomatch, offrung = [], [], [], []
    for p in sorted((ROOT / "data/standards/components").glob("*.dat")):
        rec = parse_record(p.read_text(errors="ignore"))
        if not rec or rec["dHf"] is None:
            continue
        s = nasa.get(p.stem)
        if s is None:
            nomatch.append(p.stem)
            continue
        #  TM-4513 IS AN IDEAL-GAS TABLE.  A record whose datum is
        #  tabulated on the solid or liquid rung is not a disagreement with
        #  it -- it is a different quantity, and comparing the two prints a
        #  heat of sublimation as an error (CaO: 679 kJ/mol, and it was the
        #  largest "disagreement" the first run found).  Six records were in
        #  that state.  See CLAUDE.md, the reference-rung refusal.
        if rec["rung"] != "idealGas":
            offrung.append((p.stem, rec["rung"]))
            continue
        want = comp_of(rec["formula"])
        have = {k: int(v) for k, v in s.composition.items()}
        if want is None or want != have:
            refused.append((p.stem, rec["formula"], have))
            continue
        th = s.thermo
        dh = th.h(298.15) / 1e6                       # kJ/mol
        ss = th.s(298.15) / 1e3                       # J/(mol.K), as tabled
        rows.append((p.stem, rec["rung"], rec["dHf"] / 1000.0, dh,
                     rec["s"], ss))

    near = [r for r in rows if abs(r[3] - r[2]) <= NEAR]
    mid = [r for r in rows if NEAR < abs(r[3] - r[2]) <= DIFF]
    far = [r for r in rows if abs(r[3] - r[2]) > DIFF]

    sdiffs = sorted(abs(r[5] - r[4]) for r in rows if r[4] is not None)
    med = sdiffs[len(sdiffs) // 2] if sdiffs else float("nan")

    L = ["# Catalogue formation data vs NASA TM-4513",
         "",
         "Generated by `bin/curate/verify_against_nasa.py`.  NOT committed --",
         "it is rebuildable only where cantera is installed, and a generated",
         "file that cannot be regenerated goes stale with nothing able to",
         "notice.  Nothing here changed a value.",
         "",
         f"- {len(rows)} record(s) compared (name matched AND formula verified)",
         f"- {len(near)} agree within {NEAR} kJ/mol",
         f"- {len(mid)} differ by {NEAR}-{DIFF} kJ/mol (a different compilation)",
         f"- {len(far)} differ by more than {DIFF} kJ/mol -- READ THESE",
         f"- {len(refused)} refused: the name matched a DIFFERENT composition",
         f"- {len(offrung)} skipped: datum is on a non-gas reference rung",
         f"- {len(nomatch)} catalogue records have no TM-4513 entry",
         "",
         f"Median |s_298 difference| = **{med:.4f} J/(mol.K)** against a "
         f"1 atm -> 1 bar convention term of {S_ATM_TO_BAR:.4f}.  The two "
         "tables agree on entropy to better than anyone measured; what is "
         "left is which standard pressure each is on, and this tool does not "
         "decide that.",
         "",
         "| species | rung | dHf_298 ours | TM-4513 | diff kJ/mol "
         "| s_298 ours | TM-4513 | diff | less R ln(atm/bar) |",
         "|---|---|---|---|---|---|---|---|---|"]
    for n, rung, a, b, sa, sb in sorted(rows, key=lambda r: -abs(r[3] - r[2])):
        sd = f"{sb - sa:+.3f}" if sa is not None else "--"
        sc = f"{sb - sa - S_ATM_TO_BAR:+.3f}" if sa is not None else "--"
        sav = f"{sa:.3f}" if sa is not None else "--"
        L.append(f"| {n} | {rung} | {a:.3f} | {b:.3f} | {b - a:+.3f} "
                 f"| {sav} | {sb:.3f} | {sd} | {sc} |")
    if offrung:
        L += ["", "## Skipped: not an ideal-gas datum", "",
              "TM-4513 tabulates the ideal gas.  Comparing a solid or liquid",
              "datum against it measures a phase change, not an error.", ""]
        L += [f"- `{n}`: `referenceState {r}`" for n, r in offrung]
    if refused:
        L += ["", "## Refused: the NASA name is a different substance", ""]
        L += [f"- `{n}`: record says `{f}`, TM-4513 entry is {h}"
              for n, f, h in refused]
    L += ["", "## The blind spot, stated", "",
          "Same formula, different isomer is INVISIBLE to this tool.  A large",
          "difference above is a question, not a verdict: it may be two",
          "compilations disagreeing, or two different molecules wearing one",
          "name.  Resolving it means reading both sources, never picking the",
          "number that suits."]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(L) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}")
    print(f"  {len(rows)} compared: {len(near)} agree (<= {NEAR} kJ/mol), "
          f"{len(mid)} differ mildly, {len(far)} differ by > {DIFF} kJ/mol")
    print(f"  median |s_298 diff| = {med:.4f} J/(mol.K); the 1 atm -> 1 bar "
          f"convention term is {S_ATM_TO_BAR:.4f}")
    for n, rung, a, b, *_ in sorted(far, key=lambda r: -abs(r[3] - r[2])):
        print(f"    {n:8s} ours {a:10.3f}   TM-4513 {b:10.3f}   "
              f"{b - a:+9.3f} kJ/mol")
    if offrung:
        print(f"  {len(offrung)} skipped (non-gas rung): "
              + ", ".join(n for n, _ in offrung))
    if refused:
        print(f"  {len(refused)} refused on composition: "
              + ", ".join(n for n, _, _ in refused))
    return 0


if __name__ == "__main__":
    sys.exit(main())
