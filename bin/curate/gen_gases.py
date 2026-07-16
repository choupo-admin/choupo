import re, os
src = open("data/standards/electrolyte/gases.dat").read()
body = re.search(r'gases\s*\((.*)\)', src, re.S).group(1)
outdir = "data/standards/chemistry"
os.makedirs(outdir, exist_ok=True)
n=0
for row in re.finditer(r'\{([^{}]*)\}', body):
    content = row.group(1).strip()
    gm = re.search(r'\bgas\s+(\w+)', content)
    if not gm: continue
    gas = gm.group(1)
    out = ["recordType gasLiquidEquilibrium;","schemaVersion 1;","", content, "",
           'origin "data/standards/electrolyte/gases.dat";']
    open(f"{outdir}/{gas}.dat","w").write("\n".join(out)+"\n")
    n+=1
print(f"gerados {n} gases")
