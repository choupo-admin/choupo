"""nox02 (17 vessels) at rtol 1e-10 against Cantera 3.2: the grid error with the binaries of THIS tree.

usage: nox02_cantera.py TREE_ROOT LABEL [integrators=Rosenbrock23,Rodas4,seulex]

Runs a scratch copy of nox02_millerbowman_denox from TREE_ROOT (its build/linux64Gcc/choupoBatch) with the integrator
and rtol 1e-10 / atol 1e-20 set, free stepping on the case's write grid, then docs/reviews/2026-11-22-miller-bowman/
compare_cantera.py denox on it (needs /tmp/mb89/mbB.yaml, built by cantera_mech.py B).
"""
import os, re, shutil, subprocess, sys
tree, label = sys.argv[1], sys.argv[2]
integs = (sys.argv[3] if len(sys.argv) > 3 else 'Rosenbrock23,Rodas4,seulex').split(',')
here = os.path.dirname(os.path.abspath(__file__))
cmp_ = os.path.join(here, '..', '2026-11-22-miller-bowman', 'compare_cantera.py')
for integ in integs:
    d = os.path.join(tree, 'build', 'scratch_densesparse', 'n2c_' + integ)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(os.path.dirname(d), exist_ok=True)
    shutil.copytree(os.path.join(tree, 'tutorials/batch/combustion/nox02_millerbowman_denox'), d)
    shutil.rmtree(d + '/expected', ignore_errors=True)
    fp = d + '/system/flowsheetDict'
    txt = open(fp).read()
    open(fp, 'w').write(re.sub(r'integrator\s+\w+;', 'integrator %s;' % integ, txt))
    cp = d + '/system/controlDict'
    c = open(cp).read()
    c = re.sub(r'rtol\s+[0-9.eE+-]+;', 'rtol 1e-10;', c)
    c = re.sub(r'atol\s+[0-9.eE+-]+;', 'atol 1e-20;', c)
    c = re.sub(r'\n\s*deltaTmax[^\n]*', '', c)
    open(cp, 'w').write(c)
    subprocess.run([os.path.join(tree, 'build/linux64Gcc/choupoBatch'), d], cwd=d, capture_output=True,
                   env=dict(os.environ, CHOUPO_HOME=tree))
    r = subprocess.run([sys.executable, cmp_, 'denox', d], capture_output=True, text=True)
    lines = [l for l in r.stdout.splitlines() if 'max rel dev' in l]
    devs = [float(re.search(r'max rel dev ([0-9.e+-]+)', l).group(1)) for l in lines]
    maj = [float(re.search(r'above x=1e-6: ([0-9.e+-]+)', l).group(1)) for l in lines]
    print('%s nox02 %s rtol 1e-10: worst over %d vessels: all species %.2e, species above x=1e-6 %.2e'
          % (label, integ, len(devs), max(devs) if devs else float('nan'), max(maj) if maj else float('nan')), flush=True)
    if not devs:
        print(r.stdout[-500:], r.stderr[-500:])
