#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""A missing property of a solid is REFUSED or ANNOUNCED, never replaced in silence.

WHAT THIS GATE IS ABOUT.  Review SP-01..SP-05 (docs/reviews/2026-11-12-solid-
properties) found one class of defect in five places: a solid property that
was missing came back as a number at exit 0.

  SP-01  cyclone / pneumatic conveyor: a solid with no `rho_p` entered the
         mass-weighted particle density as ZERO while its mass stayed in the
         denominator (silica + graphite at equal mass: 2650 -> 1325 kg/m3).
  SP-02  spray dryer: no `rho_p` -> 1500 kg/m3, unannounced.
  SP-03  `k_v` absent -> the sphere pi/6, unannounced (the MSMPR crystalliser
         turns k_v into a magma density).
  SP-04  `sorption { Xm; C; K; }`: a missing C or K read as 0, X_eq = 0.
  SP-05  three rules for the density of several solids; now ONE home
         (src/thermo/SolidMixture): volumes add (harmonic mean), announced.

One arm per row.  Probes are copies of shipped witnesses with ONE edit each:
the second solid is graphite, whose catalogue record declares no `rho_p`.

WHAT THIS GATE DOES NOT CHECK.  That the harmonic mean is the right mixing
rule for a real powder (it is the ideal-mixing assumption, announced); the
hydrocyclone (it already refused a missing density and adds volumes); the
batch dryer and the time-integrated binaries (a missing sorption parameter is
refused when the component is READ, which they share, but no probe runs them);
the equilibrium crystalliser (it does not use k_v).
"""
import os, re, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SOLVE = os.path.join(ROOT, 'choupoSolve')
T = os.path.join(ROOT, 'tutorials/steady')
CYC = os.path.join(T, 'gas-solid/cyclone02_leith_licht')
CONV = os.path.join(T, 'solids/pneumaticConveyor01_sand')
SPRAY = os.path.join(T, 'drying/sprayDryer01_sugar')
MSMPR = os.path.join(T, 'crystallisation/crystalliser02_msmpr')
SDRY = os.path.join(T, 'drying/solidDryer01_sugar')


def run(case):
    p = subprocess.run([SOLVE, case], capture_output=True, text=True, timeout=300)
    return p.returncode, p.stdout + p.stderr


def rw(path, edit):
    s = open(path).read()
    s2 = edit(s)
    if s2 == s:
        sys.exit("FAIL check_solid_property_refusals: a probe edit changed "
                 "nothing in %s -- the gate is not testing what it says." % path)
    open(path, 'w').write(s2)


def copy(tmp, base, name):
    d = os.path.join(tmp, name)
    if os.path.isdir(d):
        shutil.rmtree(d)
    shutil.copytree(base, d)
    # drop run output so the probe is solved afresh
    for sub in ('converged', 'reports'):
        shutil.rmtree(os.path.join(d, sub), ignore_errors=True)
    return d


def unseal(d):
    m = os.path.join(d, 'constant/propertyManifest')
    if os.path.exists(m):
        s = open(m).read()
        open(m, 'w').write(re.sub(r'(sealed\s+)true', r'\1false', s))


def add_graphite(d, flow='0.5 kmol/h'):
    """A second solid with NO particle density (the catalogue graphite)."""
    unseal(d)
    os.makedirs(os.path.join(d, 'constant/components'), exist_ok=True)
    shutil.copy(os.path.join(ROOT, 'data/standards/components/graphite.dat'),
                os.path.join(d, 'constant/components/graphite.dat'))
    rw(os.path.join(d, 'constant/thermoPhysPropDict'),
       lambda s: re.sub(r'components\s*\(([^)]*)\)',
                        lambda m: 'components (%s graphite )' % m.group(1), s, count=1))
    feed = None
    for f in sorted(os.listdir(os.path.join(d, '0'))):
        p = os.path.join(d, '0', f)
        if os.path.isfile(p) and f.lower() in ('feed', 'solidsin') \
                and re.search(r'^\s*solid\s*$', open(p).read(), re.M):
            feed = p
            break
    if feed is None:
        sys.exit("FAIL check_solid_property_refusals: no solid-bearing feed "
                 "file in %s/0" % d)
    # overall material block: the first `componentMolarFlows {` of the file
    rw(feed, lambda s: re.sub(r'(^componentMolarFlows\s*\{)',
                              r'\1\n    graphite %s;' % flow, s, count=1, flags=re.M))

    def solid(s):                       # phases.solid.componentMolarFlows
        i = re.search(r'^\s*solid\s*$', s, re.M).start()
        k = s.index('{', s.index('componentMolarFlows', i)) + 1
        return s[:k] + '\n            graphite %s;' % flow + s[k:]
    rw(feed, solid)


def edit_record(d, comp, edit):
    unseal(d)
    p = os.path.join(d, 'constant/components/%s.dat' % comp)
    if not os.path.exists(p):
        os.makedirs(os.path.dirname(p), exist_ok=True)
        shutil.copy(os.path.join(ROOT, 'data/standards/components/%s.dat' % comp), p)
    rw(p, edit)


def main():
    if not os.path.exists(SOLVE):
        sys.exit("FAIL check_solid_property_refusals: choupoSolve not built.")
    bad = []
    with tempfile.TemporaryDirectory() as tmp:

        # -- NEGATIVE: the shipped witnesses still run --------------------
        for base in (CYC, CONV, SPRAY, MSMPR, SDRY):
            rc, out = run(base)
            if rc != 0:
                bad.append("the shipped witness %s no longer runs (rc=%d)"
                           % (os.path.basename(base), rc))

        # -- SP-01: silica + graphite (no rho_p) in a cyclone and a conveyor
        for label, base in (("cyclone", CYC), ("pneumaticConveyor", CONV)):
            d = copy(tmp, base, 'sp01_' + label)
            add_graphite(d)
            rc, out = run(d)
            if rc == 0:
                bad.append("SP-01 %s: a solid with no rho_p ran to completion"
                           " -- it is entering the density as zero again" % label)
            for want in ("graphite", "no particle density", "rho_p",
                         "constant/components/graphite"):
                if want not in out:
                    bad.append("SP-01 %s: the refusal does not mention %r"
                               % (label, want))

        # -- SP-05: the same two solids WITH a density -> the volume-additive
        #    (harmonic) mean, announced, in the cyclone AND the conveyor.
        #    2260 kg/m3 is a probe value in a temp copy, not a datum.
        #    cyclone02: silica 0.8322 kmol/h (50.0 kg) + graphite 0.5 kmol/h
        #    (6.0055 kg): 56.0055 / (50/2650 + 6.0055/2260) = 2601.9 kg/m3
        #    (the old arithmetic mean would print 2587).
        for label, base, show in (("cyclone", CYC, 'Particle rho_p = 2602'),
                                  ("pneumaticConveyor", CONV, None)):
            d = copy(tmp, base, 'sp05_' + label)
            add_graphite(d)
            edit_record(d, 'graphite',
                        lambda s: s.rstrip() + '\n\nsolid { rho_p 2260; }\n')
            rc, out = run(d)
            if rc != 0:
                bad.append("SP-05 %s: two solids WITH densities no longer run "
                           "(rc=%d)" % (label, rc))
            if 'harmonic mean (volumes additive' not in out:
                bad.append("SP-05 %s: the mixture is not announced as the "
                           "volume-additive harmonic mean" % label)
            if show and show not in out:
                bad.append("SP-05 cyclone: the particle density is not the "
                           "harmonic mean (expected %r)" % show)

        # -- SP-02: spray dryer, sugar with no rho_p -> refuse, no 1500 ----
        d = copy(tmp, SPRAY, 'sp02')
        # find the solid of the case: the record carrying `solid {` with rho_p
        comp_dir = os.path.join(d, 'constant/components')
        done = False
        for f in sorted(os.listdir(comp_dir)):
            s = open(os.path.join(comp_dir, f)).read()
            if re.search(r'\brho_p\b', s) and re.search(r'\bsolid\b', s):
                edit_record(d, f[:-4], lambda s: re.sub(r'^\s*rho_p\s+[^;]*;.*$', '', s,
                                                        count=1, flags=re.M))
                done = True
                name = f[:-4]
                break
        if not done:
            bad.append("SP-02: no record with rho_p found in the spray witness")
        else:
            rc, out = run(d)
            if rc == 0:
                bad.append("SP-02: a spray dryer whose solid has no rho_p ran"
                           " to completion -- the 1500 kg/m3 default is back")
            for want in (name, "no particle density", "No default density"):
                if want not in out:
                    bad.append("SP-02: the refusal does not mention %r" % want)

        # -- SP-03: MSMPR, no k_v -> runs, ANNOUNCED the sphere ------------
        d = copy(tmp, MSMPR, 'sp03')
        comp_dir = os.path.join(d, 'constant/components')
        removed = None
        if os.path.isdir(comp_dir):
            for f in sorted(os.listdir(comp_dir)):
                s = open(os.path.join(comp_dir, f)).read()
                if re.search(r'^\s*k_v\b', s, re.M):
                    edit_record(d, f[:-4], lambda s: re.sub(r'^\s*k_v\s+[^;]*;.*$', '', s,
                                                            count=1, flags=re.M))
                    removed = f[:-4]
                    break
        if removed is None:
            bad.append("SP-03: no record with k_v found in the MSMPR witness")
        else:
            rc, out = run(d)
            if rc != 0:
                bad.append("SP-03: the MSMPR with no k_v no longer runs (rc=%d); the"
                           " sphere is a DECLARED-BY-ANNOUNCEMENT default" % rc)
            for want in (removed, "k_v", "sphere", "ASSUMED"):
                if want not in out:
                    bad.append("SP-03: the announcement does not mention %r" % want)
        rc, out = run(MSMPR)
        if 'ASSUMED' in out and 'volume shape' in out:
            bad.append("SP-03: the shipped witness DECLARES k_v yet the sphere"
                       " is announced")

        # -- SP-04: sorption with no C / no K -> refuse naming it ----------
        for key in ('C', 'K'):
            d = copy(tmp, SDRY, 'sp04_' + key)
            comp_dir = os.path.join(d, 'constant/components')
            hit = None
            for f in sorted(os.listdir(comp_dir)):
                s = open(os.path.join(comp_dir, f)).read()
                if re.search(r'\bsorption\s*\{', s):
                    hit = f[:-4]
                    edit_record(d, hit, lambda s: re.sub(
                        r'^(\s*)%s\s+[^;]*;.*$' % key, '', s, count=1, flags=re.M))
                    break
            if hit is None:
                bad.append("SP-04: no record with sorption{} in the dryer witness")
                continue
            rc, out = run(d)
            if rc == 0:
                bad.append("SP-04: a sorption block with no %s ran to completion"
                           " -- X_eq = 0 in silence is back" % key)
            for want in (hit, "`%s`" % key, "sorption"):
                if want not in out:
                    bad.append("SP-04 (%s): the refusal does not mention %r"
                               % (key, want))

    if bad:
        print("FAIL check_solid_property_refusals:")
        for b in bad:
            print("  " + b)
        return 1
    print("check_solid_property_refusals: OK -- the five witnesses still run; a"
          " solid with no rho_p is refused by name in the cyclone, the pneumatic"
          " conveyor and the spray dryer (no zero, no 1500 kg/m3); an absent k_v"
          " runs the MSMPR on the sphere and ANNOUNCES it; a sorption block"
          " missing C or K is refused naming the key.  NOT CHECKED: that the"
          " harmonic mean suits a real powder, the hydrocyclone, the batch dryer"
          " and the time-integrated binaries, the equilibrium crystalliser.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
