#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""gate_pool.py -- the ONE home of how the suite runs its gates side by side.

bin/runTests cuts its own text into SEGMENTS (gate_segments) and hands each
segment's poolable gates to this file; it replays each gate's output at the
gate's own site, so the report is the serial report.  Nothing else decides
what runs beside what: the lanes are declared in bin/curate/suite_lanes.txt.

LANES (read from suite_lanes.txt by runTests, passed here per gate):

  PAR  the gate writes nothing in the tree: it runs in the real tree, beside
       any other poolable gate of its segment.
  ISO  the gate writes inside the tree (it runs a case in place, leaves a
       probe) but ONLY inside the directories a private copy holds.  It runs
       in one of N private SLOT TREES -- copies of everything it may write,
       symlinks to the rest (src, gui, build, data/standards, ...) -- so its
       writes land in the copy and cannot race a neighbour.  Each slot tree
       is re-synchronised from the real tree once per segment (rsync), so a
       gate sees the tree as the serial walk would have left it at the
       barrier ahead of it.  After the segment the real tree's LINKED
       directories are checked for any file newer than the segment's start: a
       write that escaped the copy is a LEAK, the pool exits 4, and runTests
       prints a FAIL naming the files -- the remedy is to make that gate
       SERIAL in suite_lanes.txt.
  (SERIAL is not pooled: runTests runs it live at its site, alone.)

WEIGHT: a lane may carry `*W` (ISO*2): the gate counts as W of the N slots,
because it runs the engine on many cases (the measured write count of its
trace is the proxy; suite_lanes.txt names each one).  A weight is capped at N.

