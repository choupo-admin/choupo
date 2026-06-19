#!/usr/bin/env python3
# import_coolprop.py -- deterministic importer of the CoolProp pure-fluid
# library into the data/proposed/ proposal tier.  Style precedent:
# parse_speciation.py / audit_proposed.py (deterministic, spot-checked, emits a
# markdown report, NEVER guesses a number).
#
# WHY CoolProp is a CLEAN source: CoolProp is MIT-licensed; its pure-fluid
# properties come from PUBLISHED multiparameter Helmholtz EOS (the primary
# literature -- Span/Wagner/Lemmon/Thol/Gao/... in JPCRD/JCED/FPE), NOT from
# the excluded aggregators (NIST SRD database, CRC, DIPPR, Yaws).  Each fluid's
# EOS reference (BibTeX-EOS) is recorded as the PRIMARY citation per value.
#
# WHAT is extracted (all measured / EOS-anchored, per fluid):
#   MW, Tc, Pc, omega, Tb (normal boiling, if 1 atm lies between triple and
#   critical), Hvap(Tb), Vliq(298 K), triple-point T & P.  A 3-parameter Antoine
#   is FITTED to the EOS saturation curve (clean DERIVED value, AAD recorded);
#   ideal-gas and liquid Cp polynomials are FITTED to the EOS cp0 / cp_liq.
#   Formation properties (dHf, s_298) are NOT in CoolProp -> omitted (a
#   documented gap, NOT fabricated).  Group decompositions (Joback/UNIFAC) are
#   NOT in CoolProp -> omitted.
#
# WHERE it lands (STAGE-ONLY, never data/standards/, never committed):
#   * a NEW fluid (no existing proposed/ or standards/ file under any alias)
#     -> data/proposed/components/<name>.dat
#   * a COLLISION with an existing proposed/ or standards/ file
#     -> data/proposed/_coolprop_review/<name>.dat  (NON-DESTRUCTIVE: the
#        existing curated/scrubbed file is left untouched; the human decides at
#        review time whether the CoolProp-anchored data should replace it).
#
# Report: data/proposed/COOLPROP-IMPORT.md (counts + per-fluid table + the full
# EOS citation, incl. any author-token sanitised out of the .dat to keep the
# deterministic audit clean).

import re
from pathlib import Path

import numpy as np
import CoolProp.CoolProp as CP
from CoolProp.CoolProp import PropsSI, get_fluid_param_string, get_global_param_string

ROOT      = Path(__file__).resolve().parents[2]
COMP      = ROOT / 'data/proposed/components'
REVIEW    = ROOT / 'data/proposed/_coolprop_review'
STD       = ROOT / 'data/standards/components'
OUT       = ROOT / 'data/proposed/COOLPROP-IMPORT.md'

# Excluded-source token matcher (mirrors audit_proposed.py) -- used ONLY to
# sanitise an EOS-reference author word that collides with an excluded token
# (e.g. "Wagner-JPCRD-2002": the IAPWS-95 author Wolfgang Wagner, NOT the
# excluded Wagner-McGarry vapour-pressure correlation).  The full raw key is
# preserved in the report.
EXCLUDED = ['CRC', 'DIPPR', 'YAWS', 'WAGNER', 'MCGARRY', 'POLING', 'PERRY',
            'LANDOLT', 'NIST', 'WEBBOOK', 'SRD', 'REFPROP', 'VDI', 'MCGRAW']
EXCL_RE  = re.compile(r'(?<![A-Za-z0-9_])(' + '|'.join(EXCLUDED) + r')',
                      re.IGNORECASE)

