import sys, re, importlib.util, collections
from pathlib import Path
root = Path(sys.argv[1]); sys.path.insert(0, str(root/"bin"/"curate"))
spec = importlib.util.spec_from_file_location("crp", root/"bin/curate/check_regressed_pairs.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
import curation_roots
std = [p for p in sorted(m.STD.glob("*.dat")) if "fittedInCase" in p.read_text()]
local = [p for r in curation_roots.case_roots() for p in sorted(r.rglob("constant/parameters/NRTL/*.dat"))
         if "fittedInCase" in p.read_text() and "/constant/parameters/NRTL/" in p.as_posix() and "propertyManifest" not in p.name]
sn = {p.name: m.word(m.strip_comments(p.read_text()), "fittedInCase") for p in std}
local = [p for p in local if sn.get(p.name, "\0") != m.word(m.strip_comments(p.read_text()), "fittedInCase")]
by = collections.defaultdict(list); sev=[]
for i,p in enumerate(std+local):
    t = m.strip_comments(p.read_text()); c = m.word(t,"fittedInCase"); by[c].append((i,p.relative_to(root).as_posix()))
    prov = m.block(t,"provenance") or ""
    if m.word(prov,"fitGrade")=="severe": sev.append((i,p.name,c))
print("records", len(std), "std", len(local), "local")
arch = sum(1 for c in by if c and (root/c/"constant/archiveDatasets").exists())
print("distinct cases", len(by), "with archiveDatasets", arch)
for c,v in by.items():
    if len(v)>1: print("SHARED", c, v)
print("severe in std (ideal_max fetches in-process):", len(sev))
for s in sev[:50]: print("  ", s, "shared" if len(by[s[2]])>1 else "")
# vp
recs=[]
for p in sorted(m.STD_COMP.glob("*.dat")):
    ent=m.vp_entry(p.read_text())
    if ent is None: continue
    if m.word(ent,"fittedInCase") or m.word(ent,"reviewStatus")=="autoPromoted" or m.word(ent,"humanReviewed") or m.block(ent,"review") is not None:
        recs.append((p.name, m.word(ent,"fittedInCase")))
vc=collections.Counter(c for _,c in recs)
print("vp records", len(recs), "shared vp cases", [c for c,n in vc.items() if n>1])
print("vp case also named by a pair:", [c for _,c in recs if c in by])
