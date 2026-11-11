#!/usr/bin/env python3
"""Extract Sander's (2015) Henry's-law Table 6 and derive Choupo Henry-water records.

    bin/curate/henry_sander.py extract <sander.txt> <rows.tsv>
    bin/curate/henry_sander.py derive  <rows.tsv> <summary.tsv>
    bin/curate/henry_sander.py control <rows.tsv>
    bin/curate/henry_sander.py write   <summary.tsv> <rows.tsv>   (new records)

SOURCE: Sander, R. (2015) "Compilation of Henry's law constants (version 4.0)
for water as solvent", Atmos. Chem. Phys. 15, 4399-4981,
doi:10.5194/acp-15-4399-2015, CC-BY 3.0.  `pdftotext -layout` of the PDF.

TABLE 6 LAYOUT (read from the text, DEV.md 4c C321): per species a label
column (name, formula, optional "(other names)", "[CAS]") at text columns 3-38
and per-reference rows at 39+: Hcp [mol/(m3 Pa)] at 298.15 K written
"d.dx10^e", d ln Hcp / d(1/T) [K] (optional), reference, a TYPE letter, notes.
The first row sits on the species' name line.  Rows continue across pages.
The PDF carries NO per-species "selected" mark (the web edition does): the
first rows are type L (earlier reviews) and the rest follow by type, so the
rule here is the median of the M (measured) and L (literature) rows; Q (QSPR),
E (estimate) and the unreliable types (V, T, X, C, ?, W, R) are excluded.
"""
import re
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMP = ROOT / "data" / "standards" / "components"
HENRY = ROOT / "data" / "standards" / "parameters" / "Henry"
R = 8.314462618
TREF = 298.15
USED_TYPES = ("M", "L")
SPREAD_LIMIT = 3.0
NUM = r"\d(?:\.\d+)?(?:×10[−-]?\d+)?"
ROWRE = re.compile(r"^\s*(?P<h>" + NUM + r")?\s*(?P<d>\d{3,5})?\s+(?P<ref>\S.*?)\s{2,}"
                   r"(?P<t>[A-Z?])(?:\s+(?P<note>[\d, ]+))?\s*$")
SKIP = ("Table 6", "Substance", "Formula", "(Other name", "[CAS registry", "H cp",
        "(at T", "d(1/T", "d ln H", "Reference", "m3 Pa", "Atmos. Chem.", "www.atmos",
        "R. Sander:")
CASRE = re.compile(r"^\s*\[(\d{2,7}-\d\d-\d)\]\s*$")


def num(s):
    s = s.replace("−", "-")
    if "×10" in s:
        m, e = s.split("×10")
        return float(m) * 10 ** int(e)
    return float(s)


def extract(txt, out):
    lines = txt.read_text(encoding="utf-8").split("\n")
    start = next(i for i, l in enumerate(lines) if "Table 6: Henry" in l)
    end = next(i for i, l in enumerate(lines)
               if i > start and l.startswith("Notes"))
    page = 0
    cur = None
    closed = True
    rows = []
    nsp = 0
    for l in lines[start:end]:
        if "Compilation of Henry" in l:
            mm = re.search(r"(\d{4})", l)
            if mm:
                page = int(mm.group(1))
        if not l.strip() or any(s in l for s in SKIP):
            continue
        left, right = l[:39], l[39:]
        lab = left.strip()
        rm = ROWRE.match(right) if right.strip() else None
        if lab:
            c = CASRE.match(lab)
            if closed and not c:
                cur = {"name": lab, "cas": ""}
                nsp += 1
                closed = False
            elif c and cur is not None:
                cur["cas"] = c.group(1)
                closed = True
        if rm and cur is not None:
            rows.append((cur, rm, page))
    with out.open("w") as f:
        f.write("cas\tname\tH_cp\tdlnH_dinvT\tref\ttype\tpage\n")
        for sp, rm, pg in rows:
            if not sp["cas"]:
                continue
            h = f"{num(rm.group('h')):.3g}" if rm.group("h") else ""
            d = rm.group("d") or ""
            f.write(f"{sp['cas']}\t{sp['name']}\t{h}\t{d}\t{rm.group('ref').strip()}\t"
                    f"{rm.group('t')}\t{pg}\n")
    print(f"species {nsp}, rows {len(rows)} -> {out}")


