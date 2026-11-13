#!/usr/bin/env python3
"""Item 4(b): the inlet composition of the CSTR in each recycle case among
the 32, at every recorded tear iteration, through the iteration writer
(`solutionControl { write true; writeInterval 1; }` added to a scratch
copy's controlDict).  Prints, per iteration, the components with x > 0 in
the CSTR's inlet and the smallest positive x -- the constituent set the plan
would resolve.

usage (repository root):
  python3 -I docs/reviews/2026-11-13-density-pilot-plan/item4_tears.py <scratch_dir> > item4_tears.tsv
"""
import os, re, shutil, subprocess, sys
ROOT = os.getcwd()
scratch = os.path.abspath(sys.argv[1])
CASES = {  # case -> (path, inlet stream file name, sector folder or '')
    'process03_recycle': ('tutorials/steady/flowsheets/process03_recycle', 'mixed'),
    'recycle_autoinit_tear': ('tutorials/steady/flowsheets/recycle_autoinit_tear', 'mixed'),
    'process05_isomerization_recycle': ('tutorials/steady/flowsheets/process05_isomerization_recycle', 'mixed'),
    'recycle02_dominant_eigenvalue': ('tutorials/steady/flowsheets/recycle02_dominant_eigenvalue', 'mixed'),
    'ChemicalPlantTutorial': ('tutorials/plant/ChemicalPlantTutorial', 'Mixed'),
    'sugarPlantEconomicsSweep': ('tutorials/steady/economics/sugarPlantEconomicsSweep', 'Mixed'),
}

def parse_face(path, sname):
    """the molarFlows of face "<...sname>" in an instant's streamFaces file"""
    t = open(path).read()
    m = re.search(r'"([\w.]*\b' + re.escape(sname) + r')"\s*\{(.*?)molarFlows[^{]*\{([^}]*)\}', t, re.S)
    if not m:
        return None
    return {k: float(v) for k, v in re.findall(r'(\w+)\s+([-+0-9.eE]+)\s*;', m.group(3))}

print('case\titeration\tfile\tpresent(x>0)\tsmallest_positive\tset_changed_from_previous')
for name, (rel, sname) in CASES.items():
    dst = os.path.join(scratch, 'tears', name)
    shutil.rmtree(dst, ignore_errors=True)
    shutil.copytree(os.path.join(ROOT, rel), dst, ignore=shutil.ignore_patterns('iterations', 'converged', 'reports', 'design'))
    cd = os.path.join(dst, 'system', 'controlDict')
    t = open(cd).read()
    t = re.sub(r'solutionControl\s*\{[^}]*\}', '', t)
    open(cd, 'w').write(t + '\nsolutionControl { write true; writeInterval 1; }\n')
    subprocess.run([os.path.join(ROOT, 'choupoSolve'), '.'], cwd=dst, stdout=subprocess.DEVNULL,
                   stderr=subprocess.DEVNULL, env=dict(os.environ, CHOUPO_HOME=ROOT))
    it = os.path.join(dst, 'iterations')
    prev = None
    if not os.path.isdir(it):
        print(f'{name}\t-\t(no iterations written)\t-\t-\t-'); continue
    for n in sorted(x for x in os.listdir(it) if x.isdigit()):
        hits = []
        for dp, dn, fn in os.walk(os.path.join(it, n)):
            if 'streamFaces' in fn and 'byUnit' not in dp:
                c = parse_face(os.path.join(dp, 'streamFaces'), sname)
                if c is not None:
                    hits.append((os.path.join(dp, 'streamFaces'), c))
        for h, comp in hits[:1]:
            tot = sum(comp.values()) or 1.0
            pres = sorted(k for k, v in comp.items() if v > 0)
            sm = min((v / tot for v in comp.values() if v > 0), default=0)
            ch = '' if prev is None else ('YES' if pres != prev else 'no')
            prev = pres
            print(f'{name}\t{n}\t{os.path.relpath(h, dst)}\t{" ".join(pres)}\t{sm:.4g}\t{ch}')
