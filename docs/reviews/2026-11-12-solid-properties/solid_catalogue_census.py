#!/usr/bin/env python3
"""Census of solid-property data in data/standards/components (review C361/solids, 2026-11-12).

Run from the repository root:
    python3 -I docs/reviews/2026-11-12-solid-properties/solid_catalogue_census.py \
        > docs/reviews/2026-11-12-solid-properties/solid_catalogue_census.tsv
A summary (counts per field) is written to stderr.

A record is counted as SOLID-BEARING when it has any of:
  standardThermochemistry.referenceState pureSolid; a solidPhases{} block;
  a flat solid{} block; a polymer{} block.
Fields are read the way src/thermo/Component.cpp reads them (lines ~605-630,
730-736, 1132-1258): crystal density and k_v from the FIRST
solidPhases.<phase>.crystal{} else from the flat solid{}; solid Cp from
solidHeatCapacity{}; the fusion enthalpy from sublimation{Hfus}; a melting
temperature from triplePoint{T} (the only T the solid phase model reads, see
water.dat) -- a polymer{Tm} or a top-level rho_p is listed separately because
no engine reader of Component reads it.
"""
import os, re, sys

ROOT = os.path.join("data", "standards", "components")

def strip_comments(t):
    t = re.sub(r"/\*.*?\*/", " ", t, flags=re.S)
    out = []
    for line in t.splitlines():
        # remove // comments outside strings
        res, instr = "", False
        i = 0
        while i < len(line):
            c = line[i]
            if c == '"':
                instr = not instr
            if not instr and line.startswith("//", i):
                break
            res += c; i += 1
        out.append(res)
    return "\n".join(out)

TOK = re.compile(r'"[^"]*"|[{}();]|[^\s{}();"]+')

def parse(tokens, i=0, close=None):
    d = {}
    while i < len(tokens):
        t = tokens[i]
        if t == close:
            return d, i + 1
        if t in "{}();":
            i += 1; continue
        key = t; i += 1
        if i < len(tokens) and tokens[i] == "{":
            sub, i = parse(tokens, i + 1, "}")
            d[key] = sub
        else:
            vals, depth = [], 0
            while i < len(tokens):
                u = tokens[i]
                if u == "(":
                    depth += 1
                elif u == ")":
                    depth -= 1
                elif u == ";" and depth <= 0:
                    i += 1; break
                elif u in "{}" and depth <= 0:
                    break
                vals.append(u); i += 1
            d.setdefault(key, vals)
    return d, i