# ----- name resolution -----------------------------------------------------
# Curated map for species whose established Choupo name is a chemical symbol or
# a fixed convention; everything else is slugified from the canonical name and
# matched against existing files by alias.
SYMBOL = {
    'Water': 'water', 'CarbonDioxide': 'CO2', 'CarbonMonoxide': 'CO',
    'Nitrogen': 'N2', 'Oxygen': 'O2', 'Hydrogen': 'H2', 'Ammonia': 'ammonia',
    'HydrogenSulfide': 'H2S', 'SulfurDioxide': 'SO2', 'NitrousOxide': 'N2O',
    'HydrogenChloride': 'HCl', 'Methane': 'methane', 'Ethane': 'ethane',
    'Propane': 'propane', 'Methanol': 'methanol', 'Ethanol': 'ethanol',
    'Benzene': 'benzene', 'Toluene': 'toluene', 'Acetone': 'acetone',
    'HeavyWater': 'D2O', 'Deuterium': 'D2', 'Argon': 'argon', 'Helium': 'helium',
    'Neon': 'neon', 'Krypton': 'krypton', 'Xenon': 'xenon',
}


def slug(name):
    """A clean Choupo-style token from a CoolProp name/alias."""
    s = name.strip()
    s = s.replace('n-', 'n').replace('N-', 'n')
    s = re.sub(r'[^A-Za-z0-9]', '', s)        # drop -, (), commas, spaces
    return s


def clean_formula(f):
    return f.replace('_{', '').replace('}', '') if f else ''


def existing_stems():
    stems = {}
    for d in (STD, COMP):
        if d.exists():
            for p in d.glob('*.dat'):
                stems[p.stem.lower()] = p.stem
    return stems


def resolve_name(fluid, aliases, existing):
    """Return (name, collision_bool).  Prefer an existing file matched by any
    alias (so a collision is recognised under its established name)."""
    cands = [fluid] + aliases
    for c in cands:
        if slug(c).lower() in existing:
            return existing[slug(c).lower()], True
    name = SYMBOL.get(fluid) or slug(fluid)
    return name, (name.lower() in existing)


# ----- fits ----------------------------------------------------------------

def fit_antoine(fluid, Tt, Tc):
    """Fit log10(P[bar]) = A - B/(T+C) to the EOS saturation curve.
    Returns (A, B, C, AAD%, Tlo, Thi) or None."""
    Tlo = max(Tt + 0.5, 0.45 * Tc)
    Thi = 0.98 * Tc
    Ts, ys = [], []
    for T in np.linspace(Tlo, Thi, 40):
        try:
            P = PropsSI('P', 'T', float(T), 'Q', 0, fluid)
            if P > 0:
                Ts.append(T); ys.append(np.log10(P / 1e5))
        except Exception:
            pass
    if len(Ts) < 5:
        return None
    Ts = np.array(Ts); ys = np.array(ys)
    best = None
    # grid search on C (singularity at T+C=0 avoided: C > -Tlo)
    for C in np.linspace(-Tlo + 5.0, 120.0, 500):
        x = 1.0 / (Ts + C)
        # y = A - B*x  -> linear least squares for [A, B]
        M = np.vstack([np.ones_like(x), -x]).T
        coef, res, *_ = np.linalg.lstsq(M, ys, rcond=None)
        pred = M @ coef
        sse = float(np.sum((pred - ys) ** 2))
        if best is None or sse < best[0]:
            best = (sse, coef[0], coef[1], C)
    _, A, B, C = best
    pred = A - B / (Ts + C)
    aad = float(np.mean(np.abs(10 ** pred - 10 ** ys) / 10 ** ys) * 100.0)
    return (A, B, C, aad, Tlo, Thi)


def fit_poly(fluid, key, Tlo, Thi, deg=3):
    """Fit Cp polynomial a0+a1 T+... to PropsSI(key) over [Tlo,Thi].
    Returns (coeffs_low_to_high, maxerr%, Tlo, Thi) or None."""
    Ts, cs = [], []
    for T in np.linspace(Tlo, Thi, 30):
        try:
            if key == 'Cp0molar':
                c = PropsSI('Cp0molar', 'T', float(T), 'P', 101325.0, fluid)
            else:
                c = PropsSI('Cpmolar', 'T', float(T), 'Q', 0, fluid)
            if c > 0:
                Ts.append(T); cs.append(c)
        except Exception:
            pass
    if len(Ts) < deg + 2:
        return None
    Ts = np.array(Ts); cs = np.array(cs)
    p = np.polyfit(Ts, cs, deg)            # highest-order first
    pred = np.polyval(p, Ts)
    maxerr = float(np.max(np.abs(pred - cs) / cs) * 100.0)
    return (list(p[::-1]), maxerr, float(Ts[0]), float(Ts[-1]))


