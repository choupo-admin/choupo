#!/usr/bin/env python3
"""Copy a shipped case to the scratch directory, run it with the tree's binary
named in its controlDict, keep the log and the result JSON there.
usage: run_case.py <repo-root> <scratch-dir> <case-rel-path> [<tag>]
Writes <scratch>/runs/<tag>/{case copy, log.txt, result.json}."""
import json, os, re, shutil, subprocess, sys
from pathlib import Path

def run(root, scratch, rel, tag=None, edit=None):
    root, scratch = Path(root), Path(scratch)
    tag = tag or rel.replace('/', '_')
    d = scratch / 'runs' / tag
    if d.exists(): shutil.rmtree(d)
    top = {'converged', 'reports', 'iterations', 'design', 'economics', 'postProcessing'}
    src = root / rel
    shutil.copytree(src, d, ignore=lambda dirn, names: [n for n in names
                    if Path(dirn) == src and (n in top or n.startswith('log'))])
    if edit: edit(d)
    app = re.search(r'^application\s+(\w+);', (d / 'system/controlDict').read_text(), re.M).group(1)
    env = dict(os.environ, CHOUPO_HOME=str(root), LC_ALL='C')
    r = subprocess.run([str(root / app), str(d)], capture_output=True, text=True, env=env, timeout=1800)
    out = r.stdout + r.stderr
    (d / 'log.txt').write_text(out)
    m = re.search(r'<<<Choupo:result-begin>>>\n(.*?)\n<<<Choupo:result-end>>>', out, re.S)
    res = json.loads(m.group(1)) if m else None
    if res is not None: (d / 'result.json').write_text(json.dumps(res, indent=1))
    return r.returncode, res, out

if __name__ == '__main__':
    rc, res, out = run(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else None)
    print('exit', rc, 'result', res is not None)
