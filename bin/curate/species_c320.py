#!/usr/bin/env python3
"""Make the aqueous-species records of C320 from the batch's evidence table.

    bin/curate/species_c320.py write     (re)write data/standards/species/<name>.dat for every `included` species
    bin/curate/species_c320.py list      print the species and their status

SOURCE OF TRUTH: data/curation/batches/species_c320/species.tsv -- every value read, per quantity: the NBS
reading (Wagman et al. 1982, J. Phys. Chem. Ref. Data 11 Suppl. 2, table, printed page, PDF page, row; read ONE row
at a time from the scanned page), the second reading (CRC Handbook aqueous table, which reprints NBS rounded to
0.1), the CODATA key value (Cox, Wagman & Medvedev 1989) where the species is a key substance, the chosen value
and its origin.  The chosen value is NBS unless CODATA carries the species (then CODATA, the evaluated one).
`gfAq` rows are check-only: the NBS dGf, held to the Gibbs identity by check_species_records.py; they are not
stored in a record.  elements.tsv carries the reference-state entropies that identity needs.

MW is the sum of the engine's own conventional atomic weights (src/thermo/AtomicWeights.cpp), 3 decimals.
Units: records are J/mol and J/mol/K (the corpus convention; H+ = 0), the table is kJ/mol as printed.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BATCH = ROOT / "data" / "curation" / "batches" / "species_c320"
SPECIES = ROOT / "data" / "standards" / "species"
WEIGHTS = ROOT / "src" / "thermo" / "AtomicWeights.cpp"

COLS = ["species", "formula", "charge", "status", "quantity", "unit", "nbs", "nbs_where", "second",
        "second_where", "codata", "codata_where", "chosen", "chosen_origin", "note"]


def load_table(path=None):
    path = path or BATCH / "species.tsv"
    rows = []
    for ln in path.read_text(encoding="utf-8").splitlines()[1:]:
        if not ln.strip():
            continue
        f = ln.split("\t")
        f += [""] * (len(COLS) - len(f))
        rows.append(dict(zip(COLS, f)))
    return rows


def by_species(rows):
    out = {}
    for r in rows:
        out.setdefault(r["species"], []).append(r)
    return out


def weights():
    t = WEIGHTS.read_text(encoding="utf-8")
    return {m[0]: float(m[1]) for m in re.findall(r'\{\s*"([A-Za-z]+)",\s*([0-9.]+)\s*\}', t)}


def atoms(formula):
    """atoms of a flat formula with a trailing charge: 'SO4-2', 'ClO4-', 'Ag+', 'H2S'."""
    f = re.sub(r"[+-]\d*$", "", formula)
    if not re.fullmatch(r"(?:[A-Z][a-z]?\d*)+", f):
        raise ValueError("formula not flat: " + formula)
    out = {}
    for e, n in re.findall(r"([A-Z][a-z]?)(\d*)", f):
        out[e] = out.get(e, 0) + (int(n) if n else 1)
    return out


def charge_of(formula):
    m = re.search(r"([+-])(\d*)$", formula)
    if not m:
        return 0
    return (1 if m.group(1) == "+" else -1) * (int(m.group(2)) if m.group(2) else 1)


def mw(formula):
    w = weights()
    return round(sum(w[e] * n for e, n in atoms(formula).items()), 3)


def fmt_j(kj):
    """kJ/mol as printed -> J/mol, an integer, exactly (no float drift)."""
    s = f"{float(kj):.6f}"
    return int(round(float(s) * 1000))


def fnum(v):
    return repr(float(v)) if float(v) != int(float(v)) else f"{float(v):.1f}"


def source_text(rows):
    """One string: the three citations once, then per quantity every reading and the chosen value."""
    rs = [r for r in rows if r["quantity"] != "gfAq"]
    r0 = rs[0]
    head = ["NBS = " + r0["nbs_where"]]
    sec = next((r for r in rs if r["second_where"]), None)
    head.append("second reading, enters no value -- the NBS table as reprinted, read via CRC = " + sec["second_where"] if sec else "no second reading in the CRC or CODATA tables for this species")
    cod = next((r for r in rs if r["codata_where"]), None)
    if cod:
        head.append("CODATA = " + cod["codata_where"])
    parts = []
    for r in rs:
        bits = [f"NBS {r['nbs']}"]
        if r["second"]:
            bits.append(f"CRC {r['second']}")
        if r["codata"]:
            bits.append(f"CODATA {r['codata']}")
        parts.append(f"{r['quantity']} [{r['unit']}] chosen {r['chosen']} ({r['chosen_origin']}): " + ", ".join(bits))
    s = " ## ".join(head) + " ## " + " ## ".join(parts)
    return s.replace(";", ",").replace('"', "'")


def render(name, rows):
    r0 = rows[0]
    f = r0["formula"]
    z = int(r0["charge"])
    assert charge_of(f) == z, (name, f, z)
    q = {r["quantity"]: r for r in rows}
    hf = fmt_j(q["hfAq"]["chosen"])
    lines = []
    lines.append("/*--------------------------------*- Choupo -*--------------------------------*\\")
    lines.append(f"  species/{name}.dat -- the aqueous species {f} (C320, DEV.md 4c).  ONE model species, ONE")
    lines.append("  typed file.  Made by bin/curate/species_c320.py from")
    lines.append("  data/curation/batches/species_c320/species.tsv, which holds every reading (NBS table, page, row;")
    lines.append("  the CRC second reading; the CODATA key value where the species has one) and the chosen value.")
    lines.append("  Standard state: ideal solution at 1 mol/kg, 298.15 K, H+ = 0 (NBS convention).  The chosen")
    lines.append("  value is NBS (Wagman et al. 1982) unless CODATA (Cox, Wagman & Medvedev 1989) carries the species.")
    lines.append("\\*-----------------------------------------------------------------------------*/")
    lines.append("recordType modelSpecies;")
    lines.append("schemaVersion 1;")
    lines.append("")
    lines.append(f"name    {name};")
    lines.append(f'formula     "{f}";')
    lines.append(f"charge  {z:+d};" if z else "charge  0;")
    lines.append(f"MW {{ value {mw(f):g}; unit g/mol;}}")
    lines.append("aqueousThermo")
    lines.append("{")
    lines.append(f'source "{source_text(rows)}";')
    lines.append(f"hfAq {{ value {hf}; unit J/mol;}}")
    lines.append(f"sAq  {{ value {fnum(q['sAq']['chosen'])};  unit J/mol/K;}}")
    if "cpAq" in q:
        lines.append(f"cpAq {{ value {fnum(q['cpAq']['chosen'])}; unit J/mol/K;}}")
    lines.append("}")
    return "\n".join(lines) + "\n"


def main():
    rows = load_table()
    sp = by_species(rows)
    cmd = sys.argv[1] if len(sys.argv) > 1 else "list"
    if cmd == "list":
        for n, rs in sp.items():
            print(n, rs[0]["formula"], rs[0]["status"])
        return 0
    if cmd == "write":
        n_w = 0
        for n, rs in sp.items():
            if rs[0]["status"] != "included":
                continue
            (SPECIES / f"{n}.dat").write_text(render(n, rs), encoding="utf-8")
            n_w += 1
        print(f"species_c320: wrote {n_w} records")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