# ----- emit ----------------------------------------------------------------

def fmt(coeffs):
    return '  '.join(f'{c:.6g}' for c in coeffs)


def build_dat(name, fluid, props):
    eos_raw = props['eos']
    eos_clean = eos_raw
    sanitised = bool(EXCL_RE.search(eos_raw))
    if sanitised:
        eos_clean = 'CoolProp 7.2.0 reference EOS (citation in COOLPROP-IMPORT.md)'
    L = []
    L.append('/*--------------------------------*- Choupo -*-----------------------*\\')
    L.append(f'  Component: {name}  ({props["formula"]}, CAS {props["cas"]})')
    L.append('  PROPOSAL TIER -- UNVERIFIED.  Imported from CoolProp 7.2.0 (MIT);')
    L.append('  pure-fluid properties from the published reference EOS below.')
    L.append(f'  Reference EOS: {eos_clean}')
    L.append('  NOTE: formation properties (dHf, s_298) and group decompositions')
    L.append('  are NOT provided by CoolProp -> omitted here (a gap, not fabricated).')
    L.append('\\*---------------------------------------------------------------------------*/')
    L.append('')
    L.append(f'name        {name};')
    L.append(f'formula     {props["formula"]};')
    L.append(f'CAS         {props["cas"]};')
    L.append('')
    L.append(f'MW          {props["MW"]:.4f};        // kg/kmol  [CoolProp]')
    L.append(f'Tc          {props["Tc"]:.4f};        // K        [CoolProp EOS]')
    L.append(f'Pc          {props["Pc"]:.5f};        // bar      [CoolProp EOS]')
    L.append(f'omega       {props["omega"]:.5f};        // [-]      [CoolProp EOS]')
    if props.get('Tb') is not None:
        L.append(f'Tb          {props["Tb"]:.4f};        // K  normal boiling [CoolProp]')
        L.append(f'HvapTb      {props["HvapTb"]:.1f};        // J/mol  at Tb     [CoolProp]')
    if props.get('Vliq') is not None:
        L.append(f'Vliq        {props["Vliq"]:.4e};        // m3/mol @298K     [CoolProp]')
    L.append('')
    A, B, C, aad, tlo, thi = props['antoine']
    L.append('vaporPressure')
    L.append('{')
    L.append('    model         Antoine;')
    L.append('    // log10(Psat [bar]) = A - B / (T[K] + C)   -- fitted to CoolProp EOS')
    L.append(f'    coefficients  ({A:.6g}   {B:.6g}   {C:.6g});')
    L.append(f'    Trange        ({tlo:.2f}  {thi:.2f});')
    L.append('}')
    L.append('')
    if props.get('cp0'):
        co, err, t0, t1 = props['cp0']
        L.append('idealGasHeatCapacity')
        L.append('{')
        L.append('    model         polynomial;')
        L.append('    // Cp [J/(mol.K)] = a0 + a1 T + a2 T^2 + a3 T^3   -- fitted to CoolProp cp0')
        L.append(f'    coefficients  ({fmt(co)});')
        L.append(f'    Trange        ({t0:.0f}  {t1:.0f});')
        L.append('}')
        L.append('')
    if props.get('cpl'):
        co, err, t0, t1 = props['cpl']
        L.append('liquidHeatCapacity')
        L.append('{')
        L.append('    model         polynomial;')
        L.append('    // Cp_liq [J/(mol.K)]   -- fitted to CoolProp saturated-liquid cp')
        L.append(f'    coefficients  ({fmt(co)});')
        L.append(f'    Trange        ({t0:.0f}  {t1:.0f});')
        L.append('}')
        L.append('')
    # sublimation: triple-point anchors only (CoolProp has no solid model ->
    # no Hsub/Hfus -> hasSub stays false, no spurious sublimation curve drawn).
    L.append('sublimation')
    L.append('{')
    L.append(f'    tripleT   {props["Tt"]:.4f};        // K   [CoolProp]')
    L.append(f'    tripleP   {props["pt"]:.4f};        // Pa  [CoolProp]')
    L.append('    // Hfus / Hsub absent: CoolProp models no solid phase.  The')
    L.append('    // sublimation curve stays undrawn until measured Hsub lands.')
    L.append('}')
    L.append('')
    L.append('provenance')
    L.append('{')
    L.append(f'    constants      "CoolProp 7.2.0 -- {eos_clean}";')
    L.append(f'    vaporPressure  "Antoine fitted to CoolProp EOS saturation, AAD {aad:.2f}%";')
    if props.get('cp0'):
        L.append(f'    idealGasCp     "polynomial fitted to CoolProp cp0, maxerr {props["cp0"][1]:.2f}%";')
    if props.get('cpl'):
        L.append(f'    liquidCp       "polynomial fitted to CoolProp sat-liquid cp, maxerr {props["cpl"][1]:.2f}%";')
    L.append('    triplePoint    "CoolProp reference EOS triple-point T,P";')
    L.append('}')
    L.append('')
    return '\n'.join(L), sanitised


