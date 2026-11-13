#!/usr/bin/env python3
"""Pure water, no pureFluids: the kernel's answer around the package's (Antoine) and the
reference equation's saturation lines, via choupoProps --liquid-density-probe on a scratch
copy of liquidDensity01.  usage: probe_lines.py <repo-root> <scratch-dir>"""
import os, shutil, subprocess, sys
from pathlib import Path
root, scratch = Path(sys.argv[1]), Path(sys.argv[2])
d = scratch / 'runs' / 'probe_lines'
if d.exists(): shutil.rmtree(d)
shutil.copytree(root / 'tutorials/steady/thermo/liquidDensity01_water', d)
(d / 'system/propsDict').write_text('operations\n(\n);\n')
states = [  # T, P ; comments in the output
    (300.0, 3535.0),    # between: Antoine 3533.5 < P < ref 3536.8
    (300.0, 3530.0),    # below both
    (450.0, 0.97e6),    # between: ref 0.932 < P < Antoine 1.0145 MPa
    (450.0, 0.90e6),    # below both
    (450.0, 1.10e6),    # above both
    (610.0, 15.0e6),    # between: ref 14.03 < P < Antoine 16.69 MPa
    (610.0, 13.0e6),    # below both
    (610.0, 17.0e6),    # above both
]
f = d / 'probe.txt'
f.write_text(''.join(f'{T!r} {P!r} water 1.0\n' for T, P in states))
env = dict(os.environ, CHOUPO_HOME=str(root), LC_ALL='C')
r = subprocess.run([str(root / 'choupoProps'), str(d), f'--liquid-density-probe={f}'],
                   capture_output=True, text=True, env=env, timeout=600)
txt = r.stdout + r.stderr
(d / 'log.txt').write_text(txt)
print('exit', r.returncode)
for l in txt.splitlines():
    if l.startswith('probe') or 'liquid density' in l.lower() or 'extrapol' in l.lower() or 'Trange' in l or 'Antoine' in l:
        print(l[:400])
