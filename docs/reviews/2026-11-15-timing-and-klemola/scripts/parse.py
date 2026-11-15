import re, sys, os, glob
S = sys.argv[1]; CASE = sys.argv[2]
def mw(c):
    return float(re.search(r'^MW\s+([0-9.eE+-]+)', open(f"{CASE}/constant/components/{c}.dat").read(), re.M).group(1))
def flows(p):
    t = open(p).read(); b = re.search(r'componentMolarFlows\s*\{([^}]*)\}', t).group(1)
    return {k: float(v) for k, v in re.findall(r'(\w+)\s+([0-9.eE+-]+)', b)}
def wt(f, c):
    tot = sum(v * mw(k) for k, v in f.items()); return 100 * f[c] * mw(c) / tot
for d in sorted(glob.glob(S + "/run_*")):
    try:
        D = flows(d + "/converged/distillate"); B = flows(d + "/converged/bottoms")
    except Exception as e:
        print(f"{os.path.basename(d):28s} no converged state ({e})"); continue
    q = ""
    for f in glob.glob(d + "/reports/**/*", recursive=True):
        pass
    print(f"{os.path.basename(d):28s} nC4 in D {wt(D,'nButane'):.4f}   iC4 in D {wt(D,'isoButane'):.3f}   iC4 in B {wt(B,'isoButane'):.4f}   nC4 in B {wt(B,'nButane'):.3f}  (wt %)")