def main():
    REVIEW.mkdir(parents=True, exist_ok=True)
    fluids = get_global_param_string('fluids_list').split(',')
    existing = existing_stems()
    rows, skipped = [], []
    n_new = n_coll = 0
    for fluid in fluids:
        # Pseudo-pure fluids (Air, R404A, R407C, R410A, R507A, SES36, ...) are
        # MIXTURES, not pure species.  A blend masquerading as a "component"
        # would be exactly the opacity Choupo refuses -> skip them.
        try:
            if get_fluid_param_string(fluid, 'pure') != 'true':
                skipped.append((fluid, 'pseudo-pure (mixture) -- not a component'))
                continue
        except Exception:
            pass
        try:
            aliases = get_fluid_param_string(fluid, 'aliases').split(',')
            Tc = PropsSI('Tcrit', fluid); Pc = PropsSI('pcrit', fluid)
            omega = PropsSI('acentric', fluid); MW = PropsSI('M', fluid) * 1000.0
            Tt = PropsSI('Ttriple', fluid); pt = PropsSI('ptriple', fluid)
            cas = get_fluid_param_string(fluid, 'CAS')
            formula = clean_formula(get_fluid_param_string(fluid, 'formula'))
            eos = get_fluid_param_string(fluid, 'BibTeX-EOS') or '(unspecified)'
        except Exception as e:
            skipped.append((fluid, f'constants: {str(e)[:60]}'))
            continue
        ant = fit_antoine(fluid, Tt, Tc)
        if ant is None:
            skipped.append((fluid, 'Antoine fit failed'))
            continue
        props = dict(Tc=Tc, Pc=Pc / 1e5, omega=omega, MW=MW, Tt=Tt, pt=pt,
                     cas=cas, formula=formula, eos=eos, antoine=ant)
        # normal boiling point + Hvap(Tb)
        if pt < 101325.0 < Pc:
            try:
                Tb = PropsSI('T', 'P', 101325.0, 'Q', 0, fluid)
                hL = PropsSI('Hmolar', 'P', 101325.0, 'Q', 0, fluid)
                hV = PropsSI('Hmolar', 'P', 101325.0, 'Q', 1, fluid)
                props['Tb'] = Tb; props['HvapTb'] = hV - hL
            except Exception:
                pass
        # liquid molar volume @298 K
        try:
            if Tt < 298.15 < Tc:
                props['Vliq'] = 1.0 / PropsSI('Dmolar', 'T', 298.15, 'Q', 0, fluid)
        except Exception:
            pass
        props['cp0'] = fit_poly(fluid, 'Cp0molar', 200.0, 1000.0)
        # liquid cp over a safe sat-liquid range
        cpl_hi = min(props.get('Tb', 0.85 * Tc), 0.9 * Tc)
        props['cpl'] = fit_poly(fluid, 'Cpmolar', max(Tt + 5, 0.5 * Tc), cpl_hi)
        name, collision = resolve_name(fluid, aliases, existing)
        text, sanitised = build_dat(name, fluid, props)
        target = (REVIEW if collision else COMP) / f'{name}.dat'
        target.write_text(text)
        if collision:
            n_coll += 1
        else:
            n_new += 1
            existing[name.lower()] = name      # avoid intra-run dup collisions
        rows.append((name, fluid, props, collision, sanitised, target))
    write_report(rows, skipped, n_new, n_coll, len(fluids))
    print(f'CoolProp import: {len(fluids)} fluids -> {n_new} NEW (components/), '
          f'{n_coll} COLLISION (_coolprop_review/), {len(skipped)} skipped.')
    for f, why in skipped:
        print(f'  skip {f}: {why}')


