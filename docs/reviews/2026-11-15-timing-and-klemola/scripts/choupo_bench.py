import os, shutil, statistics, subprocess, sys, time, re
W, S, N = sys.argv[1], sys.argv[2], int(sys.argv[3])
cases = {"benzene_toluene": "tutorials/steady/distillation/column02_simultaneous",
         "ethanol_water": "tutorials/steady/distillation/column03_azeotrope_mesh"}
env = dict(os.environ, CHOUPO_HOME=W)
for name, rel in cases.items():
    times = []
    for i in range(N + 1):
        d = f"{S}/{name}"; shutil.rmtree(d, ignore_errors=True); shutil.copytree(f"{W}/{rel}", d)
        for sub in ("converged", "reports", "postProcessing"): shutil.rmtree(f"{d}/{sub}", ignore_errors=True)
        t0 = time.perf_counter(); r = subprocess.run([f"{W}/choupoSolve", d], capture_output=True, text=True, env=env); dt = time.perf_counter() - t0
        if r.returncode != 0: print(name, "rc", r.returncode, r.stderr[-300:]); break
        times.append(dt)
    q = re.findall(r'"Q_reboiler[^"]*":\s*([0-9.eE+-]+)', r.stdout)
    rest = sorted(times[1:])
    print(f"{name}: first {times[0]:.3f}  median {statistics.median(rest):.3f}  p95 {rest[int(round(0.95*(len(rest)-1)))]:.3f}  min {rest[0]:.3f}  n {len(rest)}  Qreb {q[:1]}")
