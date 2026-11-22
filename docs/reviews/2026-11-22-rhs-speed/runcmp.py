"""Byte-compare a BASE build with this tree's over every shipped case of the five applications.

usage: runcmp.py BASEDIR TAG [app ...]      BASEDIR holds the base choupoBatch/choupoCtrl/... and libchoupo.so
  env: JOBS (default 2), EXCL / ONLY (regexes on the controlDict path), WORK (default a temp dir)
A case is identical when the return code, every file the run wrote (hashed, lines carrying a wall time
dropped) and stdout (case path normalised, wall-time lines dropped) agree.  The `package <hash>` line
of some cases hashes the case directory's path, which differs between the two runs: a case whose only
difference is that line reads DIFF here and is identical in substance.
Writes WORK/cmp_<app>.<TAG>.log; the last line of each is the count."""
import hashlib, os, re, shutil, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent; T = HERE.parents[2]
if len(sys.argv) < 3: sys.exit(__doc__)
BASE = Path(sys.argv[1]).resolve(); tag = sys.argv[2]
D = Path(os.environ.get('WORK') or tempfile.mkdtemp(prefix='runcmp_')); D.mkdir(parents=True, exist_ok=True)
SPEC = {'choupoBatch': 'tutorials/batch', 'choupoCtrl': 'tutorials/ctrl', 'choupoSemiContinuous': 'tutorials/unsteady',
        'choupoSolve': 'tutorials/steady', 'choupoProps': 'tutorials/props'}
apps = sys.argv[3:] or list(SPEC)
WALL = re.compile(r'(wall|elapsed|seconds|[0-9.]+ ?s\b.*(took|time)|timestamp|Date:|generated)', re.I)
env = dict(os.environ, CHOUPO_HOME=str(T))


def norm(text, d):
    text = re.sub(r'(commit\W{1,4})[0-9a-f]{9}', r'\1<COMMIT>', text)     # the build's commit stamp differs by build
    return '\n'.join(l for l in text.replace(str(d), '<CASE>').splitlines() if not WALL.search(l))


def run(binary, c, work):
    d = work / c.name
    shutil.rmtree(d, ignore_errors=True)
    shutil.copytree(c, d, ignore=lambda dd, names: [x for x in names if x in ('expected', 'latest', 'solution.log') or (re.match(r'^[0-9]', x) and x != '0')])
    r = subprocess.run([binary, str(d)], capture_output=True, text=True, env=env, timeout=900)
    h = hashlib.sha256()
    for f in sorted(p for p in d.rglob('*') if p.is_file()):
        if f.name == 'solution.log' or f.name.startswith('log.'):
            continue
        h.update(str(f.relative_to(d)).encode())
        try:
            h.update(norm(f.read_text(), d).encode())
        except UnicodeDecodeError:
            h.update(f.read_bytes())
    return r.returncode, hashlib.sha256(norm(r.stdout + r.stderr, d).encode()).hexdigest(), h.hexdigest()


for app in apps:
    cases = []
    for cd in sorted((T / SPEC[app]).rglob('controlDict')):
        if re.search(r'application\s+' + app + r'\b', cd.read_text()):
            if os.environ.get('EXCL') and re.search(os.environ['EXCL'], str(cd)): continue
            if os.environ.get('ONLY') and not re.search(os.environ['ONLY'], str(cd)): continue
            cases.append(cd.parent.parent)
    base, new = str(BASE / app), str(T / app)

    def one(c):
        try:
            a = run(base, c, D / ('cmp_' + app) / 'base')
            b = run(new, c, D / ('cmp_' + app) / 'new')
        except Exception as e:  # noqa
            return c, 'ERR ' + str(e)[:80]
        return c, ('SAME' if a == b else 'DIFF rc=%s/%s stdout=%s files=%s' % (a[0], b[0], a[1] == b[1], a[2] == b[2]))
    out = open(D / ('cmp_%s.%s.log' % (app, tag)), 'w')
    same = diff = 0
    with ThreadPoolExecutor(max_workers=int(os.environ.get('JOBS', '2'))) as ex:
        for c, v in ex.map(one, cases):
            out.write('%s %s\n' % (v, c.relative_to(T))); out.flush()
            same += v == 'SAME'; diff += v != 'SAME'
    out.write('identical %d, different %d (of %d)\n' % (same, diff, len(cases))); out.close()
    print(app, 'identical', same, 'different', diff, 'of', len(cases), flush=True)