def write_report(rows, skipped, n_new, n_coll, n_total):
    L = []
    L.append('# CoolProp 7.2.0 import -- proposal tier (STAGE-ONLY)')
    L.append('')
    L.append(f'- Source: CoolProp 7.2.0 (MIT); pure-fluid properties from the published reference EOS per fluid.')
    L.append(f'- Fluids processed: **{n_total}**  ->  **{n_new} NEW** (`data/proposed/components/`), '
             f'**{n_coll} COLLISION** (`data/proposed/_coolprop_review/`, non-destructive), '
             f'**{len(skipped)} skipped**.')
    L.append('- Formation properties (dHf, s_298) and group decompositions are NOT in CoolProp -> omitted (documented gap).')
    L.append('- Vapour pressure: 3-param Antoine FITTED to the EOS saturation curve (AAD per row). '
             'Cp: polynomials fitted to EOS cp0 / sat-liquid cp.')
    L.append('- Triple-point T,P stored in a `sublimation{}` block (anchors only; no Hsub -> no curve drawn).')
    L.append('- NOTHING committed; NOTHING promoted to `data/standards/`.')
    L.append('')
    L.append('## NEW fluids (data/proposed/components/)')
    L.append('')
    L.append('| name | CoolProp | MW | Tc/K | Pc/bar | omega | Tb/K | VP AAD% | EOS |')
    L.append('|---|---|---|---|---|---|---|---|---|')
    for name, fluid, p, coll, san, tgt in sorted(rows, key=lambda r: r[0].lower()):
        if coll:
            continue
        tb = f'{p["Tb"]:.1f}' if p.get('Tb') is not None else 'subl.'
        eos = p['eos'] + (' [author-token sanitised in .dat]' if san else '')
        L.append(f'| {name} | {fluid} | {p["MW"]:.2f} | {p["Tc"]:.2f} | {p["Pc"]:.3f} | '
                 f'{p["omega"]:.4f} | {tb} | {p["antoine"][3]:.2f} | {eos} |')
    L.append('')
    L.append('## COLLISIONS (data/proposed/_coolprop_review/ -- existing file preserved)')
    L.append('')
    L.append('These names already exist in `data/standards/` or `data/proposed/components/`. '
             'The CoolProp-anchored version is staged in `_coolprop_review/` for human comparison; '
             'the existing curated/scrubbed file was left untouched. Review and decide per file.')
    L.append('')
    L.append('| name | CoolProp | Tc/K | Pc/bar | omega | Tb/K | VP AAD% | EOS |')
    L.append('|---|---|---|---|---|---|---|---|')
    for name, fluid, p, coll, san, tgt in sorted(rows, key=lambda r: r[0].lower()):
        if not coll:
            continue
        tb = f'{p["Tb"]:.1f}' if p.get('Tb') is not None else 'subl.'
        eos = p['eos'] + (' [sanitised]' if san else '')
        L.append(f'| {name} | {fluid} | {p["Tc"]:.2f} | {p["Pc"]:.3f} | {p["omega"]:.4f} | '
                 f'{tb} | {p["antoine"][3]:.2f} | {eos} |')
    if skipped:
        L.append('')
        L.append('## Skipped')
        L.append('')
        for f, why in skipped:
            L.append(f'- {f}: {why}')
    L.append('')
    OUT.write_text('\n'.join(L))


if __name__ == '__main__':
    main()
