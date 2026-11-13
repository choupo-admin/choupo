#!/usr/bin/env python3
"""Gate: every liquid-property route answers today what it answered when recorded, bit for bit.

    bin/curate/check_property_route_bench.py            # check
    bin/curate/check_property_route_bench.py --record   # re-record the hashes (say why in the commit)

WHY THIS EXISTS (DEV.md 4c C378, slice 0, step 1; the numerical review's
TR-16; docs/design/thermophysical-slice0-plan.md section 5).  Slice 0 puts
one door in front of the package's liquid-property methods and must move no
number.  The goldens cannot show that: no stream table prints a density,
and most routes -- the flat `Vliq` branch, bare Rackett, the reference
equations at 500 bar, Brock-Bird on a record no case uses -- are exercised
by no case at all.  A green sweep would prove only that the routes the
corpus happens to walk did not move.

WHAT IT RUNS.  `choupoProps --property-route-bench` (an application flag,
src/applications/choupoProps/PropertyRouteBench.cpp) calls the package's
PUBLIC methods -- `density` (liquid), `viscosityLiquid`, `surfaceTension`,
`diffusivityLiquid` -- for EVERY record of data/standards/components and
EVERY route the kernel registers (the model and mixing-rule names are read
from the factories' own refusal of an unknown name, the reference
equations from data/standards/parameters/Helmholtz/), over the grid of
bin/curate/property_route_bench.manifest (11 temperatures, 90-573.15 K, x
1, 50 and 500 bar), plus the manifest's binaries at three compositions.
Each answer is a C99 hexfloat or the engine's FULL refusal message.  The
full output is written to build/propertyRouteBench/bench.tsv (gitignored).

WHAT IT CHECKS.  The output is cut into blocks, one per (record, property
route); each block is hashed (sha256 of its lines) and compared with
bin/curate/property_route_bench.sha256.tsv.  A moved value or a changed
refusal NAMES its record and route; a route that appears or disappears
(a model registered or retired, a record added) is named too.  The route
list itself is a block (`@routes`), so a factory that gains a model moves it.

WHAT IT DOES NOT CHECK, said plainly.  Whether any value is RIGHT: the
hashes pin what the engine answers, not physics (section 9 of the plan
lists what is known wrong).  States off the grid.  Mixtures other than the
manifest's binaries, activity-model effects (the bench's liquid is ideal),
and the per-unit `thermo {}` override.  Liquid thermal conductivity (not in
slice 0).

THE PLATFORM (C384, 2026-11-13).  A hexfloat pinned bit for bit is a claim about
ONE platform: the libm a binary calls differs in the last bit between C
libraries and CPUs, and on the CI runner 588 of 4975 blocks answered differently
while every one equals its pin on the recording machine.  The pin file therefore
states the platform it was recorded on (`# platform`: CPU, architecture, C
library, compiler and the SIMD features glibc dispatches on, all READ from the
running system by platform_fingerprint()).  On another platform the gate prints
`NO SUBJECT` with both fingerprints and exits 0 (bin/runTests prints it as
NOSUBJ, never as a pass); on the recording platform nothing changes.

THE BINARY.  It runs <root>/choupoProps and REFUSES when it is missing: a
bench that cannot run must not pass.  It does not rebuild.

    reads: src/thermo/ThermoPackage.cpp src/thermo/ThermoPackage.H
    reads: src/thermo/PricedDensity.cpp src/thermo/DerivedClosures.H
    reads: src/thermo/transport/ src/thermo/SurfaceTensionModel.cpp
    reads: src/thermo/pureFluid/ src/thermo/equationOfState/ReferenceFluid.cpp
    reads: src/thermo/equationOfState/ReferencePureFluid.cpp src/thermo/iapws/
    reads: data/standards/components/ data/standards/parameters/Helmholtz/
"""
import hashlib
import os
import platform
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from golden_bands import platform_fingerprint   # ONE fingerprint function (C384)

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "bin" / "curate" / "property_route_bench.manifest"
HASHES = ROOT / "bin" / "curate" / "property_route_bench.sha256.tsv"
OUT = ROOT / "build" / "propertyRouteBench" / "bench.tsv"
#  The door's method id and label per state (review DR-11), hashed apart.
LABEL_HASHES = ROOT / "bin" / "curate" / "property_route_labels.sha256.tsv"
LABELS = ROOT / "build" / "propertyRouteBench" / "labels.tsv"
NAME = "check_property_route_bench"


def pinned_platform():
    if not HASHES.exists():
        return None
    for line in HASHES.read_text(encoding="utf-8").splitlines():
        m = re.match(r"# platform\t(.*)$", line)
        if m:
            return m.group(1)
    return None


def run_bench():
    exe = ROOT / "choupoProps"
    if not exe.exists():
        print(f"{NAME}: FAIL -- {exe} does not exist; build the tree (make all).  "
              "A bench that cannot run does not pass.")
        sys.exit(1)
    env = dict(os.environ)
    env["CHOUPO_HOME"] = str(ROOT)
    env["LC_ALL"] = "C"
    env["OMP_NUM_THREADS"] = "1"
    t0 = time.time()
    p = subprocess.run([str(exe), "--property-route-bench", str(MANIFEST), str(OUT)],
                       cwd=ROOT, env=env, capture_output=True, text=True, timeout=1800)
    secs = time.time() - t0
    if p.returncode != 0 or not OUT.exists():
        print(f"{NAME}: FAIL -- the bench exited {p.returncode}")
        print((p.stdout + p.stderr)[-3000:])
        sys.exit(1)
    summary = [l.strip() for l in p.stdout.splitlines()
               if l.strip().startswith(("records", "non-finite", "door against"))]
    door = [l for l in summary if l.startswith("door against")]
    if (not door or not door[0].endswith(" 0 disagreements")
            or door[0].startswith("door against the old call: 0 compared")):
        print(f"{NAME}: FAIL -- the door (thermo/LiquidPropertyDoor) does not answer as the "
              "package's own call: " + (door[0] if door else "no door line printed"))
        print("\n".join(summary))
        sys.exit(1)
    return secs, summary


