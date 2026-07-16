import re, os
src = open("data/standards/electrolyte/mixing.dat").read()
body = re.search(r'mixing\s*\((.*)\)', src, re.S).group(1)
base = "data/standards/parameters/Pitzer/mixing"
def tok(b,k):
    m = re.search(rf'\b{k}\b\s+(-?[\w.+()-]+)\s*;', b); return m.group(1) if m else None
n=0
for row in re.finditer(r'\{([^{}]*)\}', body):
    b = row.group(1); kind = tok(b,"kind")
    if not kind: continue
    sm = re.search(r'source\s+"([^"]*)"', b); source = sm.group(1) if sm else None
    val = tok(b, kind)
    if kind=="theta":  keys=[("a",tok(b,"a")),("b",tok(b,"b"))]; fn=f"{tok(b,'a')}-{tok(b,'b')}"
    elif kind=="psi":  keys=[("a",tok(b,"a")),("b",tok(b,"b")),("c",tok(b,"c"))]; fn=f"{tok(b,'a')}-{tok(b,'b')}-{tok(b,'c')}"
    elif kind=="lambda": keys=[("n",tok(b,"n")),("ion",tok(b,"ion"))]; fn=f"{tok(b,'n')}-{tok(b,'ion')}"
    elif kind=="zeta": keys=[("n",tok(b,"n")),("c",tok(b,"c")),("a",tok(b,"a"))]; fn=f"{tok(b,'n')}-{tok(b,'c')}-{tok(b,'a')}"
    else: continue
    d=f"{base}/{kind}"; os.makedirs(d, exist_ok=True)
    L=["recordType electrolyteMixingParameter;","schemaVersion 1;",f"kind {kind};"]
    for k,v in keys: L.append(f"{k} {v};")
    L.append(f"value {val};")
    if source: L.append(f'source "{source}";')
    L.append('origin "data/standards/electrolyte/mixing.dat";')
    open(f"{d}/{fn}.dat","w").write("\n".join(L)+"\n")
    n+=1
print(f"gerados {n} termos de mixing")