def load(tsv):
    out = {}
    for l in Path(tsv).read_text().split("\n")[1:]:
        if not l:
            continue
        c = l.split("\t")
        out.setdefault(c[0], []).append(dict(
            name=c[1], h=float(c[2]) if c[2] else None,
            d=float(c[3]) if c[3] else None, ref=c[4], t=c[5], page=c[6]))
    return out


def catalogue():
    m = {}
    for p in sorted(COMP.glob("*.dat")):
        t = p.read_text(errors="replace")
        c = re.search(r"^CAS\s+([\d-]+);", t, re.M)
        if c:
            m.setdefault(c.group(1), []).append(p.stem)
    return m


def existing():
    """Henry-water records NOT made by this tool (the thermo-library ones)."""
    return {p.stem[:-6] for p in HENRY.glob("*-water.dat")
            if "henry_sander/rows.tsv" not in p.read_text()}


def existing_values(sol):
    t = (HENRY / f"{sol}-water.dat").read_text()
    h = float(re.search(r"^H_ref\s+([-\d.eE+]+)\s*Pa;", t, re.M).group(1))
    e = float(re.search(r"^enthalpy\s+([-\d.eE+]+)\s*J/mol;", t, re.M).group(1))
    return h, e


# Water molar concentration [mol/m3] turning Hcp into the mole-fraction
# constant:  H_xp [Pa] = CW / Hcp.  Fixed by `control` against existing records.
CW = 55345.0


def summarise(rs):
    use = [r for r in rs if r["t"] in USED_TYPES and r["h"] is not None and r["h"] > 0]
    if not use:
        return None
    hs = [r["h"] for r in use]
    ds = [r["d"] for r in use if r["d"] is not None]
    return dict(n=len(use), med=statistics.median(hs), lo=min(hs), hi=max(hs),
                spread=max(hs) / min(hs),
                dmed=statistics.median(ds) if ds else None, nd=len(ds),
                pages=",".join(sorted({r["page"] for r in use}, key=int)))


MIN_DROWS = 2
COLS = ["cas", "solute", "nrows", "hcp_median", "hcp_min", "hcp_max", "spread",
        "dlnH_median", "ndlnH", "status", "H_ref_Pa", "enthalpy_Jmol", "pages"]


def derive(rows_tsv, out):
    """Summary of every catalogue component with a Sander entry (one line each)."""
    rows = load(rows_tsv)
    cat = catalogue()
    have = existing()
    lines = ["\t".join(COLS)]
    for cas, rs in sorted(rows.items()):
        if cas not in cat:
            continue
        s = summarise(rs)
        for sol in cat[cas]:
            if s is None:
                lines.append("\t".join([cas, sol, "0", "", "", "", "", "", "0", "noMLrows", "", "", ""]))
                continue
            if sol in have:
                status = "existsThermo"
            elif s["spread"] > SPREAD_LIMIT:
                status = "heldSpread"
            elif s["nd"] < MIN_DROWS:
                status = "heldNoEnthalpy"
            else:
                status = "new"
            href = CW / s["med"]
            enth = f"{-R * s['dmed']:.0f}" if s["nd"] >= MIN_DROWS else ""
            dm = f"{s['dmed']:.0f}" if s["dmed"] is not None else ""
            lines.append("\t".join([cas, sol, str(s["n"]), f"{s['med']:.3g}", f"{s['lo']:.3g}",
                                    f"{s['hi']:.3g}", f"{s['spread']:.3g}", dm, str(s["nd"]),
                                    status, f"{href:.4e}", enth, s["pages"]]))
    Path(out).write_text("\n".join(lines) + "\n")
    print(f"{len(lines) - 1} catalogue components with a Sander entry")


# Solutes that react with water (hydrolysis, disproportionation, acid
# dissociation): the record is the PHYSICAL molecular solubility of the
# molecule, as Sander states it, and says so.
REACTIVE = {
    "nitrogenTetroxide": "hydrolyses to HNO3 + HNO2",
    "phosgene": "hydrolyses to CO2 + HCl",
    "HONO": "weak acid, disproportionates to NO + HNO3",
    "HOCl": "weak acid, in equilibrium with Cl2 and Cl-",
    "bromine": "hydrolyses to HOBr + HBr",
    "H2O2": "very soluble; Sander's value is the molecular dilute limit",
    "pentanoicAcid": "weak acid; the record is the undissociated molecule",
}


