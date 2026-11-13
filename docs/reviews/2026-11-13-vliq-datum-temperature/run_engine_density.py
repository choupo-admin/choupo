#!/usr/bin/env python3
"""Ask the engine (the built choupoProps of REPO_ROOT) for the pure-liquid
density of each component at each temperature: one case per point, so a
refusal at one point does not hide the others.

usage: run_engine_density.py REPO_ROOT SCRATCH_DIR OUT_TSV COMPONENT:T[,T...] ...
OUT_TSV: component, T_K, rho_kg_m3 (or 'refused: <first line of the message>'),
and the engine's datum announcement for that component.
"""
import os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(__file__))
import make_density_case  # noqa: E402


def run(repo, case):
    cmd = 'source "%s/etc/bashrc" >/dev/null 2>&1; runCase "%s" >/dev/null 2>&1' % (repo, case)
    subprocess.run(['bash', '-c', cmd], cwd=repo)
    log = open(os.path.join(case, 'log.choupoProps')).read()
    m = re.search(r'"rho_liquid_[^"]+":\s*([-0-9.eE+]+)', log)
    ann = re.search(r'^liquid density:.*$', log, re.M)
    if m:
        return m.group(1), ann.group(0) if ann else ''
    err = re.search(r'fatal error:.*?-- (.*?)(\.\s|$)', log, re.M)
    return 'refused: ' + (err.group(1) if err else 'see log'), ann.group(0) if ann else ''


def main():
    repo, scratch, out = sys.argv[1:4]
    with open(out, 'w') as fo:
        fo.write('component\tT_K\trho_kg_m3\tannouncement\n')
        for arg in sys.argv[4:]:
            comp, Ts = arg.split(':')
            for T in Ts.split(','):
                case = os.path.join(scratch, 'rho_%s_%s' % (comp, T.replace('.', 'p')))
                sys.argv = ['x', case, comp, T]
                make_density_case.main()
                rho, ann = run(repo, case)
                fo.write('%s\t%s\t%s\t%s\n' % (comp, T, rho, ann))


if __name__ == '__main__':
    main()
