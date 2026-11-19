#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_carried_kinds -- what the carried-quantity KINDS hold, as a gate.

    bin/curate/check_carried_kinds.py

THE REAL DEFECT IT WOULD HAVE CAUGHT.  Until 2026-11-18 the splitter dropped
the size distribution of its feed on EVERY branch: a slurry that went in with
a distribution came out of both branches with none, the mass balance closed
(a distribution is not a flow), every golden pinned "unchanged", and nothing
said so -- the size distribution was a field two units had to remember to
copy, and the unit that forgot was found by a spike that put a second kind on
the same stream, not by any test.  This gate holds the contract that makes
that defect impossible by construction, for EVERY kind:

  K1  a quantity rides a splitter and a mixer by the kind's own laws -- the
      shipped witness splitter01_slurry_sizeDistribution gives both branches
      the slurry's distribution (fractions unchanged, the weight divided),
      and splitting then mixing returns the feed's distribution to the digit;
      every unit source that reads or writes a size distribution DECLARES
      that it models it (`UnitAcceptance::carried`, read from
      `choupoSolve --describe-units`), none is exempt, and a unit that does
      not model a kind (a heater fed a slurry with a distribution) refuses it
      by kind and unit before it runs -- authored or produced;
  K2  the batch driver refuses a carried quantity in its state tree, by name;
  K3  a mass-like kind enters the plant-boundary MASS BALANCE: a material
      through a mixer and a splitter closes at 100 % with the material
      counted, and the REAL report stops closing when one outlet's material
      is dropped (the sabotage is in the probe, never in src);
  K4  `CarriedQuantity` knows no kind: no `order`/`axis`/`edges`/`weight`
      member, a kind's own attributes live in a named block that the kind
      validates on construction, read and write;
  K5  the older spike claims still hold: chain moments through a reactor
      against the closed form, a material's change refused, the state files
      round-trip byte for byte, an old file without the block reads as none.

