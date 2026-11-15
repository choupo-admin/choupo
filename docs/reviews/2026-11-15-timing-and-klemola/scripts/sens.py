import json, os, re, shutil, subprocess, sys
W = sys.argv[1]; S = sys.argv[2]
CASE = W + "/tutorials/steady/distillation/column14_klemola_c4_splitter"
def mw(c):
    t = open(f"{CASE}/constant/components/{c}.dat").read()
    return float(re.search(r'^MW\s+([0-9.eE+-]+)', t, re.M).group(1))
runs = [("base", []),
        ("P 685 kPa", [("P              658.6 kPa;", "P              685 kPa;")]),
        ("P 710 kPa", [("P              658.6 kPa;", "P              710 kPa;")]),
        ("feed stage 38", [("feedStage      37;", "feedStage      38;")]),
        ("E_MV 1.10", [("murphreeEfficiency 1.191;", "murphreeEfficiency 1.10;")]),
        ("E_MV 1.00", [("murphreeEfficiency 1.191;", "murphreeEfficiency 1.0;")]),
        ("saturated reflux", [("            refluxTemperature 18.5 degC;        // Table 2 (7): subcooled reflux", "")]),
        ("ideal liquid", "IDEAL")]
out = []
for name, edits in runs:
    d = f"{S}/run_{re.sub(r'[^a-z0-9]+','_',name.lower())}"
    shutil.rmtree(d, ignore_errors=True); shutil.copytree(CASE, d)
    if edits == "IDEAL":
        p = d + "/constant/thermoPhysPropDict"; t = open(p).read()
        t2 = re.sub(r'activityModel\s*\{[^}]*\}', 'activityModel ideal', t, count=1)
        if t2 == t: t2 = re.sub(r'activityModel\s+UNIFAC\s*;', 'activityModel ideal;', t, count=1)
        assert t2 != t, "no activity model found"; open(p, "w").write(t2)
    else:
        p = d + "/system/flowsheetDict"; t = open(p).read()
        for a, b in edits:
            assert t.count(a) == 1, a; t = t.replace(a, b)
        open(p, "w").write(t)
    env = dict(os.environ, CHOUPO_HOME=W)
    r = subprocess.run([W + "/choupoSolve", d], capture_output=True, text=True, env=env, timeout=900)
    js = [f for f in os.listdir(d) if f.endswith(".json") and "result" in f.lower()]
    res = None
    for cand in ["result.json", "postProcessing/result.json"] + js:
        if os.path.exists(f"{d}/{cand}"): res = json.load(open(f"{d}/{cand}")); break
    if res is None:
        out.append((name, f"rc={r.returncode} no result json; tail: {r.stdout[-300:]} {r.stderr[-300:]}")); continue
    st = res.get("streams", {})
    def wt(stream, comp):
        s = st[stream]; f = s.get("componentMolarFlows") or s.get("F_i") or {}
        tot = sum(v * mw(c) for c, v in f.items()); return 100 * f[comp] * mw(comp) / tot
    k = res.get("kpis", {}).get("splitter", {})
    q = k.get("Q_reboiler_kW") or k.get("Q_reb_kW") or k.get("Q_reboiler")
    print(name, flush=True); out.append((name, f"rc={r.returncode}  nC4 in D {wt('distillate','nButane'):.4f} wt%   iC4 in D {wt('distillate','isoButane'):.3f} wt%   iC4 in B {wt('bottoms','isoButane'):.4f} wt%   nC4 in B {wt('bottoms','nButane'):.3f} wt%   Qreb {q}"))
for n, s in out: print(f"{n:18s} {s}")
