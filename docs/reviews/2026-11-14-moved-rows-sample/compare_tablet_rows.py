import sys, subprocess, re, csv, glob
T = sys.argv[1]
def sh(*a): return subprocess.run(a, capture_output=True, text=True).stdout
PRE = sys.argv[2]   # commit before the batch
rows = list(csv.DictReader(open(T), delimiter="\t"))
cases = sorted(set(r["case"] for r in rows))
paths = {}
for c in cases:
    p = [l for l in sh("git", "ls-files", f"tutorials/*/{c}/expected", f"tutorials/*/*/{c}/expected", f"tutorials/*/*/*/{c}/expected").split() if l]
    paths[c] = p[0]
def parse(text):
    d = {}
    for l in text.splitlines():
        f = l.split()
        if len(f) < 4 or f[0].startswith("#"): continue
        kind = f[0]
        key = f"{kind}.{f[1]}.{f[2]}"
        d.setdefault(key, []).append(f[3])
    return d
def num(s):
    try: return float(s)
    except: return None
tot = ok = 0; bad = []; moved_not_listed = []
for c in cases:
    new = parse(sh("git", "show", f"origin/main:{paths[c]}"))
    old = parse(sh("git", "show", f"{PRE}:{paths[c]}"))
    listed = {r["row"]: r for r in rows if r["case"] == c}
    for key, r in listed.items():
        tot += 1
        got = new.get(key)
        want = num(r["got_on_fix_pharma_installed_size_03ea1ab786"])
        if not got: bad.append((c, key, "row absent on main", r["got_on_fix_pharma_installed_size_03ea1ab786"])); continue
        g = num(got[0])
        if g is None or want is None:
            if got[0] == r["got_on_fix_pharma_installed_size_03ea1ab786"]: ok += 1
            else: bad.append((c, key, got[0], r["got_on_fix_pharma_installed_size_03ea1ab786"]))
            continue
        rel = abs(g - want) / max(abs(want), 1e-300) if want != 0 else abs(g)
        if rel <= 1e-9: ok += 1
        else: bad.append((c, key, got[0], r["got_on_fix_pharma_installed_size_03ea1ab786"], f"rel {rel:.2e}"))
    for key in new:
        if key in old and new[key] != old[key] and key not in listed:
            moved_not_listed.append((c, key, old[key][0], new[key][0]))
    added = [k for k in new if k not in old]; removed = [k for k in old if k not in new]
    print(f"{c}: {len(listed)} listed; rows on main {sum(len(v) for v in new.values())}; added {len(added)}, removed {len(removed)}")
    for k in added[:8]: print("   added:", k, new[k][0])
    for k in removed[:8]: print("   removed:", k, old[k][0])
print(f"listed rows {tot}: equal to my list on main {ok}; different {len(bad)}")
for b in bad[:20]: print("   DIFF", b)
print(f"rows that moved on main and are NOT in my list: {len(moved_not_listed)}")
for m in moved_not_listed[:20]: print("   EXTRA", m)
