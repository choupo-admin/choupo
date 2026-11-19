"""Clone a run dir, set integrator/deltaT/writeInterval/endTime, run choupoBatch, time it, count ODE steps.
usage: runch.py basedir name integrator deltaT writeInterval endTime"""
import sys, os, re, shutil, subprocess, time
base, name, integ, dt, wi, tend = sys.argv[1:7]
home = os.environ.get("CHOUPO_HOME", os.getcwd())
dst = os.path.join(os.environ.get("WORK", "."), name)
shutil.rmtree(dst, ignore_errors=True)
shutil.copytree(base, dst, ignore=shutil.ignore_patterns("trajectory.csv", "solution.log", "[0-9]*e*", "latest"))
shutil.copy(os.path.join(base, "0/internalStates/bomb"), dst + "/0/internalStates/bomb") if os.path.isdir(dst + "/0") else None
p = dst + "/system/flowsheetDict"
f = open(p).read(); f = re.sub(r'integrator\s+\w+;', 'integrator  %s;' % integ, f); open(p, "w").write(f)
p = dst + "/system/controlDict"
c = open(p).read()
c = re.sub(r'^endTime\s+[^;]*;', 'endTime %s;' % tend, c, flags=re.M)
c = re.sub(r'^deltaT\s+[^;]*;', 'deltaT %s;' % dt, c, flags=re.M)
c = re.sub(r'^writeInterval\s+[^;]*;', 'writeInterval %s;' % wi, c, flags=re.M)
open(p, "w").write(c)
env = dict(os.environ, CHOUPO_HOME=home)
t0 = time.perf_counter()
r = subprocess.run([home + "/choupoBatch", dst], capture_output=True, text=True, env=env)
wall = time.perf_counter() - t0
log = r.stdout + r.stderr
open(dst + "/run.log", "w").write(log)
acc = sum(int(x) for x in re.findall(r'steps:\s*(\d+) accepted', log))
rej = sum(int(x) for x in re.findall(r'accepted,\s*(\d+) rejected', log))
tf = re.search(r'"T_final":\s*([-\d.eE+]+)', log)
print("%s integ=%s dt=%s rc=%d wall=%.3fs ode_accepted=%d rejected=%d T_final=%s" % (name, integ, dt, r.returncode, wall, acc, rej, tf.group(1) if tf else "-"))
if r.returncode:
    for l in log.splitlines():
        if "ERROR" in l or "GAVE UP" in l or "refus" in l.lower():
            print("   ", l[:300]); break