def record_text(sol, cas, f):
    """The Henry record, from one summary line (a dict of its columns)."""
    return """/*--------------------------------*- Choupo -*-----------------------*\\
  Henry's-law constant for {sol} in liquid water (infinite dilution).

  Source DATA: Sander, R. (2015) "Compilation of Henry's law constants
  (version 4.0) for water as solvent," Atmos. Chem. Phys. 15, 4399-4981,
  doi:10.5194/acp-15-4399-2015, Table 6, p. {pages}.  Licensed CC-BY 3.0.

  CHANGES (indicated per CC-BY): the {nrows} Table 6 rows of types M
  (measured) and L (literature) were reduced to their MEDIAN Hcp
  = {hcp_median} mol/(m3 Pa) at 298.15 K (the PDF prints 2 significant
  figures; row range {hcp_min} to {hcp_max}, spread max/min {spread}) and converted to
  the mole-fraction constant H_ref = 55345 / Hcp [Pa] (55345 mol/m3 = water
  at 298.15 K).  The temperature coefficient is the median of the {ndlnH}
  d ln Hcp / d(1/T) values those rows carry ({dlnH_median} K), so
  enthalpy = -R * ({dlnH_median} K) = {enthalpy_Jmol} J/mol.  Rows of types Q (QSPR),
  E (estimates), V, T, X, C, ? and W are EXCLUDED.  Reproduce with
  bin/curate/henry_sander.py (rows: data/curation/batches/henry_sander/rows.tsv).
  A literature median, not a fit; not read by a human.

  NOTE: INFINITE-DILUTION coefficient -- for water-miscible species it is
  only the dilute limit; prefer an activity-coefficient model for the full
  composition range.  Validity ~273-373 K (linear Henry form).{react}
\\*---------------------------------------------------------------------------*/

solute      {sol};
solvent     water;

gasSpecies        {sol};
dissolvedSpecies  {sol};
convention        Sander-Hxp-v1;

model       vantHoff;
H_ref       {H_ref} Pa;
T_ref       298.15 K;
enthalpy    {enthalpy_Jmol}  J/mol;
Trange      ( 273  373 );

reviewStatus autoPromoted;
review      {{ by none; }}

provenance
{{
    origin        literature;
    source        "Sander 2015, ACP 15, 4399, doi:10.5194/acp-15-4399-2015, Table 6, p. {pages}; CC-BY 3.0";
    method        "median of {nrows} rows of types M and L, Sander 2015 Table 6";
    CAS           {cas};
    rowsUsed      {nrows};
    rowTypes      "M L";
    excluded      "Q (QSPR) E (estimate) V T X C ? W";
    hcpMedian     {hcp_median};   // mol/(m3 Pa), 2 significant figures as printed
    spread        {spread};   // max/min of the rows used
    dlnHrows      {ndlnH};
    rowsFile      "data/curation/batches/henry_sander/rows.tsv";
}}
""".format(sol=sol, cas=cas,
           react=("\n\n  REACTIVE SOLUTE: " + REACTIVE[sol] + ".  This is the PHYSICAL molecular\n  solubility only; the reaction is not in this record.") if sol in REACTIVE else "", H_ref=f"{float(f['H_ref_Pa']):.4e}", **{k: f[k] for k in COLS if k not in ("H_ref_Pa", "cas", "solute")})


def write(summary_tsv, only=None):
    n = 0
    for l in Path(summary_tsv).read_text().split("\n")[1:]:
        if not l:
            continue
        f = dict(zip(COLS, l.split("\t")))
        if f["status"] != "new" or (only and f["solute"] != only):
            continue
        (HENRY / f"{f['solute']}-water.dat").write_text(record_text(f["solute"], f["cas"], f))
        n += 1
    print(f"{n} records written")


BATCH = ROOT / "data" / "curation" / "batches" / "henry_sander"


