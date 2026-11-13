#!/usr/bin/env python3
"""One line per measured data file: points, T and P ranges, composition range,
stated uncertainty range (absolute and relative).  usage: summarise_data.py"""
import glob, os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
print("file\tn\tT_K\tP_MPa\tcomposition\tU_kg_m3\tU_rel_pct")
for f in sorted(glob.glob(os.path.join(HERE, "d[2-5]*.tsv"))):
    cols, rows = None, []
    doi = ""
    for line in open(f):
        if line.startswith("# DOI:"):
            doi = line.split(":", 1)[1].strip()
        if line.startswith("#") or not line.strip():
            continue
        v = line.rstrip("\n").split("\t")
        if cols is None:
            cols = v
            continue
        rows.append(dict(zip(cols, v)))
    num = lambda k, rs=rows: [float(r[k]) for r in rs if r.get(k) not in (None, "")]
    comp = [c for c in cols if c.startswith(("x_", "w_", "m_"))]
    ctxt = "; ".join(f"{c} {min(num(c)):.4g}-{max(num(c)):.4g}" for c in comp) if comp else "not stated per point"
    U = num("U_kg_m3")
    rel = [100 * float(r["U_kg_m3"]) / float(r["rho_kg_m3"]) for r in rows if r.get("U_kg_m3")]
    P = [p / 1000 for p in num("P_kPa")]
    print("\t".join([os.path.basename(f) + " (" + doi + ")", str(len(rows)), f"{min(num('T_K')):g}-{max(num('T_K')):g}",
                     f"{min(P):g}-{max(P):g}", ctxt, f"{min(U):g}-{max(U):g}" if U else "-",
                     f"{min(rel):.2f}-{max(rel):.2f}" if rel else "-"]))