def load(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        toks = TOK.findall(strip_comments(f.read()))
    return parse(toks)[0]

def get(d, *path):
    for p in path:
        if not isinstance(d, dict) or p not in d:
            return None
        d = d[p]
    return d

rows = []
for fn in sorted(os.listdir(ROOT)):
    if not fn.endswith(".dat"):
        continue
    d = load(os.path.join(ROOT, fn))
    name = fn[:-4]
    st = get(d, "standardThermochemistry")
    ref = (get(st, "referenceState") or ["-"])[0] if isinstance(st, dict) else "-"
    sp = get(d, "solidPhases")
    flat = get(d, "solid") if isinstance(get(d, "solid"), dict) else None
    poly = get(d, "polymer") if isinstance(get(d, "polymer"), dict) else None
    solid_bearing = (ref == "pureSolid") or isinstance(sp, dict) or flat is not None or poly is not None
    if not solid_bearing:
        continue
    # crystal props as Component.cpp reads them
    crystal_src, rho, kv = "-", None, None
    if isinstance(sp, dict):
        for ph, pd in sp.items():
            if isinstance(pd, dict) and isinstance(pd.get("crystal"), dict):
                cr = pd["crystal"]; crystal_src = "solidPhases." + ph + ".crystal"
                rho = (cr.get("rho_p") or [None])[0]; kv = (cr.get("k_v") or [None])[0]
                break
    if crystal_src == "-" and flat is not None:
        crystal_src = "solid{}"
        rho = (flat.get("rho_p") or [None])[0]; kv = (flat.get("k_v") or [None])[0]
    toplevel_rho = (d.get("rho_p") or [None])[0] if not isinstance(d.get("rho_p"), dict) else None
    shc = get(d, "solidHeatCapacity")
    cp_solid = (shc.get("model") or ["?"])[0] if isinstance(shc, dict) else "-"
    poly_cp = (poly.get("Cp_solid") or [None])[0] if poly else None
    # formation reachable for the solid
    dissoc = "dissociatesTo" in d
    dsoln = False
    if isinstance(sp, dict):
        for pd in sp.values():
            if isinstance(pd, dict) and isinstance(get(pd, "calorimetric", "dissolutionEnthalpy"), dict):
                dsoln = True
    if isinstance(st, dict):
        formation = "direct(" + ref + ")"
    elif dissoc and dsoln:
        formation = "ion-derived(dissolutionEnthalpy)"
    else:
        formation = "-"
    tp = get(d, "triplePoint")
    tm = (tp.get("T") or [None])[0] if isinstance(tp, dict) else None
    poly_tm = (poly.get("Tm") or [None])[0] if poly else None
    sub = get(d, "sublimation")
    hfus = (sub.get("Hfus") or [None])[0] if isinstance(sub, dict) else None
    psd = any(k in d for k in ("psd", "sizeDistribution"))
    bulk = [k for k in ("bulkDensity", "porosity", "angleOfRepose", "sorption", "isotherm") if k in d]
    rows.append(dict(
        name=name, referenceState=ref,
        solidPhases=",".join(sp.keys()) if isinstance(sp, dict) else "-",
        crystal_source=crystal_src, rho_p=rho or "-", k_v=kv or "-",
        toplevel_rho_p_unread=toplevel_rho or "-",
        solidHeatCapacity_model=cp_solid, polymer_Cp_solid_unread=poly_cp or "-",
        formation=formation, triplePoint_T=tm or "-", polymer_Tm_unread=poly_tm or "-",
        sublimation_Hfus=hfus or "-", psd_default="yes" if psd else "-",
        bulk_keys=",".join(bulk) or "-"))

cols = list(rows[0].keys())
print("\t".join(cols))
for r in rows:
    print("\t".join(str(r[c]) for c in cols))

def count(pred):
    return sum(1 for r in rows if pred(r))
N = len(rows)
summ = [
    ("solid-bearing records", N, ""),
    ("referenceState pureSolid", count(lambda r: r["referenceState"] == "pureSolid"), ""),
    ("carry solidPhases{}", count(lambda r: r["solidPhases"] != "-"), ""),
    ("crystal density rho_p read by Component", count(lambda r: r["rho_p"] != "-"), ""),
    ("rho_p only at top level (unread)", count(lambda r: r["rho_p"] == "-" and r["toplevel_rho_p_unread"] != "-"), ""),
    ("k_v declared", count(lambda r: r["k_v"] != "-"), ""),
    ("rho_p declared but k_v absent (pi/6 default)", count(lambda r: r["rho_p"] != "-" and r["k_v"] == "-"), ""),
    ("solidHeatCapacity{} (any model)", count(lambda r: r["solidHeatCapacity_model"] != "-"), ""),
    ("formation direct (standardThermochemistry)", count(lambda r: r["formation"].startswith("direct")), ""),
    ("formation ion-derived only", count(lambda r: r["formation"].startswith("ion")), ""),
    ("no formation route", count(lambda r: r["formation"] == "-"), ""),
    ("triplePoint T (melting T read)", count(lambda r: r["triplePoint_T"] != "-"), ""),
    ("polymer Tm (unread)", count(lambda r: r["polymer_Tm_unread"] != "-"), ""),
    ("sublimation Hfus", count(lambda r: r["sublimation_Hfus"] != "-"), ""),
    ("size-distribution default", count(lambda r: r["psd_default"] != "-"), ""),
    ("bulk keys", count(lambda r: r["bulk_keys"] != "-"), ""),
]
for k, v, _ in summ:
    sys.stderr.write(f"{k}\t{v}\n")

# Whole catalogue (not only solid-bearing records): the melting data the solid
# phase model reads -- triplePoint{T} (used as Tfus by SolidPhase) and sublimation{Hfus}.
allrec = [load(os.path.join(ROOT, f)) for f in sorted(os.listdir(ROOT)) if f.endswith(".dat")]
sys.stderr.write("ALL records\t%d\n" % len(allrec))
sys.stderr.write("ALL with triplePoint{T}\t%d\n" % sum(1 for d in allrec if isinstance(get(d, "triplePoint"), dict)))
sys.stderr.write("ALL with sublimation{Hfus}\t%d\n" % sum(1 for d in allrec if get(d, "sublimation", "Hfus")))
sys.stderr.write("ALL with solidHeatCapacity{}\t%d\n" % sum(1 for d in allrec if isinstance(get(d, "solidHeatCapacity"), dict)))