def batch(rows_tsv):
    """Write the committed rows (types M and L of every catalogue species) and the summary."""
    rows = load(rows_tsv)
    cat = catalogue()
    out = ["cas\tname\tH_cp\tdlnH_dinvT\tref\ttype\tpage"]
    for cas in sorted(rows):
        if cas not in cat:
            continue
        for r in rows[cas]:
            if r["t"] in USED_TYPES:
                out.append("\t".join([cas, r["name"], "" if r["h"] is None else f"{r['h']:.3g}",
                                       "" if r["d"] is None else f"{r['d']:.0f}",
                                       r["ref"], r["t"], r["page"]]))
    BATCH.mkdir(parents=True, exist_ok=True)
    (BATCH / "rows.tsv").write_text("\n".join(out) + "\n")
    print(f"{len(out) - 1} rows -> {BATCH / 'rows.tsv'}")


def case():
    """The batch case: one pairLookup per promoted record (the catalogue's own evidence card)."""
    hdr = (BATCH.parent / "new_components_c309" / "system" / "controlDict").read_text()
    head = hdr.split("application")[0]
    (BATCH / "system").mkdir(parents=True, exist_ok=True)
    (BATCH / "constant").mkdir(parents=True, exist_ok=True)
    (BATCH / "henry_sander.cho").write_text("")
    (BATCH / "system" / "controlDict").write_text(head + (
        "application   choupoProps;\n"
        'description   "The Henry-water records made from Sander (2015) Table 6 (C321): the evidence card of each; '
        'H_ref and enthalpy are reproduced from rows.tsv by bin/curate/check_henry_records.py";\n'
        "verbosity     1;\n"))
    (BATCH / "constant" / "thermoPhysPropDict").write_text(
        "/*  Placeholder the bench requires; no operation reads it.  The case asks the\n"
        "    INSTALLATION catalogue, which holds the records.  */\n\n"
        "recordType    thermophysicalPropertySystem;\nschemaVersion 2;\n\n"
        "components       ( water );\n\n"
        "equilibrium\n{\n    formulation gammaPhi;\n"
        "    liquid { activityModel { model ideal; } }\n    vapour { fugacityModel idealGas; }\n}\n")
    ops = []
    for l in (BATCH / "summary.tsv").read_text().split("\n")[1:]:
        if l and l.split("\t")[9] == "new":
            sol = l.split("\t")[1]
            ops.append(f"    {{ name h_{sol}; type pairLookup; components ( {sol} water ); }}")
    note = (
        "/*---------------------------------------------------------------------------*\\\n"
        "  henry_sander -- the Henry-water records of data/standards/parameters/Henry/ made from\n"
        "  Sander (2015) Table 6 (DEV.md 4c C321, CC-BY 3.0, doi:10.5194/acp-15-4399-2015).\n"
        "  rows.tsv holds every M and L row of every catalogue species with the page it was read\n"
        "  on; summary.tsv the median, spread and status of each (new = promoted; heldSpread =\n"
        "  spread above 3x; heldNoEnthalpy = fewer than 2 d ln H/d(1/T) values: the loader REFUSES\n"
        "  a record without `enthalpy`, so none is written).  bin/curate/henry_sander.py rebuilds\n"
        "  them; bin/curate/check_henry_records.py holds each record to rows.tsv.  Each operation\n"
        "  asks the evidence card of one record.\n"
        "\\*---------------------------------------------------------------------------*/\n")
    (BATCH / "system" / "propsDict").write_text(head + note + "operations\n(\n" + "\n".join(ops) + "\n);\n")
    print(f"{len(ops)} operations")


def control(rows_tsv):
    rows = load(rows_tsv)
    cat = catalogue()
    for cas, sols in cat.items():
        for sol in sols:
            if sol in existing() and cas in rows:
                s = summarise(rows[cas])
                if s is None:
                    continue
                h, e = existing_values(sol)
                print(f"{sol}\t{h:.4e}\t{CW / s['med']:.4e}\t{h * s['med'] / CW:.3f}\t"
                      f"{e:.0f}\t{'' if s['dmed'] is None else -R * s['dmed']:}\t{s['n']}")


def main():
    a = sys.argv[1:]
    if a[0] == "extract":
        extract(Path(a[1]), Path(a[2]))
    elif a[0] == "derive":
        derive(a[1], a[2])
    elif a[0] == "case":
        case()
    elif a[0] == "batch":
        batch(a[1])
    elif a[0] == "write":
        write(a[1], a[2] if len(a) > 2 else None)
    elif a[0] == "control":
        control(a[1])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
