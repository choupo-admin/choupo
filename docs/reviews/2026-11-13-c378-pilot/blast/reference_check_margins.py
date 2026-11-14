import re, sys, math
R, LOG = sys.argv[1], sys.argv[2]
UNIT = {"MPa":1e6, "kPa":1e3, "Pa":1.0}
def entries(path):
    t = open(path).read()
    t = t[t.find("checkValues"):]
    out = {}
    for blk in re.findall(r"\{\s*table[^{}]*\}", t):
        tab = re.search(r'table\s+"([^"]+)"', blk).group(1)
        T = float(re.search(r"\bT\s+([0-9.eE+-]+)\s*K", blk).group(1))
        d = int(re.search(r"digits\s+(\d+)", blk).group(1))
        sc = re.search(r"printedScale\s+([0-9.eE+-]+)", blk)
        sc = float(sc.group(1)) if sc else 1.0
        for q in re.findall(r"\b([A-Za-z_][A-Za-z_0-9]*)\s+-?[0-9][0-9.eE+-]*\s+[A-Za-z/0-9]+;", blk):
            out[(tab, round(T, 6), q)] = (d, sc)
    return out
files = ["IAPWS95.dat", "SpanWagner1996.dat", "Span2000.dat", "SetzmannWagner1991.dat"]
names = ["water", "carbon dioxide", "nitrogen", "methane"]
logs = open(LOG).read().split("check values of the publication")[1:]
for name, f, chunk in zip(names, files, logs):
    E = entries(f"{R}/{f}")
    rows = []
    for l in chunk.splitlines():
        m = re.search(r"\[referenceEoS\]\s+(ok|FAIL)\s+(.*?): (\w+): published (\S+), computed (\S+)", l)
        if not m: continue
        st, where, q, pub, calc = m.groups()
        tab = where.split("  ")[0].strip()
        T = re.search(r"T = ([0-9.eE+-]+) K", where)
        key = (tab, round(float(T.group(1)), 6), q) if T else None
        if key not in E: continue
        d, sc = E[key]; p = float(pub); c = float(calc)
        if p == 0: continue
        e = math.floor(math.log10(abs(p / sc)))
        half = 0.5 * 10 ** (e - d + 1) * abs(sc)
        rows.append(((half - abs(c - p)) / abs(p), abs(c - p) / half, where, q, pub, calc))
    rows.sort()
    print(f"{name}: {len(rows)} checks paired; the four closest to failing (margin relative to the value; share of the half-unit used):")
    for r in rows[:4]:
        print(f"   margin {r[0]:.2e}  used {r[1]:.3f}  {r[2]}: {r[3]} published {r[4]} computed {r[5]}")
