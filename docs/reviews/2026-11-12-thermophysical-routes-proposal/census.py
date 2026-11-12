#!/usr/bin/env python3
"""C378 review -- counts behind the reproductions and the attacks.

Run (from anywhere):  python3 -I census.py <repo-root>  > census.tsv
Read-only.  Every count is a regular-expression scan of the tracked tree;
comments (// and /* */) are stripped before a record is read.

Sections (column 1):
  assoc       the three facts revision 2 derives `associating` from (§3.2)
  undetected  records whose NAME suggests a hydrogen-bonding liquid and that
              carry none of those facts (a reviewer's survey heuristic, by
              name; NOT a proposed rule)
  vliqT       the temperature each record's `Vliq` comment states
  vliqBranch  which branch of ThermoPackage::liquidMolarVolumeOf a record
              reaches (anchored / flat / bare / neither)
  approx      every `approximations {}` word in tutorials/ and data/, and
              whether it carries `reason`
  brockBird   case dicts declaring `model BrockBird` and whether water is a
              component
  rawVliq     raw `.Vliq()` reads in src/ (file:line), and constant 1000 kg/m3
"""
import os, re, sys, glob, subprocess

root = sys.argv[1] if len(sys.argv) > 1 else "."
def strip(t):
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return re.sub(r"//[^\n]*", "", t)
def out(*a): print("\t".join(str(x) for x in a))

out("section", "key", "value", "detail")
DONOR = {"OH","H2O","CH3OH","COOH","HCOOH","ACOH","CH2NH2","CH3NH2","CHNH2",
         "CH3NH","CH2NH","CHNH","NH2","NH","ACNH2","rNH"}
recs = sorted(glob.glob(os.path.join(root, "data/standards/components/**/*.dat"), recursive=True))
facts = {}
for f in recs:
    raw = open(f, errors="replace").read(); t = strip(raw)
    n = os.path.basename(f)[:-4]
    g = set(re.findall(r"group\s+(\w+)\s*;", t))
    m = re.search(r"\bassociationFactor\s+([0-9.eE+-]+)", t)
    facts[n] = dict(unifac=bool(g & DONOR), pcsaft=bool(re.search(r"\bassocScheme\b", t)),
                    wcdecl=bool(m), wc=bool(m and float(m.group(1)) > 1.0), raw=raw, t=t)
out("assoc", "records", len(recs), "data/standards/components")
out("assoc", "unifacDonorGroup", sum(v["unifac"] for v in facts.values()), "groups " + " ".join(sorted(DONOR)))
out("assoc", "pcsaftAssocScheme", sum(v["pcsaft"] for v in facts.values()),
    " ".join(k for k, v in facts.items() if v["pcsaft"]))
out("assoc", "wilkeChangFactorDeclared", sum(v["wcdecl"] for v in facts.values()), "")
out("assoc", "wilkeChangFactorAbove1", sum(v["wc"] for v in facts.values()),
    " ".join(k for k, v in facts.items() if v["wc"]))
pat = re.compile(r"(ol$|ols$|Acid$|amine$|Glycol$|phenol|Cresol$|^NH3$|^H2O2$|^HF$|hydrazine|amide$)", re.I)
tot = und = 0
for n, v in facts.items():
    if not pat.search(n): continue
    tot += 1
    if not (v["unifac"] or v["pcsaft"] or v["wc"]):
        und += 1
        st = bool(re.search(r"\bsurfaceTension\s*\{", v["t"]))
        out("undetected", n, "noDerivableFact", "record surfaceTension law: " + ("yes" if st else "no"))
out("undetected", "TOTAL", f"{und} of {tot}", "name-suggestive records with no derivable fact")

for n, v in facts.items():
    m = re.search(r"^\s*Vliq\s+[^;]*;\s*(//.*)?$", v["raw"], re.M)
    if not m: continue
    c = (m.group(1) or "").lower()
    if re.search(r"25 ?c|25 ?°c|298(\.15)? ?k|@298", c): cls = "25C"
    elif "tb" in c: cls = "atTb"
    elif re.search(r"\b273\b", c): cls = "273K"
    elif re.search(r"\b465\b", c): cls = "465K"
    elif "partial" in c or "apparent" in c: cls = "solutionQuantity"
    else: cls = "noTemperatureStated"
    if cls != "25C": out("vliqT", n, cls, (m.group(1) or "").strip()[:90])
for n, v in facts.items():
    t = v["t"]
    vl = re.search(r"^\s*Vliq\s+([0-9.eE+-]+)", t, re.M)
    tc = re.search(r"^\s*Tc\s+([0-9.eE+-]+)", t, re.M); pc = re.search(r"^\s*Pc\s+([0-9.eE+-]+)", t, re.M)
    hv = bool(vl and float(vl.group(1)) > 0); hc = bool(tc and pc and float(tc.group(1)) > 0)
    v["branch"] = "anchored" if hv and hc else "flat" if hv else "bare" if hc else "neither"
for b in ("anchored", "flat", "bare", "neither"):
    names = [k for k, v in facts.items() if v["branch"] == b]
    out("vliqBranch", b, len(names), " ".join(names) if b in ("flat", "bare") else "")

for base in ("tutorials", "data"):
    for dp, dn, fn in os.walk(os.path.join(root, base)):
        for f in fn:
            if f.endswith((".json", ".csv", ".pdf", ".png", ".md")) or f == "expected": continue
            p = os.path.join(dp, f)
            try: s = open(p, errors="replace").read()
            except Exception: continue
            if "approximations" not in s: continue
            s = strip(s)
            for m in re.finditer(r"\bapproximations\s*\{", s):
                i = m.end(); d = 1; j = i
                while d and j < len(s):
                    d += {"{": 1, "}": -1}.get(s[j], 0); j += 1
                body = s[i:j-1]
                for w in re.finditer(r"(\w+)\s*\{([^{}]*)\}", body):
                    out("approx", os.path.relpath(p, root), w.group(1),
                        "reason" if re.search(r"\breason\b", w.group(2)) else "NO reason")

for dp, dn, fn in os.walk(os.path.join(root, "tutorials")):
    if "thermoPhysPropDict" in fn:
        p = os.path.join(dp, "thermoPhysPropDict"); s = strip(open(p, errors="replace").read())
        if re.search(r"model\s+BrockBird", s):
            m = re.search(r"components\s*\(([^)]*)\)", s)
            comps = m.group(1).split() if m else []
            out("brockBird", os.path.relpath(p, root), "water" if "water" in comps else "noWater", " ".join(comps))

g = subprocess.run(["grep", "-rn", r"\.Vliq()", os.path.join(root, "src"), "--include=*.cpp"],
                   capture_output=True, text=True).stdout.splitlines()
for line in g:
    path, ln, code = line.split(":", 2)
    if code.strip().startswith("//"): continue
    out("rawVliq", os.path.relpath(path, root) + ":" + ln, "Vliq()", code.strip()[:80])
g = subprocess.run(["grep", "-rnE", r"RHO_CARRIER = 1000|rho_w = 1000|rho_carrier = 1000|\"rho_feed\", 1000",
                    os.path.join(root, "src")], capture_output=True, text=True).stdout.splitlines()
for line in g:
    path, ln, code = line.split(":", 2)
    out("rawVliq", os.path.relpath(path, root) + ":" + ln, "constant1000", code.strip()[:80])
