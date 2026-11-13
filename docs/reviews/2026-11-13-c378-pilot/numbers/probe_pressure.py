#!/usr/bin/env python3
"""The kernel's density of water + ethanol (x_e 0.25) at 298.15 K and 1, 3, 100, 500 bar
(choupoProps --liquid-density-probe on a scratch copy of liquidDensity02), beside the
'pressure' word the kernel records.  usage: probe_pressure.py <repo-root> <scratch-dir>"""
import os, shutil, subprocess, sys
from pathlib import Path
root, scratch = Path(sys.argv[1]), Path(sys.argv[2])
d = scratch / 'runs' / 'probe_pressure'
if d.exists(): shutil.rmtree(d)
shutil.copytree(root / 'tutorials/steady/thermo/liquidDensity02_waterEthanol', d)
(d / 'system/propsDict').write_text('operations\n(\n);\n')
f = d / 'probe.txt'
f.write_text(''.join(f'298.15 {P!r} water 0.75 ethanol 0.25\n' for P in (1e5, 3e5, 1e7, 5e7)))
env = dict(os.environ, CHOUPO_HOME=str(root), LC_ALL='C')
r = subprocess.run([str(root / 'choupoProps'), str(d), f'--liquid-density-probe={f}'], capture_output=True, text=True, env=env)
lines = [l for l in (r.stdout + r.stderr).splitlines() if l.startswith('probe') or 'pressure' in l.lower()]
open(scratch / 'probe_pressure.txt', 'w').write('\n'.join(lines) + '\n'); print('\n'.join(lines[:20]))
