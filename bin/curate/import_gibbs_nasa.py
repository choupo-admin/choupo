#!/usr/bin/env python3
# import_gibbs_nasa.py -- fill the formation-data gap (gibbsFormation: dHf_298,
# s_298) from the NASA Glenn thermodynamic database (public domain).
#
# SOURCE: McBride, Gordon & Reno, "Coefficients for Calculating Thermodynamic
# and Transport Properties of Individual Species", NASA TM-4513 (1993) -- a US
# government work, PUBLIC DOMAIN (CLEAN).  Bundled with cantera as nasa_gas.yaml.
# The NASA-7 polynomials are referenced to the elements, so the standard-state
# enthalpy H0(298.15) IS the enthalpy of formation dHf0(298.15), and S0(298.15)
# is the third-law absolute entropy -- exactly the two values Choupo's
# gibbsFormation{} block needs (phase gas).
#
# ISOMER GUARD (the C3H6O lesson): NASA names many species by FORMULA only and
# "C3H6O" in TM-4513 is PROPYLENE OXIDE (Hf -93.7), NOT acetone (-217.1).  Every
# mapping therefore carries an EXPECTED Hf and the import REFUSES a species whose
# NASA Hf deviates > 5 kJ/mol -- a wrong-isomer match is a transcription error to
# CATCH, never a number to trust.
#
# ANCHORS: a verify() gate cross-checks CO2/H2O/NH3/benzene/CO against known
# values (<= 0.5 kJ/mol) before any file is touched.
#
# SCOPE: writes clean NASA gibbs into matched data/proposed/components/*.dat
# (compl=2 CoolProp files + the Wave-2 REPLACE files, replacing any grafted/
# excluded-source or Joback gibbs) and REFITS matched data/standards/components/
# files whose gibbs is an ESTIMATE (Joback/DERIVED/[prior-standard]) or absent --
# a real measured/curated standard value is left untouched.  Commits NOTHING.
#
# ----- THE REMAINING GAP + how NOT to fill it (forum wf_c31806c3, 2026-06-14) -----
# NASA TM-4513 has NO entry for: acetone (its C3H6O is PROPYLENE OXIDE, the isomer
# landmine), nHexane, nNonane, nDecane, neopentane, isohexane, o/m/p-xylene,
# diethylEther.  Eight are already PROMOTED carrying honestly-tagged Joback gibbs
# (origin=estimated, ~9 kJ/mol); acetone+nHexane stay HELD in proposed/.  Filling
# them is an optional UPGRADE, not a fix -> ratified verdict: DEFER.
#   * BURCAT (Third Millennium DB) is the convenient single NASA-7 file w/ CAS +
#     S298 + Cp + ATcT updates -- and is licence-EXCLUDED (verbatim NonCommercial +
#     no-redistribution terms).  Every package that bundles it (thermochem/RMG/
#     thermopy) is PROVENANCE LAUNDERING.  *** DO NOT RETRY Burcat via ANY route. ***
#   * The ONLY clean upgrade source is ATcT (DOE national-lab, OSTI versioned DOI,
#     no NC clause) -- but dHf-only and 403s automation, so a MANUAL curation act:
#     hand-pull dHf + version DOI per species, pair s_298/Cp from NASA-TM-4513 (where
#     present) else CoolProp for Cp(T) SHAPE only (NEVER CoolProp h00/s00).  Port the
#     anchor + isomer guards below verbatim; acetone MUST carry an expected-dHf entry.

import re, sys, importlib.util
from pathlib import Path

import cantera as ct

ROOT = Path(__file__).resolve().parents[2]
PROP = ROOT / 'data/proposed/components'
STD  = ROOT / 'data/standards/components'
OUT  = ROOT / 'data/proposed/COOLPROP-GIBBS-NASA.md'

ref = importlib.util.spec_from_file_location(
    'refresh', Path(__file__).with_name('refresh_coolprop_collisions.py'))
R = importlib.util.module_from_spec(ref); ref.loader.exec_module(R)

