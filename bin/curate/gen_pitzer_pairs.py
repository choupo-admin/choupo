import re, os
src = open("data/standards/electrolyte/pairs.dat").read()
body = re.search(r'pairs\s*\((.*)\)', src, re.S).group(1)
outdir = "data/standards/parameters/electrolyte/pitzer/pairs"
os.makedirs(outdir, exist_ok=True)
NUM = ["beta0","beta1","beta2","Cphi","alpha1","alpha2","dbeta0_dT","dbeta1_dT","dCphi_dT","lphiValidityMax"]
def tok(b,k):
    m = re.search(rf'\b{k}\b\s+(-?[\w.+-]+)\s*;', b);  return m.group(1) if m else None
n=0
for row in re.finditer(r'\{([^{}]*)\}', body):
    b = row.group(1)
    cat, an = tok(b,"cation"), tok(b,"anion")
    if not cat or not an: continue
    sm = re.search(r'source\s+"([^"]*)"', b)
    source = sm.group(1) if sm else None
    calfit = tok(b,"calorimetricFit")
    L = ["recordType electrolytePairParameters;","schemaVersion 1;\n","model pitzer;\n",
         f"pair {{ cation {cat}; anion {an}; }}\n","parameters","{"]
    for k in NUM:
        v = tok(b,k)
        if v is not None: L.append(f"    {k} {v};")
    if calfit is not None: L.append(f"    calorimetricFit {calfit};")
    L.append("}\n")
    if source: L.append(f'source "{source}";')
    L.append('origin "data/standards/electrolyte/pairs.dat";')
    open(f"{outdir}/{cat}-{an}.dat","w").write("\n".join(L)+"\n")
    n+=1
print(f"regenerados {n} pares")
