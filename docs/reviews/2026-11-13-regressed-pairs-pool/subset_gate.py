"""Drive check_regressed_pairs.main() on a SUBSET of records (for repetitions).
usage: python3 subset_gate.py <repo-root> <scratch-dir> <label>
Patches (stated, nothing else): STD -> <repo>/build/r5subset/NRTL holding copies of
N_STD catalogue records; curation_roots.case_roots -> local records of the shared
case only (curate12 + vlle04); STD_COMP -> <repo>/build/r5subset/components holding
N_VP vapour-pressure records; check_model_records -> stub (arm m is main-thread only);
the floors of arms (b) and (i) stay as written (they FAIL identically in both forms)."""
import sys, os, shutil, io, contextlib, time
from pathlib import Path
repo, scratch, label = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
N_STD = int(os.environ.get("R5_NSTD", "24")); N_VP = int(os.environ.get("R5_NVP", "6"))
sys.path.insert(0, str(repo / "bin" / "curate"))
sys.argv = [str(repo / "bin/curate/check_regressed_pairs.py")]
import importlib.util
spec = importlib.util.spec_from_file_location("__gate__", repo / "bin/curate/check_regressed_pairs.py")
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
import curation_roots
sub = repo / "build" / "r5subset"
if sub.exists(): shutil.rmtree(sub)
if True:
    (sub / "NRTL").mkdir(parents=True); (sub / "components").mkdir()
    allstd = [p for p in sorted(g.STD.glob("*.dat")) if "fittedInCase" in p.read_text()]
    # spread across the list, plus every severe one among the first 120 (ideal_max path)
    pick = allstd[::max(1, len(allstd)//N_STD)][:N_STD]
    sev = [p for p in allstd[:120] if "fitGrade      severe" in p.read_text() or "fitGrade severe" in p.read_text()][:4]
    for p in dict.fromkeys(pick + sev): shutil.copy(p, sub / "NRTL" / p.name)
    allvp = [p for p in sorted(g.STD_COMP.glob("*.dat")) if g.vp_entry(p.read_text()) is not None
             and g.word(g.vp_entry(p.read_text()), "fittedInCase")]
    for p in allvp[::max(1, len(allvp)//N_VP)][:N_VP]: shutil.copy(p, sub / "components" / p.name)
g.STD = sub / "NRTL"; g.STD_COMP = sub / "components"
shared = [repo / "tutorials/props/curation/curate12_nrtl_ethanol_cyclohexane",
          repo / "tutorials/steady/flash/vlle04_two_liquids_decanter"]
curation_roots.case_roots = lambda: shared
g.check_model_records = lambda *a, **k: []
t0 = time.time()
rc = g.main()
print(f"[harness] rc={rc} wall={time.time()-t0:.1f}", file=sys.stderr)
sys.exit(rc)