def blocks(path: Path):
    """(record, property) -> sha256 of the block's lines; '@routes' for the header."""
    out, order = {}, []
    key, h = ("@routes", "header"), hashlib.sha256()
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("## "):
                out[key] = h.hexdigest()
                order.append(key)
                rec, _, prop = line[3:].rstrip("\n").partition("\t")
                key, h = (rec, prop), hashlib.sha256()
                continue
            if key[0] == "@routes" and line.startswith(("# choupoProps", "# values")):
                continue          # the format lines name nothing a route answers
            h.update(line.encode("utf-8"))
    out[key] = h.hexdigest()
    order.append(key)
    if len(out) != len(order):
        dup = sorted({k for k in order if order.count(k) > 1})[:5]
        print(f"{NAME}: FAIL -- duplicate blocks in the bench output: {dup}")
        sys.exit(1)
    return out, order


def read_hashes(path=HASHES):
    pinned = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        rec, prop, digest = line.split("\t")
        pinned[(rec, prop)] = digest
    return pinned


def main() -> int:
    record = "--record" in sys.argv[1:]
    here = platform_fingerprint()
    if not record:
        there = pinned_platform()
        if there is None:
            print(f"{NAME}: FAIL -- {HASHES.relative_to(ROOT)} does not state the platform it was recorded on "
                  "(a `# platform` line); re-record with --record on the platform the pins are true on")
            return 1
        if there != here:
            print(f"NO SUBJECT: the route bench is pinned bit for bit on ANOTHER platform, so it asserts nothing here "
                  f"(not run, not a pass).  recorded on: {there} || running on: {here}")
            print(f"{NAME}: NO SUBJECT -- recorded on [{there}]; this system is [{here}].  The bench's hexfloats "
                  "are true on the recording platform only; on that platform nothing changes.")
            return 0
    secs, summary = run_bench()
    got, order = blocks(OUT)
    if len(got) < 1000:
        print(f"{NAME}: FAIL -- only {len(got)} blocks: the bench saw too little of the "
              "catalogue to vouch for it")
        return 1

    labels, lorder = blocks(LABELS)
    if record:
        llines = ["# record\tproperty route\tsha256 of the door's method id and label per state "
                  "(build/propertyRouteBench/labels.tsv); review DR-11"]
        llines += [f"{k[0]}\t{k[1]}\t{labels[k]}" for k in lorder]
        LABEL_HASHES.write_text("\n".join(llines) + "\n", encoding="utf-8")
        lines = [f"# platform\t{here}",
                 "# record\tproperty route\tsha256 of its block in build/propertyRouteBench/bench.tsv",
                 "# written by bin/curate/check_property_route_bench.py --record; "
                 "DEV.md 4c C378 slice 0 (TR-16)"]
        lines += [f"{k[0]}\t{k[1]}\t{got[k]}" for k in order]
        HASHES.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"{NAME}: RECORDED -- {len(got)} blocks -> {HASHES.relative_to(ROOT)} "
              f"({secs:.1f} s; " + "; ".join(summary) + ")")
        return 0

    if not HASHES.exists():
        print(f"{NAME}: FAIL -- {HASHES.relative_to(ROOT)} is missing; nothing to compare with")
        return 1
    pinned = read_hashes()
    if not LABEL_HASHES.exists():
        print(f"{NAME}: FAIL -- {LABEL_HASHES.relative_to(ROOT)} is missing")
        return 1
    lpinned = read_hashes(LABEL_HASHES)
    relabelled = [k for k in lorder if lpinned.get(k) != labels[k]]
    relabelled += [k for k in lpinned if k not in labels]
    if relabelled:
        print(f"{NAME}: FAIL -- {len(relabelled)} route block(s) are DESCRIBED differently by "
              "the door (method id or label), whatever their values "
              f"(full output: {LABELS.relative_to(ROOT)})")
        for k in relabelled[:25]:
            print(f"  RELABELLED  {k[0]}\t{k[1]}")
        print("  A label is generated from the route the kernel took; a change here is a "
              "change of words or of route.  If intended, re-record with --record and say why.")
        return 1
    moved = [k for k in order if k in pinned and pinned[k] != got[k]]
    new = [k for k in order if k not in pinned]
    gone = [k for k in pinned if k not in got]
    if moved or new or gone:
        print(f"{NAME}: FAIL -- {len(moved)} route block(s) answer differently, "
              f"{len(new)} new, {len(gone)} gone, of {len(pinned)} pinned "
              f"(full output: {OUT.relative_to(ROOT)})")
        for tag, ks in (("MOVED", moved), ("NEW", new), ("GONE", gone)):
            for k in ks[:25]:
                print(f"  {tag:5}  {k[0]}\t{k[1]}")
            if len(ks) > 25:
                print(f"  ... and {len(ks) - 25} more {tag}")
        print("  If the change is intended (a later slice that moves numbers), re-record with "
              "--record and list the moved blocks in the commit.")
        return 1
    print(f"{NAME}: OK -- {len(got)} (record, route) blocks of the liquid-property kernel "
          f"answer bit for bit as recorded, and the door describes each as recorded (" + "; ".join(summary) + ").  "
          "NOT CHECKED: whether any value is right, states off the grid, mixtures other than "
          "the manifest's binaries, activity-model effects, per-unit overrides.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