# Choupo name -> (NASA species name, expected dHf0_298 [kJ/mol] for the guard).
# Only isomer-unambiguous, anchor-trusted species.  Absent targets (acetone =
# C3H6O-is-propylene-oxide, nHexane, nNonane, nDecane, neopentane, isohexane,
# o/m/p-xylene, diethylEther, 1,2-dichloroethane, ortho/para-H2/D2) are NOT here.
MAP = {
    'methanol': ('CH3OH', -201.0),  'ethanol': ('C2H5OH', -234.8),
    'toluene': ('C7H8', 50.0),      'benzene': ('C6H6', 82.9),
    'propane': ('C3H8', -104.7),    'ethane': ('C2H6', -83.8),
    'Ethylene': ('C2H4', 52.4),     'Propylene': ('C3H6,propylene', 20.0),
    '1Butene': ('C4H8,1-butene', -0.1),
    'nButane': ('C4H10,n-butane', -125.8),
    'nPentane': ('C5H12,n-pentane', -146.8),
    'isopentane': ('C5H12,i-pentane', -153.7),
    'nHeptane': ('C7H16,n-heptane', -187.7),
    'nOctane': ('C8H18,n-octane', -208.7),
    'cyclohexane': ('C6H12,cyclo-', -123.1),
    'N2': ('N2', 0.0), 'O2': ('O2', 0.0), 'H2': ('H2', 0.0),
    'Ar': ('Ar', 0.0), 'He': ('He', 0.0), 'neon': ('Ne', 0.0), 'D2': ('D2', 0.0),
    'CO2': ('CO2', -393.5), 'CO': ('CO', -110.5), 'CH4': ('CH4', -74.6),
    'NH3': ('NH3', -45.9), 'H2S': ('H2S', -20.5), 'SO2': ('SO2', -296.8),
    'N2O': ('N2O', 82.0), 'HCl': ('HCL', -92.3),
}

ESTIMATE_MARK = ('Joback', 'origin=estimated', 'DERIVED', '[prior-standard]')


def nasa_values():
    """name -> (Hf_J_per_mol, S_J_per_mol_K) from the NASA polynomials."""
    sp = {s.name: s for s in ct.Species.list_from_file('nasa_gas.yaml')}
    Rg = ct.gas_constant                       # J/kmol/K
    out = {}
    for n in sp:
        out[n] = sp[n]
    def hs(nasa_name):
        g = ct.Solution(thermo='ideal-gas', species=[sp[nasa_name]])
        g.TP = 298.15, ct.one_atm
        Hf = g.standard_enthalpies_RT[0] * Rg * 298.15 / 1000.0   # J/mol
        S  = g.standard_entropies_R[0] * Rg / 1000.0              # J/mol/K
        return Hf, S
    return sp, hs


def verify(hs):
    anchors = {'CO2': -393.51, 'H2O': -241.83, 'NH3': -45.90, 'C6H6': 82.93,
               'CO': -110.53}
    worst = 0.0
    for n, ref_kJ in anchors.items():
        Hf, _ = hs(n)
        d = abs(Hf / 1000.0 - ref_kJ)
        worst = max(worst, d)
    return worst


def gibbs_block(dHf, s298):
    return ('gibbsFormation\n{\n'
            f'    dHf_298   {dHf:.1f};        // J/mol  ideal-gas '
            '[origin=measured method=NASA-TM4513]\n'
            f'    s_298     {s298:.2f};        // J/(mol.K) third-law absolute '
            '[NASA-TM4513]\n'
            '    phase     gas;\n}')


def existing_gibbs_is_estimate(text):
    e = R.extract_block(text, 'gibbsFormation')
    if not e:
        return True                # absent -> fill it
    return any(m in e[0] for m in ESTIMATE_MARK)


def apply(path, name, dHf, s298):
    text = path.read_text()
    blk = gibbs_block(dHf, s298)
    e = R.extract_block(text, 'gibbsFormation')
    if e:
        text = text[:e[1]] + blk + text[e[2]:]
    else:                          # insert before provenance, else append
        prov = R.extract_block(text, 'provenance')
        if prov:
            text = text[:prov[1]] + blk + '\n\n' + text[prov[1]:]
        else:
            text = text.rstrip() + '\n\n' + blk + '\n'
    # add a provenance note
    prov = R.extract_block(text, 'provenance')
    if prov and 'gibbsFormation "NASA' not in text:
        note = '    gibbsFormation "NASA TM-4513 (McBride-Gordon-Reno 1993), H0/S0(298.15) from NASA-7 poly";\n'
        close = prov[1] + prov[0].rfind('}')
        text = text[:close] + note + text[close:]
    # HELD banner cleanup: if no excluded-graft markers remain, drop the banner
    if '[prior-standard]' not in text:
        text = re.sub(r'(?m)^// HELD \(Wave-2 REPLACE merge\):.*\n'
                      r'(// .*\n)*', '', text)
        # also drop the now-stale "inherited ... [prior-standard]" provenance note
        text = re.sub(r'(?m)^\s*inherited\s+"[^"]*";\n', '', text)
    path.write_text(text)


