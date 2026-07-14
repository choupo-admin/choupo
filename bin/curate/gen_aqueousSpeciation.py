import re, os
src = open("data/standards/electrolyte/speciation.dat").read()
body = re.search(r'reactions\s*\((.*)\)', src, re.S).group(1)
outdir = "data/standards/chemistry/aqueousSpeciation"; os.makedirs(outdir, exist_ok=True)
def recs(s):
    out=[];i=0
    while True:
        j=s.find("{",i)
        if j<0:break
        depth=0;k=j
        while k<len(s):
            if s[k]=="{":depth+=1
            elif s[k]=="}":
                depth-=1
                if depth==0:break
            k+=1
        out.append(s[j+1:k]);i=k+1
    return out
n=0
for rec in recs(body):
    sm=re.search(r'\bspecies\s+(\w+)', rec)
    if not sm: continue
    sp=sm.group(1)
    out=["recordType aqueousSpeciation;","schemaVersion 1;","",rec.strip(),"",
         'origin "data/standards/electrolyte/speciation.dat";']
    open(f"{outdir}/{sp}.dat","w").write("\n".join(out)+"\n")
    n+=1
print(f"gerados {n} reações de speciation")
