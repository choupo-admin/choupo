#!/usr/bin/env python3
"""Cross-check of every component's stored `Vliq` against the liquid molar volume Poling, Prausnitz and
O'Connell (2001) print in Appendix A, Section B ("V liq, cm3/mol, at T liq, K").

    python3 data/curation/batches/vliq_datum_temperature/poling_crosscheck.py [PDF] [--tol 0.02]

PDF defaults to ~/Choupo-Literature/Handbooks-DataCompilations/poling2001-appendix-a-property-data-bank.pdf.
Reads the PDF's text layer (pdftotext -layout), keeps the Section B rows whose T liq is 298.15 K (the only
rows a record that claims 25 C can be compared to without a temperature model), matches by CAS number to
data/standards/components/*.dat and prints the records whose stored value differs by more than the tolerance.
The text layer is checked against the page images by eye for the rows named in evidence.tsv (column
`page_read`); a row not so checked is marked `text-layer` there.  Writes nothing.
"""
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
COMP = HERE.parents[3] / "standards" / "components"
DEF = Path.home() / "Choupo-Literature/Handbooks-DataCompilations/poling2001-appendix-a-property-data-bank.pdf"
CAS = re.compile(r"\b(\d{2,7}-\d\d-\d)\b")


def poling_rows(pdf):
    txt = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True).stdout
    rows, inB = {}, False
    for line in txt.splitlines():
        if "Section B" in line:
            inB = True
        elif "Section C" in line:
            inB = False
        if not inB:
            continue
        m = CAS.search(line)
        if not m:
            continue
        toks = line[m.end():].split()
        if "298.15" in toks:
            i = len(toks) - 1 - toks[::-1].index("298.15")
            if i >= 1:
                try:
                    rows[m.group(1)] = (float(toks[i - 1]), 298.15, line.split()[1])
                except ValueError:
                    pass
    return rows


def stored():
    out = {}
    for p in COMP.glob("*.dat"):
        t = p.read_text(errors="replace")
        v = re.search(r"^\s*Vliq\s+([0-9.eE+-]+)\s*;", t, re.M)
        c = re.search(r"^\s*CAS\s+([0-9-]+)\s*;", t, re.M)
        if v and c:
            out[c.group(1)] = (p.stem, float(v.group(1)) * 1e6)
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    tol = 0.02
    if "--tol" in sys.argv:
        tol = float(sys.argv[sys.argv.index("--tol") + 1])
        args = [a for a in args if a != str(tol)]
    pdf = Path(args[0]) if args else DEF
    rows, st = poling_rows(pdf), stored()
    both = [c for c in rows if c in st]
    print("record\tCAS\tstored_cm3_mol\tpoling_cm3_mol_at_298.15K\tstored_over_poling_minus_1")
    n = 0
    for c in sorted(both, key=lambda c: st[c][0]):
        d = st[c][1] / rows[c][0] - 1
        if abs(d) > tol:
            n += 1
            print(f"{st[c][0]}\t{c}\t{st[c][1]:.3f}\t{rows[c][0]:.2f}\t{d:+.3f}")
    print(f"# {len(rows)} Poling rows at 298.15 K; {len(both)} matched to a record by CAS; {n} differ by more than {tol:.0%}",
          file=sys.stderr)


main()
