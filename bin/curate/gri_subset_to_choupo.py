#!/usr/bin/env python3
# Extract the H/O subsystem of GRI-Mech 3.0 (thirdParty/grimech30.dat) as a
# Choupo reactions dict.  VERBATIM transcription: A/b/Ea stay in the file's
# own mol-cm-s-cal units, declared via kinetics.units{} so the engine does
# (and announces) the conversion -- zero hand-converted numbers.
import re, sys
from pathlib import Path

NUM = r"-?(?:\d+\.?\d*|\.\d+)(?:[Ee][+-]?\d+)?"
KEEP = {"H2", "O2", "H", "O", "OH", "HO2", "H2O2", "H2O", "N2"}   # no AR in the case
NAME = {"H2O": "water"}   # Choupo component names

root = Path(__file__).resolve().parents[2]
raw = (root / "thirdParty/grimech30.dat").read_text().splitlines()
i0 = next(i for i, l in enumerate(raw) if l.strip() == "REACTIONS")
lines = raw[i0+1:]

def side_species(side):
    out = []
    for tok in side.split("+"):
        tok = tok.strip()
        if not tok or tok == "M":
            continue
        m = re.match(r"^(\d+)(.*)$", tok)
        n, sp = (int(m.group(1)), m.group(2)) if m else (1, tok)
        out.append((sp.strip(), n))
    return out

rxns = []
i = 0
while i < len(lines):
    ln = lines[i].strip()
    if ln == "END":
        break
    if not ln or ln.startswith("!"):
        i += 1; continue
    m = re.match(r"^(\S+?)\s*(<=>|=>|=)\s*(\S+?)\s+([\d.Ee+-]+)\s+([\d.Ee+-]+)\s+([\d.Ee+-]+)\s*$",
                 ln.replace(" +", "+").replace("+ ", "+"))
    if not m:
        i += 1; continue
    lhs, arrow, rhs, A, b, Ea = m.groups()
    falloff = "(+M)" in lhs
    tbody   = (not falloff) and ("+M" in lhs.replace("(+M)", ""))
    lhs_c = lhs.replace("(+M)", "").replace("+M", "")
    rhs_c = rhs.replace("(+M)", "").replace("+M", "")
    reac, prod = side_species(lhs_c), side_species(rhs_c)
    species = {s for s, _ in reac} | {s for s, _ in prod}
    entry = dict(lhs=lhs, rhs=rhs, arrow=arrow, A=float(A), b=float(b), Ea=float(Ea),
                 reac=reac, prod=prod, falloff=falloff, tbody=tbody,
                 eff={}, low=None, troe=None, dup=False, src=ln)
    # continuation lines: efficiencies / LOW / TROE / DUPLICATE
    j = i + 1
    while j < len(lines):
        nxt = lines[j].strip()
        if nxt.upper().startswith("LOW"):
            entry["low"] = [float(x) for x in re.findall(NUM, nxt)[:3]]
        elif nxt.upper().startswith("TROE"):
            entry["troe"] = [float(x) for x in re.findall(NUM, nxt)]
        elif nxt.upper().startswith("DUPLICATE"):
            entry["dup"] = True
        elif re.match(r"^([A-Z0-9()]+/\s*[\d.]+/\s*)+$", nxt.replace(" ", "").replace("/", "/ ") or "x") or re.match(r"^\S+/", nxt):
            for sp, v in re.findall(r"([A-Za-z0-9()]+)\s*/\s*([\d.]+)\s*/", nxt):
                entry["eff"][sp] = float(v)
        else:
            break
        j += 1
    i = j
    if species <= KEEP:
        rxns.append(entry)

# drop AR-collider-only entries already excluded by KEEP; report
print(f"H/O subset: {len(rxns)} reactions")
seen = {}
out = []
for e in rxns:
    slug = re.sub(r"[^A-Za-z0-9]+", "_", e["lhs"] + "_" + e["rhs"]).strip("_")
    if slug in seen:
        seen[slug] += 1; slug += f"_dup{seen[slug]}"
    else:
        seen[slug] = 1
    ck = lambda sp: NAME.get(sp, sp)
    sto = []
    consumed = {}
    for sp, n in e["reac"]:
        consumed[sp] = consumed.get(sp, 0) + n
    produced = {}
    for sp, n in e["prod"]:
        produced[sp] = produced.get(sp, 0) + n
    allsp = sorted(set(consumed) | set(produced))
    for sp in allsp:
        nu = produced.get(sp, 0) - consumed.get(sp, 0)
        order = consumed.get(sp, 0)
        if nu == 0 and order > 0:   # explicit collider (reactant AND product)
            sto.append((ck(sp), 0, order, "explicit collider"))
        elif nu != 0:
            sto.append((ck(sp), nu, order, None))
    molec = sum(consumed.values())
    lim = min((sp for sp in consumed), key=lambda s: -consumed[s])
    kin = []
    if e["falloff"]:
        kin.append("        type falloff;")
        kin.append(f"        A {e['A']:.4e};  b {e['b']};  Ea {e['Ea']};")
        kin.append(f"        low  {{ A {e['low'][0]:.4e};  b {e['low'][1]};  Ea {e['low'][2]};"
                   f"  units {{ A \"cm3/mol/s\"; Ea \"cal/mol\"; }} }}")
        if e["troe"]:
            kin.append(f"        troe ( {' '.join(str(x) for x in e['troe'])} );")
    elif e["tbody"]:
        kin.append("        type thirdBody;")
        kin.append(f"        A {e['A']:.4e};  b {e['b']};  Ea {e['Ea']};")
    else:
        kin.append("        type modifiedArrhenius;")
        kin.append(f"        A {e['A']:.4e};  b {e['b']};  Ea {e['Ea']};")
    if (e["tbody"] or e["falloff"]):
        effs = {NAME.get(k, k): v for k, v in e["eff"].items() if k in KEEP}
        if effs:
            kin.append("        thirdBody { " + " ".join(f"{k} {v};" for k, v in effs.items()) + " }")
    kin.append('        units { A "cm3/mol/s"; Ea "cal/mol"; }')
    body  = [f"{slug}" + (f"   // {e['src'][:60]}" if False else ""), "{"]
    body.append(f"    // GRI-Mech 3.0:  {e['src']}")
    if e["dup"]: body.append("    // DUPLICATE pair in GRI: both entries kept, rates ADD.")
    body.append("    reversible        true;" if e["arrow"] == "<=>" else "    reversible        false;")
    body.append(f"    limitingReactant  {ck(lim)};")
    body.append("    stoichiometry")
    body.append("    (")
    for sp, nu, order, note in sto:
        c = f"   // {note}" if note else ""
        body.append(f"        {{ component {sp+chr(59):7s} nu {nu:2d};  order {order}; }}{c}")
    body.append("    );")
    body.append("    kinetics")
    body.append("    {")
    body += kin
    body.append("    }")
    body.append("}")
    out.append("\n".join(body))
print("\n\n".join(out[:2]))
Path("/tmp/gri_ho_subset.txt").write_text("\n\n".join(out) + "\n")
print(f"\n-> /tmp/gri_ho_subset.txt ({len(out)} reactions)")
