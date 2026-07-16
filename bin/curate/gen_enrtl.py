import re, os
src = open("data/standards/electrolyte/enrtl.dat").read()
body = re.search(r'enrtl\s*\((.*)\)', src, re.S).group(1)
outdir = "data/standards/parameters/eNRTL"
os.makedirs(outdir, exist_ok=True)
def tok(b,k):
    m = re.search(rf'\b{k}\b\s+(-?[\w.+-]+)\s*;', b); return m.group(1) if m else None
n=0
for row in re.finditer(r'\{([^{}]*)\}', body):
    b = row.group(1)
    cat, an = tok(b,"cation"), tok(b,"anion")
    if not cat or not an: continue
    tmc, tcm, al = tok(b,"tau_m_ca"), tok(b,"tau_ca_m"), tok(b,"alpha")
    sm = re.search(r'source\s+"([^"]*)"', b); source = sm.group(1) if sm else None
    L = ["recordType electrolyteNRTLParameters;","schemaVersion 1;\n","model eNRTL;\n",
         f"pair {{ cation {cat}; anion {an}; }}\n","parameters","{"]
    if tmc: L.append(f"    tau_m_ca {tmc};")
    if tcm: L.append(f"    tau_ca_m {tcm};")
    if al:  L.append(f"    alpha {al};")
    L.append("}\n")
    if source: L.append(f'source "{source}";')
    L.append('origin "data/standards/electrolyte/enrtl.dat";')
    open(f"{outdir}/{cat}-{an}.dat","w").write("\n".join(L)+"\n")
    n+=1
print(f"gerados {n} records eNRTL")