MEMORY: no gate STARTS while MemAvailable is under 2 GB (CLAUDE.md rule 4,
the laptop's budget).  With nothing else running the pool waits at most
MEM_WAIT_ALONE seconds and then starts the gate by itself, because a gate
alone is what the serial run does and a hang would be worse than a warning.

The input (stdin) is one gate per line, tab-separated:
    key  lane  weight  argv-text
where argv-text is the shell text of the site, with $ROOT unexpanded.  For
each key the pool writes <out>/<key>.out (stdout+stderr merged), .rc and .sec
(the gate's OWN wall seconds), the files runTests replays.  The measured
seconds are appended to <root>/build/suiteJobTimes.new as `gate_seg_run:<key>`
(the format pool_times_commit merges), and the ordering is longest-first by
the last measured time (an unmeasured gate first of all).

Exit 0 normally; 4 if an ISO gate leaked a write into the real tree (the
files are in <out>/LEAK).

Usage:
    gate_pool.py run --root R --out DIR --jobs N [--threads T] < gates.tsv
    gate_pool.py clean --root R        # remove this root's slot trees
"""
import argparse
import hashlib
import os
import shutil
import subprocess
import sys
import threading
import time

MIN_AVAILABLE_KB = 2 * 1024 * 1024
MEM_WAIT_ALONE = 120

# What a slot tree does NOT copy: linked back to the real tree instead.  These
# are big and read-only to every ISO gate (the leak check enforces that).
LINKED = ["src", "gui", "build", "thirdParty", ".claude",
          "data/standards", "data/groupEstimative"]


def slot_base(root):
    h = hashlib.sha1(os.path.realpath(root).encode()).hexdigest()[:10]
    return os.path.join("/tmp", "choupo-gatetrees-%d" % os.getuid(), h)


def mem_available_kb():
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1])
    except OSError:
        pass
    return 1 << 40


def sync_slot(root, slot):
    """Make <slot> a private copy of the real tree (linked dirs symlinked)."""
    os.makedirs(slot, exist_ok=True)
    cmd = ["rsync", "-a", "--delete", "--quiet"]
    for d in LINKED:
        cmd.append("--exclude=/" + d)
    cmd += [root.rstrip("/") + "/", slot.rstrip("/") + "/"]
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    # rsync exit 24 = a source file vanished meanwhile: harmless here.
    if r.returncode not in (0, 24):
        raise RuntimeError("rsync into %s failed (%d): %s" % (slot, r.returncode, r.stdout))
    for d in LINKED:
        src = os.path.join(root, d)
        dst = os.path.join(slot, d)
        if not os.path.lexists(src):
            if os.path.islink(dst):
                os.unlink(dst)
            continue
        if os.path.islink(dst) and os.readlink(dst) == src:
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if os.path.lexists(dst):
            if os.path.islink(dst) or os.path.isfile(dst):
                os.unlink(dst)
            else:
                shutil.rmtree(dst)
        os.symlink(src, dst)


def leaks(root, stamp):
    """Files in the real tree's linked directories newer than <stamp>."""
    found = []
    for d in LINKED:
        top = os.path.join(root, d)
        if not os.path.isdir(top) or d == ".claude":
            continue
        for dp, dn, fn in os.walk(top):
            if dp == os.path.join(root, "build"):
                dn[:] = [x for x in dn if not x.startswith("suite")]
            for f in fn:
                if dp == os.path.join(root, "build") and f.startswith("suite"):
                    continue
                p = os.path.join(dp, f)
                try:
                    if os.lstat(p).st_mtime > stamp:
                        found.append(p)
                except OSError:
                    pass
    return found


def run_pool(root, out, jobs, threads):
    gates = []
    for line in sys.stdin:
        line = line.rstrip("\n")
        if not line:
            continue
        key, lane, weight, argv = line.split("\t", 3)
        gates.append((key, lane, max(1, min(int(weight or 1), jobs)), argv))
    os.makedirs(out, exist_ok=True)

    # longest first by the last measured time; unmeasured first of all
    times = {}
    try:
        with open(os.path.join(root, "build", "suiteJobTimes.tsv")) as f:
            for l in f:
                a = l.rstrip("\n").split("\t")
                if len(a) == 2:
                    times[a[0]] = float(a[1])
    except (OSError, ValueError):
        pass
    gates.sort(key=lambda g: -times.get("gate_seg_run:" + g[0], 1e9))

    iso = any(g[1] == "ISO" for g in gates)
    stamp_file = os.path.join(out, ".segment-start")
    open(stamp_file, "w").close()
    t_start = os.stat(stamp_file).st_mtime
    base = slot_base(root)

    cv = threading.Condition()
    state = {"used": 0, "running": 0}
    free_slots = list(range(jobs, 0, -1))
    synced = set()
    new_times = []
    errors = []

    def runner(key, lane, weight, argv):
        slot = None
        t0 = time.time()
        try:
            env = dict(os.environ)
            if lane == "ISO":
                slot = os.path.join(base, "slot%d" % slot_no[key])
                with cv:
                    need = slot_no[key] not in synced
                if need:
                    sync_slot(root, slot)
                    with cv:
                        synced.add(slot_no[key])
                gate_root = slot
                if threads:
                    env["CHOUPO_THREADS"] = str(threads)
            else:
                gate_root = root
            env["ROOT"] = gate_root
            env["CHOUPO_HOME"] = gate_root
            env["PATH"] = gate_root + ":" + os.path.join(gate_root, "bin") + ":" + env.get("PATH", "")
            t0 = time.time()
            with open(os.path.join(out, key + ".out"), "wb") as fo:
                p = subprocess.run(["bash", "-c", "eval \"$GATE_ARGV\""],
                                   stdin=subprocess.DEVNULL, stdout=fo,
                                   stderr=subprocess.STDOUT, cwd=gate_root,
                                   env=dict(env, GATE_ARGV=argv))
            rc = p.returncode
            if lane == "ISO":
                # the report names the real tree, not the private copy
                fp = os.path.join(out, key + ".out")
                with open(fp, "rb") as fi:
                    data = fi.read()
                with open(fp, "wb") as fo:
                    fo.write(data.replace(gate_root.encode(), root.rstrip("/").encode()))
        except Exception as e:                      # a pool fault is a FAIL, loudly
            with open(os.path.join(out, key + ".out"), "a") as fo:
                fo.write("gate_pool: could not run %s: %s\n" % (key, e))
            rc = 97
            errors.append(key)
        dt = time.time() - t0
        with open(os.path.join(out, key + ".sec"), "w") as f:
            f.write("%.3f\n" % dt)
        with open(os.path.join(out, key + ".rc"), "w") as f:
            f.write("%d\n" % rc)
        with cv:
            new_times.append("gate_seg_run:%s\t%.3f\n" % (key, dt))
            state["used"] -= weight
            state["running"] -= 1
            if slot is not None:
                free_slots.append(slot_no[key])
            cv.notify_all()

    slot_no = {}
    pending = list(gates)
    threads_started = []
    with cv:
        for key, lane, weight, argv in pending:
            # wait for capacity and for memory
            waited = 0.0
            while True:
                fits = state["used"] + weight <= jobs
                iso_ok = lane != "ISO" or free_slots
                mem_ok = mem_available_kb() >= MIN_AVAILABLE_KB
                if fits and iso_ok and mem_ok:
                    break
                if fits and iso_ok and not mem_ok and state["running"] == 0 \
                        and waited >= MEM_WAIT_ALONE:
                    sys.stderr.write("[gate pool] %d MB available after %d s with nothing "
                                     "else running: starting %s alone\n"
                                     % (mem_available_kb() // 1024, MEM_WAIT_ALONE, key))
                    break
                cv.wait(timeout=2.0)
                waited += 2.0
            state["used"] += weight
            state["running"] += 1
            if lane == "ISO":
                slot_no[key] = free_slots.pop()
            th = threading.Thread(target=runner, args=(key, lane, weight, argv))
            th.start()
            threads_started.append(th)
    for th in threads_started:
        th.join()

    try:
        with open(os.path.join(root, "build", "suiteJobTimes.new"), "a") as f:
            f.writelines(new_times)
    except OSError:
        pass

    rc = 0
    if iso:
        lk = leaks(root, t_start)
        if lk:
            with open(os.path.join(out, "LEAK"), "w") as f:
                f.write("\n".join(lk) + "\n")
            rc = 4
    try:
        os.unlink(stamp_file)
    except OSError:
        pass
    return rc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["run", "clean"])
    ap.add_argument("--root", required=True)
    ap.add_argument("--out")
    ap.add_argument("--jobs", type=int, default=1)
    ap.add_argument("--threads", type=int, default=0)
    a = ap.parse_args()
    if a.mode == "clean":
        shutil.rmtree(slot_base(a.root), ignore_errors=True)
        return 0
    return run_pool(a.root, a.out, a.jobs, a.threads)


if __name__ == "__main__":
    sys.exit(main())