The probe is built against build/linux64Gcc (a probe build writes there; the
gate is ISO in bin/curate/suite_lanes.txt, where the slot's shadow build/ takes the write); every case it runs is in a
temporary copy.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
CASE = ROOT / "bin" / "curate" / "carried_kinds" / "mixsplit"
WITNESS = ROOT / "tutorials" / "steady" / "solids" / "splitter01_slurry_sizeDistribution"
BATCH = ROOT / "tutorials" / "batch" / "reactor" / "batch01_first_order"
ENV = dict(os.environ, CHOUPO_HOME=str(ROOT))
FAIL = []
OK = []


def run(binary, case, args=(), timeout=600):
    return subprocess.run([str(ROOT / binary), *args, str(case)], capture_output=True,
                          text=True, timeout=timeout, env=ENV, cwd=str(case))


def carried(path):
    """{name: (kind, [values])} of a state file's carried block."""
    t = Path(path).read_text()
    m = re.search(r"^carried\s*\{(.*)\n\}\s*$", t, re.S | re.M)
    out = {}
    if not m:
        return out
    for q in re.finditer(r"(\w+)\s*\{\s*kind\s+(\w+);.*?values\s*\(([^)]*)\)", m.group(1), re.S):
        out[q.group(1)] = (q.group(2), [float(x) for x in q.group(3).split()])
    return out


def psd_of(path):
    """(edges, diameter, massFrac) of a state file's size distribution."""
    t = Path(path).read_text()
    out = {}
    for key in ("edges", "diameter", "massFrac"):
        m = re.search(r"\b%s\s*\(([^)]*)\)" % key, t)
        out[key] = [float(x) for x in m.group(1).split()] if m else []
    return out


def check(cond, ok, bad):
    (OK if cond else FAIL).append(ok if cond else bad)


def fresh(tmp, name, src=CASE):
    d = Path(tmp) / name
    # C421 exception: the source is a fixture case under bin/curate (see debt_registry.OWN_CASE_COPY)
    shutil.copytree(src, d)
    return d


# --------------------------------------------------------------------------
# K1 static: every unit source that touches a size distribution declares it
# --------------------------------------------------------------------------
TOUCH = re.compile(r"\.psd\b|\bpsd\.|carriedOfInlet|applyCarried|ClassifierCore\.H|SolidLiquidCore\.H")
CORES = {"ClassifierCore", "SolidLiquidCore"}   # shared machinery, declared by their units


def units_touching_psd():
    """{registered type: source path} of the unit classes whose source reads or
    writes a size distribution (the registration lines map class to type)."""
    reg = (ROOT / "src" / "unitOperations" / "UnitOperation.cpp").read_text()
    type_of = {m.group(2): m.group(1) for m in
               re.finditer(r'reg\("(\w+)",\s*\[\]\s*\{\s*return std::make_unique<(\w+)>', reg)}
    out = {}
    for p in sorted((ROOT / "src" / "unitOperations").rglob("*.cpp")):
        rel = p.relative_to(ROOT / "src" / "unitOperations").parts
        if rel[0] in ("flowsheet", "batch") or p.stem in CORES or p.stem not in type_of:
            continue
        if TOUCH.search(p.read_text()):
            out[type_of[p.stem]] = str(p.relative_to(ROOT))
    return out


def main():
    if not (BUILD / "libchoupo.so").exists():
        print("check_carried_kinds: FAILED\n  no build; a check that cannot run must not pass.")
        return 1
    with tempfile.TemporaryDirectory() as tmp:
        # ---- K1: no exemption anywhere; every such unit declares ----------
        legacy = subprocess.run(["grep", "-rn", "legacyUnchecked", str(ROOT / "src")],
                                capture_output=True, text=True).stdout
        check(not legacy.strip(), "K1 no `legacyUnchecked` exemption survives in src",
              "K1: the exemption is back:\n" + legacy[:400])
        d = subprocess.run([str(ROOT / "choupoSolve"), "--describe-units"], capture_output=True,
                           text=True, env=ENV, cwd=tmp)
        try:
            desc = {u["type"]: u for u in json.loads(d.stdout[d.stdout.index('{\n  "schema"'):])["units"]}
        except Exception:
            desc = {}
        check(bool(desc), "K1 --describe-units prints every unit's carried-kinds declaration",
              "K1: `choupoSolve --describe-units` did not print JSON")
        check(desc and all("carried" in u for u in desc.values()),
              "K1 every one of %d unit types carries a `carried` entry in --describe-units" % len(desc),
              "K1: a unit type has no `carried` entry in --describe-units")
        touching = units_touching_psd()
        check(len(touching) >= 14, "K1 %d unit types read or write a size distribution" % len(touching),
              "K1: found only %d unit sources touching a size distribution (expected >= 14)" % len(touching))
        for t, src in touching.items():
            c = desc.get(t, {}).get("carried", {})
            check(c.get("declared") is True and c.get("sentence", "").strip(),
                  "K1 %-22s declares: %s%s" % (t, "models sizeDistribution" if "sizeDistribution" in c.get("kinds", []) or c.get("allKinds") else "refuses it on an inlet",
                                              ""),
                  "K1: unit '%s' (%s) touches a size distribution and declares no carried kinds" % (t, src))

        # ---- K1: the witness, then split + mix, then a unit that does not model it
        w = fresh(tmp, "witness", WITNESS)
        r = run("choupoSolve", w)
        check(r.returncode == 0, "K1 the shipped witness (splitter, slurry) runs",
              "K1: witness failed:\n" + r.stdout[-600:] + r.stderr[-600:])
        if r.returncode == 0:
            feed = psd_of(w / "converged" / "slurry")
            for br in ("branchA", "branchB"):
                got = psd_of(w / "converged" / br)
                check(bool(feed["massFrac"]) and got == feed,
                      "K1 %s carries the slurry's size distribution, class for class" % br,
                      "K1: %s lost or changed the size distribution (feed %r, branch %r)" % (br, feed, got))
            check("global closure 100.000 %" in r.stdout, "K1 witness mass closure 100.000 %",
                  "K1: witness does not close")
            # split -> mix returns the feed's distribution
            shutil.copy(w / "0" / "slurry", w / "0" / "merged")
            (w / "system" / "flowsheetDict").write_text(
                "units\n(\n    { name split; type splitter; in slurry; outputs ( branchA branchB ); operation { fractions ( 0.3 0.7 ); } }\n"
                "    { name join; type mixer; inputs ( branchA branchB ); outputs ( merged ); }\n);\n")
            r2 = run("choupoSolve", w)
            back = psd_of(w / "converged" / "merged") if r2.returncode == 0 else {}
            same = r2.returncode == 0 and all(
                len(back.get(k, [])) == len(feed[k]) and
                all(abs(a - b) <= 1e-12 * max(1e-30, abs(b)) for a, b in zip(back[k], feed[k]))
                for k in ("massFrac", "diameter"))
            check(same, "K1 split 30/70 then mix returns the feed's distribution to 1e-12",
                  "K1: split then mix did not return the feed's size distribution:\n" + (r2.stdout + r2.stderr)[-500:])
        # a heater fed a slurry with a distribution: AUTHORED
        h = fresh(tmp, "heater_authored", WITNESS)
        (h / "system" / "flowsheetDict").write_text(
            "units\n(\n    { name H1; type heater; in slurry; outputs ( hot ); operation { T 350 K; } }\n);\n")
        shutil.copy(h / "0" / "slurry", h / "0" / "hot")
        for gone in ("branchA", "branchB"):
            (h / "0" / gone).unlink()
        r = run("choupoSolve", h)
        msg = r.stdout + r.stderr
        check(r.returncode != 0 and "sizeDistribution" in msg and "heater 'H1'" in msg
              and "does not model that kind" in msg,
              "K1 authored: a heater fed a slurry with a size distribution is refused by kind and unit before it runs",
              "K1 authored: the heater was not refused as required:\n" + msg[-700:])
        # PRODUCED: the splitter's branch reaches the heater
        h2 = fresh(tmp, "heater_produced", WITNESS)
        (h2 / "system" / "flowsheetDict").write_text(
            "units\n(\n    { name split; type splitter; in slurry; outputs ( branchA branchB ); operation { fractions ( 0.3 0.7 ); } }\n"
            "    { name H1; type heater; in branchA; outputs ( hot ); operation { T 350 K; } }\n);\n")
        shutil.copy(h2 / "0" / "slurry", h2 / "0" / "hot")
        r = run("choupoSolve", h2)
        msg = r.stdout + r.stderr
        check(r.returncode != 0 and "sizeDistribution" in msg and "heater 'H1'" in msg and "inlet 'branchA'" in msg,
              "K1 produced: the splitter's branch is refused at the heater's hand-over, naming kind, unit, inlet",
              "K1 produced: not refused as required:\n" + msg[-700:])

        # ---- K2: the batch driver refuses a carried quantity ---------------
        if BATCH.exists():
            b0 = fresh(tmp, "batch_clean", BATCH)
            rb0 = run("choupoBatch", b0)
            check(rb0.returncode == 0, "K2 control: the clean batch case runs",
                  "K2: the clean batch case failed:\n" + (rb0.stdout + rb0.stderr)[-500:])
            for label, block in (("carried", "carried\n{\n    flour { kind materialMass; carrier wheat; values ( 1.0 ); }\n}\n"),
                                 ("size distribution", "particleSizeDistribution\n{\n    diameter ( 1e-4 );\n    massFrac ( 1.0 );\n}\n")):
                b = fresh(tmp, "batch_" + label.split()[0], BATCH)
                (b / "0" / "strayStream").write_text("T 300 K;\nP 101325 Pa;\n" + block)
                rb = run("choupoBatch", b)
                msg = rb.stdout + rb.stderr
                check(rb.returncode != 0 and "choupoBatch" in msg and "strayStream" in msg
                      and "models a carried quantity" in msg,
                      "K2 choupoBatch refuses a %s block in its state tree, naming the driver and the file" % label,
                      "K2: the batch driver did not refuse a %s block:\n%s" % (label, msg[-500:]))
        else:
            FAIL.append("K2: the batch case %s is gone" % BATCH)

        # ---- K5/S2a: mixer -> splitter, and K3 closure with the material ----
        d = fresh(tmp, "ms")
        r = run("choupoSolve", d)
        check(r.returncode == 0, "S2a run exits 0", "S2a: mixer->splitter case failed:\n" + r.stdout[-600:] + r.stderr[-600:])
        if r.returncode == 0:
            exp = {"flour": 1.25 + 2.75, "PS_mu0": 0.002 + 0.005, "PS_mu2": 8.5 + 31.0}
            for stream, f in (("mixed", 1.0), ("sideA", 0.3), ("sideB", 0.7)):
                got = carried(d / "converged" / stream)
                for k, v in exp.items():
                    g = got.get(k, (None, [float("nan")]))[1][0]
                    rel = abs(g - v * f) / (v * f)
                    check(rel < 1e-12, f"S2a {stream}.{k} = {g:.12g}",
                          f"S2a {stream}.{k} = {g!r}, expected {v*f!r} (rel {rel:.2e})")
            check("global closure 100.000 %" in r.stdout, "S2a mass closure 100.000 % (the material counted)",
                  "S2a: the mass-balance report does not close with the material counted")
            check("worst element closure off by 0.0000 %" in r.stdout, "S2a element closure 0.0000 % (existing report)",
                  "S2a: the existing element-balance report does not close")
            check("PS_mu2 [chainMoment" in r.stdout, "S2a report form printed in the stream table",
                  "S2a: the stream table does not print the carried quantities")
            csv = (d / "reports" / "balances" / "massBalance.csv").read_text() if (d / "reports" / "balances" / "massBalance.csv").exists() else ""
            m = re.search(r"^carried\.flour,([\d.]+),([\d.]+),", csv, re.M)
            check(bool(m) and abs(float(m.group(1)) - 4.0 * 3600) < 1e-3 and abs(float(m.group(2)) - 4.0 * 3600) < 1e-3,
                  "K3 massBalance.csv prints the material as its own row: in = out = 14400 kg/h",
                  "K3: no `carried.flour` row (or wrong numbers) in massBalance.csv:\n" + csv[-500:])

            # ---- S4: converged -> 0/ -> rerun, byte-identical ---------------
            d2 = fresh(tmp, "rt")
            for f in ("feedA", "feedB", "mixed", "sideA", "sideB"):
                shutil.copy(d / "converged" / f, d2 / "0" / f)
            r2 = run("choupoSolve", d2)
            same = r2.returncode == 0 and all(
                (d / "converged" / f).read_bytes() == (d2 / "converged" / f).read_bytes()
                for f in ("feedA", "feedB", "mixed", "sideA", "sideB"))
            check(same, "S4 converged -> 0/ -> converged is byte-identical (carried values read back to the same bits)",
                  "S4: a state read back from converged/ does not reproduce converged/ byte for byte")
            d3 = fresh(tmp, "old")
            for f in ("feedA", "feedB"):
                t = (d3 / "0" / f).read_text()
                (d3 / "0" / f).write_text(t[: t.index("carried")])
            r3 = run("choupoSolve", d3)
            check(r3.returncode == 0 and not carried(d3 / "converged" / "sideA")
                  and "carried" not in (d3 / "converged" / "mixed").read_text(),
                  "S4 a state file without the block reads as none carried (and none is written)",
                  "S4: an old file without `carried` did not read as none carried:\n" + r3.stdout[-400:])

        # ---- the probe: reactor leg, the mass balance sabotage, the attributes
        probe = BUILD / "carriedProbe"
        src = ROOT / "bin" / "curate" / "_carriedProbe.cpp"
        c = subprocess.run(["g++", "-std=c++17", "-O2", f"-I{ROOT / 'src'}", f"-I{ROOT}", str(src),
                            str(BUILD / "libchoupo.so"), "-Wl,-rpath," + str(BUILD), "-o", str(probe)],
                           capture_output=True, text=True)
        check(c.returncode == 0, "probe compiled", "probe did not compile:\n" + c.stderr[-1200:])
        if c.returncode == 0:
            pr = subprocess.run([str(probe), str(Path(tmp) / "probe")], capture_output=True, text=True, env=ENV)
            try:
                p = json.loads(pr.stdout)
            except Exception:
                FAIL.append("probe printed no JSON:\n" + (pr.stdout + pr.stderr)[-600:])
                p = None
        if c.returncode == 0 and p:
            check(abs(p["mixed_mu0"] - 0.007) < 1e-15 and abs(p["mixed_mu2"] - 39.5) < 1e-12,
                  "S2b mixing law of chainMoment adds", "S2b: mixing law wrong: %r" % p)
            check(abs(p["branch_mu0"] - 0.3 * 0.007) < 1e-15, "S2b division law scales with the carrier",
                  "S2b: division law wrong")
            r0 = abs(p["mu0_out_rk4"] - p["mu0_out_closed"]) / p["mu0_out_closed"]
            r2_ = abs(p["mu2_out_rk4"] - p["mu2_out_closed"]) / p["mu2_out_closed"]
            check(r0 < 1e-12 and r2_ < 1e-9, f"S2b reactor moments vs closed form: mu0 {r0:.1e}, mu2 {r2_:.1e}",
                  f"S2b: moments off the closed form (mu0 {r0:.2e}, mu2 {r2_:.2e})")
            check(p["mu1_in"] == p["mu1_out"] and abs(p["chains_in"] - p["chains_out_plus_events"]) < 1e-15,
                  "S2b segments (mu1) unchanged and chain count balanced by the events",
                  "S2b: segment or chain-count balance broken")
            check(p["material_change_refused"] == 1 and p["material_refusal_names_kind"] == 1
                  and p["material_unchanged_accepted"] == 1,
                  "S2b a material handed to the reactor: a change is refused by name, an unchanged value accepted",
                  "S2b: the materialMass kind did not refuse a production term")
            # K3
            check(p["mass_kinds_state_it"] == 1, "K3 the kind states whether its total is a mass (materialMass yes; moments, distribution no)",
                  "K3: a kind's `totalIsMass` is wrong")
            check(abs(p["closure_kept"] - 100.0) < 1e-9 and p["carried_row_kept"].startswith("carried.flour,14400.0000,14400.0000"),
                  "K3 the REAL report closes at 100 %% with the material counted (row: %s)" % p["carried_row_kept"],
                  "K3: report closure %r, row %r" % (p["closure_kept"], p["carried_row_kept"]))
            check(abs(p["closure_dropped"] - 100.0) > 1.0 and p["carried_row_dropped"].startswith("carried.flour,14400.0000,4320.0000"),
                  "K3 the report FAILS to close when one outlet's material is dropped (%.2f %%)" % p["closure_dropped"],
                  "K3: dropping an outlet's material left closure %r (row %r)" % (p["closure_dropped"], p["carried_row_dropped"]))
            # K4
            check(all(p[k] == 1 for k in ("bad_moment_refused", "bad_order_refused", "bad_psd_refused",
                                          "bad_material_refused", "bad_edges_refused", "bad_write_refused")),
                  "K4 each kind refuses an attribute that is not its own, a bad value, and a corrupted quantity on write",
                  "K4: a kind accepted what is not its own: %r" % {k: v for k, v in p.items() if k.startswith("bad_")})
            check(p["refusals_name_the_quantity"] == 1, "K4 the refusals name the quantity",
                  "K4: a refusal does not name the quantity")
        hdr = (ROOT / "src" / "streams" / "Carried.H").read_text()
        body = re.search(r"struct CarriedQuantity\s*\{(.*?)\n\};", hdr, re.S)
        members = re.findall(r"^\s+(?:std::\w+(?:<[^;]*>)?|int|scalar)\s+(\w+)\s*(?:=[^;]*)?;", body.group(1), re.M) if body else []
        check(body and not ({"order", "axis", "edges", "weight"} & set(members)),
              "K4 CarriedQuantity's members are %s -- no order, axis, edges or weight" % ", ".join(members),
              "K4: CarriedQuantity still has a kind's own member: %r" % members)

        # ---- S3: a kind on an inlet the unit does not model ---------------
        d4 = fresh(tmp, "heater_authored_mat")
        (d4 / "system" / "flowsheetDict").write_text(
            "units\n(\n    { name H1; type heater; in feedA; outputs ( hot ); operation { T 350 K; } }\n);\n")
        for f in ("feedB", "mixed", "sideA", "sideB"):
            (d4 / "0" / f).unlink()
        shutil.copy(CASE / "0" / "feedA", d4 / "0" / "hot")
        t = (d4 / "0" / "hot").read_text()
        (d4 / "0" / "hot").write_text(t[: t.index("carried")])
        r4 = run("choupoSolve", d4)
        msg = r4.stdout + r4.stderr
        check(r4.returncode != 0 and "chainMoment" in msg and "heater 'H1'" in msg and "does not model that kind" in msg
              and "Mixer inputs" not in msg,
              "S3 authored: heater refuses the chainMoment by kind and unit before any unit runs",
              "S3 authored: not refused as required:\n" + msg[-700:])
        d5 = fresh(tmp, "heater_produced_mat")
        (d5 / "system" / "flowsheetDict").write_text(
            "units\n(\n    { name M1; type mixer; inputs ( feedA feedB ); outputs ( mixed ); }\n"
            "    { name H1; type heater; in mixed; outputs ( hot ); operation { T 350 K; } }\n);\n")
        for f in ("sideA", "sideB"):
            (d5 / "0" / f).unlink()
        shutil.copy(CASE / "0" / "mixed", d5 / "0" / "hot")
        r5 = run("choupoSolve", d5)
        msg = r5.stdout + r5.stderr
        check(r5.returncode != 0 and "heater 'H1'" in msg and "inlet 'mixed'" in msg and "does not model that kind" in msg,
              "S3 produced: the mixer's outlet is refused at the heater's hand-over, naming kind, unit, inlet",
              "S3 produced: not refused as required:\n" + msg[-700:])

    if FAIL:
        print("check_carried_kinds: FAILED")
        for f in FAIL:
            print("  - " + f)
        return 1
    for o in OK:
        print("  ok  " + o)
    print(f"check_carried_kinds: OK -- {len(OK)} claims held (K1 no exemption and every size-distribution unit declares, "
          "K2 batch refuses, K3 mass balance counts a material, K4 the core type knows no kind, K5 the spike's claims)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
