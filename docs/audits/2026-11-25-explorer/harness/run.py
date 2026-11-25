#!/usr/bin/env python3
"""run the dumped Explorer cases with the native choupoProps, 4 at a time.
usage: run.py in.jsonl out.tsv [limit]"""
import json, os, re, shutil, subprocess, sys, tempfile, time
from concurrent.futures import ThreadPoolExecutor

BIN = os.environ.get("CHOUPO_PROPS", "/home/vitor/Choupo/build/linux64Gcc/choupoProps")
RUN = os.path.expanduser("~/.cache/choupo/expl/run")
os.makedirs(RUN, exist_ok=True)
inp, outp = sys.argv[1], sys.argv[2]
limit = int(sys.argv[3]) if len(sys.argv) > 3 else 10**9
done = set()
if os.path.exists(outp):
    for l in open(outp):
        done.add(l.split("\t", 1)[0])

REASON = re.compile(r"(fatal error|error:|refus|cannot|must |no group decomposition|not available|unknown|missing|requires|absent)", re.I)

def one(line):
    r = json.loads(line)
    d = tempfile.mkdtemp(dir=RUN)
    try:
        for p, t in r["files"].items():
            fp = os.path.join(d, p)
            os.makedirs(os.path.dirname(fp), exist_ok=True)
            open(fp, "w").write(t)
        env = dict(os.environ, CHOUPO_HOME=os.environ.get("CHOUPO_HOME", ""))
        try:
            p = subprocess.run(["nice", "-n", "12", BIN, d], capture_output=True, text=True, cwd=d, timeout=90, env=env)
            rc, so, se = p.returncode, p.stdout, p.stderr
        except subprocess.TimeoutExpired:
            rc, so, se = 124, "", "TIMEOUT 90 s"
        txt = se + "\n" + so
        if rc == 0:
            cls, reason = "ok", ""
            if re.search(r"(?<![A-Za-z])(nan|-nan)(?![A-Za-z])", open(os.path.join(d, "explore.csv")).read() if os.path.exists(os.path.join(d, "explore.csv")) else ""):
                cls, reason = "ok-with-nan", "csv holds nan"
        elif rc < 0 or rc in (134, 139) or "terminate called" in txt or "Segmentation" in txt:
            cls, reason = "crash", txt.strip().splitlines()[-1][:200] if txt.strip() else ""
        elif rc == 124:
            cls, reason = "timeout", "90 s"
        else:
            lines = [l.strip() for l in se.splitlines() if l.strip()]
            adv = re.findall(r'"category": "refusal".*?"message": "(.*?)"(?:, "|\s*\})', so)
            hit = [l for l in lines if "fatal error" in l] or ([ "ADVISORY: " + adv[0] ] if adv else []) or [l for l in lines if REASON.search(l) and "returned rc" not in l] or lines[-1:]
            if not lines:
                lines = [l.strip() for l in so.splitlines() if REASON.search(l)]
                hit = lines[-1:]
            reason = " ".join(hit[0].split())[:300] if hit else ""
            cls = "refused" if reason and REASON.search(reason) else ("no-reason" if not reason else "refused-other")
        return "\t".join([r["id"], r["op"], r["model"], ",".join(r["comps"]), str(rc), cls, reason.replace("\t", " ")])
    finally:
        shutil.rmtree(d, ignore_errors=True)

def gen():
    n = 0
    for l in open(inp):
        if n >= limit: break
        if json.loads(l)["id"] in done: continue
        n += 1
        yield l

t0 = time.time(); k = 0
with open(outp, "a") as out, ThreadPoolExecutor(4) as ex:
    for res in ex.map(one, gen()):
        out.write(res + "\n"); k += 1
        if k % 500 == 0:
            out.flush(); print(k, round(time.time() - t0), "s", flush=True)
print("done", k, round(time.time() - t0), "s")