def main():
    sp, hs = nasa_values()
    dev = verify(hs)
    print(f'NASA anchor verify: worst |dHf-ref| = {dev:.3f} kJ/mol')
    if dev > 0.5:
        print('ABORT: anchor check failed (transcription/units error).'); sys.exit(1)

    # resolve + guard every mapping once
    resolved, guard_fail = {}, []
    for cname, (nname, expect) in MAP.items():
        if nname not in sp:
            guard_fail.append((cname, f'NASA species {nname!r} absent')); continue
        Hf, S = hs(nname)
        if abs(Hf / 1000.0 - expect) > 5.0:
            guard_fail.append((cname, f'isomer guard: NASA Hf {Hf/1000:.1f} vs expected {expect} (>5 kJ/mol)'))
            continue
        resolved[cname] = (Hf, S, nname)

    done_prop, done_std, skipped = [], [], []
    # proposed/: every matched file
    for cname, (Hf, S, nname) in resolved.items():
        p = PROP / f'{cname}.dat'
        if p.exists():
            apply(p, cname, Hf, S); done_prop.append((cname, Hf / 1000, S, nname))
    # standards/: only ESTIMATE/absent gibbs (never overwrite a curated measured value)
    for cname, (Hf, S, nname) in resolved.items():
        s = STD / f'{cname}.dat'
        if s.exists():
            if existing_gibbs_is_estimate(s.read_text()):
                apply(s, cname, Hf, S); done_std.append((cname, Hf / 1000, S, nname))
            else:
                skipped.append((cname, 'standard has a curated (non-estimate) gibbs -- left untouched'))

    write_report(done_prop, done_std, guard_fail, skipped, dev)
    print(f'NASA gibbs written: {len(done_prop)} proposed, {len(done_std)} standards refit.')
    for c, h, s, n in done_std:
        print(f'  REFIT std {c:<12} dHf {h:8.1f} kJ/mol  s {s:6.2f}  <- {n}')
    if guard_fail:
        print('  guard/skip:')
        for c, why in guard_fail:
            print(f'    - {c}: {why}')


def write_report(prop, std, guard_fail, skipped, dev):
    L = ['# NASA-TM-4513 gibbsFormation import (public domain)', '']
    L.append(f'Source: McBride, Gordon & Reno, NASA TM-4513 (1993) -- US-gov public domain '
             f'(cantera nasa_gas.yaml). dHf0_298 = H0(298.15) referenced to elements; '
             f's_298 = S0(298.15). Anchor verify worst = {dev:.3f} kJ/mol (CO2/H2O/NH3/benzene/CO).')
    L.append('')
    L.append('Isomer guard: each mapping carries an expected dHf; a NASA value off by >5 kJ/mol '
             'is REFUSED (the C3H6O=propylene-oxide-not-acetone trap). Acetone, nHexane, nNonane, '
             'nDecane, neopentane, isohexane, o/m/p-xylene, diethylEther, 1,2-dichloroethane and '
             'ortho/para spin isomers have NO clean NASA match -> NOT imported (gap kept honest).')
    L.append('')
    L.append('## standards/ refit (Joback estimate -> NASA measured)')
    L.append('')
    L.append('| name | dHf_298 kJ/mol | s_298 J/mol/K | NASA species |')
    L.append('|---|---|---|---|')
    for c, h, s, n in sorted(std):
        L.append(f'| {c} | {h:.1f} | {s:.2f} | {n} |')
    L.append('')
    L.append('## proposed/ filled or replaced')
    L.append('')
    L.append('| name | dHf_298 kJ/mol | s_298 J/mol/K | NASA species |')
    L.append('|---|---|---|---|')
    for c, h, s, n in sorted(prop):
        L.append(f'| {c} | {h:.1f} | {s:.2f} | {n} |')
    if guard_fail:
        L.append('')
        L.append('## guard failures (NOT imported)')
        for c, why in guard_fail:
            L.append(f'- {c}: {why}')
    if skipped:
        L.append('')
        L.append('## standards left untouched (curated non-estimate gibbs)')
        for c, why in skipped:
            L.append(f'- {c}: {why}')
    L.append('')
    OUT.write_text('\n'.join(L))


if __name__ == '__main__':
    main()
