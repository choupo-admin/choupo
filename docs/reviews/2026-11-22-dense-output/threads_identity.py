"""nox02 (17 independent vessels, each on its own step and its own dense output) at CHOUPO_THREADS 1, 2, 4:
stdout, stderr and every file written must be byte-identical (the one announcement line that names the thread
count is dropped).   usage: threads_identity.py [case-under-tutorials]"""
import hashlib, os, re, shutil, subprocess, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
case = sys.argv[1] if len(sys.argv) > 1 else 'batch/combustion/nox02_millerbowman_denox'
res = {}
for n in (1, 2, 4):
    d = os.path.join(ROOT, 'build/scratch_densesparse/thr%d' % n)
    shutil.rmtree(d, ignore_errors=True)
    shutil.copytree(os.path.join(ROOT, 'tutorials', case), d, ignore=shutil.ignore_patterns('expected'))
    p = subprocess.run([os.path.join(ROOT, 'build/linux64Gcc/choupoBatch'), d], cwd=d, capture_output=True,
                       env=dict(os.environ, CHOUPO_HOME=ROOT, CHOUPO_THREADS=str(n)))
    def norm(b):
        t = b.decode('utf-8', 'replace').replace('/thr%d' % n, '/thrN')
        return ''.join(l for l in t.splitlines(True)
                       if not re.search(r'independent vessels run on \d+ threads|threads=|\bwall\b|ms\b', l)).encode()
    h = {'stdout': hashlib.sha256(norm(p.stdout)).hexdigest(), 'stderr': hashlib.sha256(norm(p.stderr)).hexdigest()}
    for dp, _, fs in os.walk(d):
        for f in sorted(fs):
            full = os.path.join(dp, f)
            h[os.path.relpath(full, d)] = hashlib.sha256(open(full, 'rb').read()).hexdigest()
    res[n] = h
base = res[1]
for n in (2, 4):
    diff = [k for k in sorted(set(base) | set(res[n])) if base.get(k) != res[n].get(k)]
    print('threads %d vs 1: %d files compared, %d differ %s' % (n, len(base), len(diff), diff[:5]))
