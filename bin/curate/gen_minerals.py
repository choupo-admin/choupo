import re, os
src = open("data/standards/electrolyte/minerals.dat").read()
body = re.search(r'minerals\s*\((.*)\)', src, re.S).group(1)
outdir = "data/standards/chemistry/mineralSolubility"
os.makedirs(outdir, exist_ok=True)
def records(s):
    out=[]; i=0
    while True:
        j=s.find("{", i)
        if j<0: break
        depth=0; k=j
        while k<len(s):
            if s[k]=="{": depth+=1
            elif s[k]=="}":
                depth-=1
                if depth==0: break
            k+=1
        out.append(s[j+1:k]); i=k+1
    return out
n=0
for rec in records(body):
    mm=re.search(r'\bmineral\s+(\w+)', rec)
    if not mm: continue
    mineral=mm.group(1)
    out=["recordType mineralSolubility;","schemaVersion 1;","", rec.strip(), "",
         'origin "data/standards/electrolyte/minerals.dat";']
    open(f"{outdir}/{mineral}.dat","w").write("\n".join(out)+"\n")
    n+=1
print(f"gerados {n} minerais")
