#!/usr/bin/env python3
# SUPERSEDED 2026-06-30: the monolith this importer emitted was consolidated into
# the per-file Aspen layout (electrolyte/<file>.dat is GONE -> parameters/electrolyte/
# and data/standards/chemistry/, single-source). The live tier is per-file; the
# monolith->per-file migration is done by the gen_*.py scripts + guarded by the
# check_*.py scripts. To re-import from PHREEQC, update this script to emit per-file
# records directly (as written it regenerates the now-deleted monolith).

# parse_mixing.py — deterministic import of the Pitzer TERNARY mixing parameters
# (theta_cc'/theta_aa' for like-sign ion pairs, psi_cc'a/psi_caa' for triplets)
# from USGS PHREEQC pitzer.dat (public domain) into the Choupo electrolyte
# catalogue.  Style precedent: parse_speciation.py (deterministic, fail-loud,
# spot-checked).  (The older parse_pitzer.py is the ad-hoc binary-virial -> TSV
# importer; this is its ternary-mixing sibling, emitting the .dat directly.)
#
# Produces:
#   data/standards/electrolyte/mixing.dat   (-THETA + -PSI rows, core system)
#
# Decisions (documented, do not silently change):
#   * SCOPE = the core HMW seawater/brine system PLUS the carbonate subsystem
#     (slice S4):
#       cations  Na K Ca Mg H        anions  Cl SO4 OH CO3 HCO3
#       neutrals CO2aq  (the dissolved-CO2 lambda partner)
#     Any THETA/PSI row that references an ion OUTSIDE this set (borate,
#     H4SiO4, Br, Fe, Mn, Li, Sr, Ba, HSO4, ...) is DROPPED.  Dropped rows are
#     REPORTED (count), never silently skipped past a parse error.
#   * S4 adds the NEUTRAL interactions: lambda_n,ion (neutral CO2aq with each
#     core ion) from the -LAMBDA block, and zeta_n,c,a (neutral-cation-anion
#     triplet) from the -ZETA block.  These give the CO2-solubility salting-out
#     in brine (the He & Morse / Pitzer-Peiper-Busey CO2-brine set, as the
#     pitzer.dat -LAMBDA listing attributes per row).
#   * theta is the LIKE-SIGN ion-pair (constant) term; psi the TRIPLET (two
#     like-sign + one opposite).  We import only the 25 C base value (the first
#     numeric column); the file's extra T,P columns are deferred (the same
#     decision pairs.dat made for beta0/beta1) — dtheta_dT/dpsi_dT slots stay
#     reserved (absence-tolerant), values pending a calorimetric fit.
#   * PRIMARY citation per value: Harvie, Moller & Weare, Geochim. Cosmochim.
#     Acta 48 (1984) 723 (the seawater-system ternary assembly); the Pitzer
#     FORM is Pitzer (1991), Activity Coefficients in Electrolyte Solutions,
#     2nd ed., ch. 3.  The pitzer.dat channel is USGS/Appelo (public domain).
#   * FAIL LOUDLY on any unparseable -THETA/-PSI line (never silently skip a
#     block we cannot read); spot-check anchors FAIL the run on mismatch.

import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# Prefer the locally-installed PHREEQC pitzer.dat (the richer mixing source);
# it is the same USGS/Appelo public-domain channel pairs.dat came from.
REF_CANDIDATES = [
    Path('/usr/local/share/doc/phreeqc/database/pitzer.dat'),
    ROOT / 'bin/curate/refs/pitzer.dat',
]
REF = next((p for p in REF_CANDIDATES if p.exists()), None)
if REF is None:
    sys.exit('FAIL: no pitzer.dat source found.  Looked in:\n  '
             + '\n  '.join(str(p) for p in REF_CANDIDATES)
             + '\nInstall PHREEQC (public-domain pitzer.dat) or drop a copy in '
               'bin/curate/refs/ before running.')

OUT = ROOT / 'data/standards/electrolyte/mixing.dat'

# The PHREEQC formula -> Choupo ions.dat key map, RESTRICTED to the v1 core
# system.  A row touching any ion not in this map is DROPPED (out of scope).
CORE = {
    'Na+':   'Na', 'K+':   'K', 'Ca+2': 'Ca', 'Mg+2': 'Mg', 'H+':  'H',   # cations
    'Cl-':   'Cl', 'SO4-2': 'SO4', 'OH-': 'OH',                            # anions
    'CO3-2': 'CO3', 'HCO3-': 'HCO3',                                # carbonate (S4)
}
CATIONS = {'Na', 'K', 'Ca', 'Mg', 'H'}
ANIONS  = {'Cl', 'SO4', 'OH', 'CO3', 'HCO3'}

# NEUTRAL species (z == 0) that carry lambda/zeta interactions (slice S4).
# The PHREEQC formula 'CO2' maps to the Choupo speciation species KEY 'CO2aq'
# (the dict-safe key the solver names the dissolved-CO2 complex with -- this is
# what PitzerHMW matches `st.name` against for the lambda neutral term).
NEUTRALS = {
    'CO2':   'CO2aq',
}

SRC = ('Harvie, Moller & Weare, Geochim. Cosmochim. Acta 48 (1984) 723 '
       '(HMW seawater system); via USGS PHREEQC pitzer.dat (public domain)')
SRC_LAMBDA = ('CO2-brine lambda set: Pitzer, Peiper & Busey (1984) + He & Morse '
              '(1993) as attributed in the pitzer.dat -LAMBDA listing; '
              'via USGS PHREEQC pitzer.dat (public domain)')


def charge_sign(key):
    if key in CATIONS: return +1
    if key in ANIONS:  return -1
    sys.exit(f'FAIL: ion {key!r} is neither a known cation nor anion')


def first_float(tokens, line):
    """The 25 C base value = the first numeric token after the ion labels.
    FAIL LOUDLY if it is not parseable (never skip a block we cannot read)."""
    try:
        return float(tokens[0])
    except (IndexError, ValueError):
        sys.exit(f'FAIL: cannot read a numeric value in -block line: {line!r}')


# --- read the PITZER section, split into its -B0/.../-THETA/-PSI blocks --------
raw = REF.read_text(encoding='latin-1').splitlines()

# locate the PITZER section (a col-0 keyword) and its end (next col-0 keyword)
start = None
for i, ln in enumerate(raw):
    if ln.strip() == 'PITZER' and ln[:1] not in ' \t':
        start = i + 1; break
if start is None:
    sys.exit('FAIL: no PITZER section in ' + str(REF))
end = len(raw)
for i in range(start, len(raw)):
    s = raw[i].strip()
    if s and raw[i][:1] not in ' \t' and re.fullmatch(r'[A-Z][A-Z_0-9]*', s):
        end = i; break

# group lines under their -SUBKEY (-B0, -THETA, -PSI, ...)
blocks, cur = {}, None
for ln in raw[start:end]:
    s = ln.strip()
    if not s or s.startswith('#'):
        continue
    m = re.match(r'^-([A-Za-z0-9]+)\s*$', s)
    if m:
        cur = m.group(1).upper(); blocks.setdefault(cur, []); continue
    if cur is not None:
        blocks[cur].append(ln)

if 'THETA' not in blocks or 'PSI' not in blocks:
    sys.exit('FAIL: PITZER section lacks a -THETA or -PSI block in ' + str(REF))


# --- parse -THETA (like-sign ion pairs) ---------------------------------------
theta_rows, dropped_theta = [], []
for ln in blocks['THETA']:
    code = re.split(r'#', ln)[0]
    t = code.split()
    if len(t) < 3:
        continue                                   # blank / stray line
    i, j = t[0], t[1]
    if i not in CORE or j not in CORE:
        dropped_theta.append((i, j)); continue
    a, b = CORE[i], CORE[j]
    si, sj = charge_sign(a), charge_sign(b)
    if si != sj:
        # THETA is defined for like-sign pairs only; a mixed-sign entry would be
        # a data error (PHREEQC never tabulates one) — refuse loudly.
        sys.exit(f'FAIL: -THETA row {i} {j} is a mixed-sign pair (theta is '
                 f'like-sign only): {ln!r}')
    val = first_float(t[2:], ln)
    # canonical ORDER (deterministic): both alphabetical within the like-sign set
    a, b = sorted((a, b))
    theta_rows.append((a, b, val))

# de-dup (keep first; the file has no dups in the core set, but be safe + loud)
seen = {}
for a, b, v in theta_rows:
    if (a, b) in seen and abs(seen[(a, b)] - v) > 1e-12:
        sys.exit(f'FAIL: conflicting -THETA values for ({a},{b})')
    seen[(a, b)] = v
theta_rows = sorted(seen.items())                  # ((a,b), v) sorted


# --- parse -PSI (triplets: two like-sign + one opposite) ----------------------
psi_rows, dropped_psi = [], []
for ln in blocks['PSI']:
    code = re.split(r'#', ln)[0]
    t = code.split()
    if len(t) < 4:
        continue
    i, j, k = t[0], t[1], t[2]
    if i not in CORE or j not in CORE or k not in CORE:
        dropped_psi.append((i, j, k)); continue
    ions = [CORE[i], CORE[j], CORE[k]]
    signs = [charge_sign(x) for x in ions]
    npos = signs.count(+1)
    # a valid psi triplet is c-c-a (two cations + one anion) or c-a-a; classify
    # so we store it as (a, b, c) with a,b the LIKE-SIGN pair and c the odd ion.
    if npos == 2:        # two cations + one anion
        cc = sorted(ions[m] for m in range(3) if signs[m] == +1)
        odd = next(ions[m] for m in range(3) if signs[m] == -1)
    elif npos == 1:      # one cation + two anions
        cc = sorted(ions[m] for m in range(3) if signs[m] == -1)
        odd = next(ions[m] for m in range(3) if signs[m] == +1)
    else:
        sys.exit(f'FAIL: -PSI triplet {i} {j} {k} is not 2-like + 1-opposite '
                 f'(npos={npos}): {ln!r}')
    val = first_float(t[3:], ln)
    psi_rows.append((cc[0], cc[1], odd, val))

seen = {}
for a, b, c, v in psi_rows:
    key = (a, b, c)
    if key in seen and abs(seen[key] - v) > 1e-12:
        sys.exit(f'FAIL: conflicting -PSI values for ({a},{b},{c})')
    seen[key] = v
psi_rows = sorted((k[0], k[1], k[2], v) for k, v in seen.items())


# --- parse -LAMBDA (neutral-ion interactions: a NEUTRAL n + one ION) -----------
# The -LAMBDA block lists rows "<species1> <species2> <value> [T P ...]" where
# exactly one of the two species is a NEUTRAL (in NEUTRALS) and the other is a
# core ION (in CORE).  The 25 C base value is the first numeric token; the file's
# extra T/P columns (e.g. the high-P CO2-CO2 self term) are DEFERRED, exactly as
# the beta T-slots were.  We keep ONLY (neutral, core-ion) rows; the neutral-self
# (CO2-CO2) and any neutral-pairing-an-out-of-scope-ion row is DROPPED + reported.
lambda_rows, dropped_lambda = [], []
for ln in blocks.get('LAMBDA', []):
    code = re.split(r'#', ln)[0]
    t = code.split()
    if len(t) < 3:
        continue
    i, j = t[0], t[1]
    i_neu, j_neu = i in NEUTRALS, j in NEUTRALS
    if i_neu and j_neu:
        dropped_lambda.append((i, j)); continue          # neutral-self (CO2-CO2)
    if not (i_neu or j_neu):
        dropped_lambda.append((i, j)); continue          # no neutral -> not lambda
    neu_raw, ion_raw = (i, j) if i_neu else (j, i)
    if ion_raw not in CORE:
        dropped_lambda.append((i, j)); continue          # out-of-scope partner
    n   = NEUTRALS[neu_raw]
    ion = CORE[ion_raw]
    val = first_float(t[2:], ln)
    lambda_rows.append((n, ion, val))

seen = {}
for n, ion, v in lambda_rows:
    if (n, ion) in seen and abs(seen[(n, ion)] - v) > 1e-12:
        sys.exit(f'FAIL: conflicting -LAMBDA values for ({n},{ion})')
    seen[(n, ion)] = v
lambda_rows = sorted((k[0], k[1], v) for k, v in seen.items())


# --- parse -ZETA (neutral-cation-anion triplets: NEUTRAL n + cation + anion) ---
# Rows "<s1> <s2> <s3> <value>"; exactly one is a NEUTRAL, the other two an
# (opposite-sign) ion pair.  Stored canonically as (n, cation, anion).
zeta_rows, dropped_zeta = [], []
for ln in blocks.get('ZETA', []):
    code = re.split(r'#', ln)[0]
    t = code.split()
    if len(t) < 4:
        continue
    sp = t[0], t[1], t[2]
    neus = [s for s in sp if s in NEUTRALS]
    if len(neus) != 1:
        dropped_zeta.append(sp); continue                # not a 1-neutral triplet
    ions_raw = [s for s in sp if s not in NEUTRALS]
    if any(s not in CORE for s in ions_raw):
        dropped_zeta.append(sp); continue                # out-of-scope partner
    n = NEUTRALS[neus[0]]
    ions = [CORE[s] for s in ions_raw]
    signs = [charge_sign(x) for x in ions]
    if sorted(signs) != [-1, +1]:
        sys.exit(f'FAIL: -ZETA triplet {sp} is not neutral+cation+anion: {ln!r}')
    cation = next(ions[k] for k in range(2) if signs[k] == +1)
    anion  = next(ions[k] for k in range(2) if signs[k] == -1)
    val = first_float(t[3:], ln)
    zeta_rows.append((n, cation, anion, val))

seen = {}
for n, c, a, v in zeta_rows:
    key = (n, c, a)
    if key in seen and abs(seen[key] - v) > 1e-12:
        sys.exit(f'FAIL: conflicting -ZETA values for ({n},{c},{a})')
    seen[key] = v
zeta_rows = sorted((k[0], k[1], k[2], v) for k, v in seen.items())


def num(v):
    s = f'{v:.6g}'
    return '0' if s in ('-0', '') else s


# --- emit mixing.dat (deterministic: sorted, fixed formatting) ----------------
HDR = """/*---------------------------------------------------------------------------*\\
  Choupo electrolyte catalogue --- PITZER TERNARY MIXING parameters (25 C base).

  Generated by bin/curate/parse_mixing.py from {ref}
  (USGS PHREEQC pitzer.dat, public domain).  Do not hand-edit values --- re-run
  the script (it is deterministic: re-running gives a byte-identical file).

  THE TERMS (Pitzer 1991, ch. 3; Harvie, Moller & Weare 1984):
    * theta_ij  : the LIKE-SIGN ion-pair mixing parameter (cation-cation OR
                  anion-anion).  Enters Phi_ij = theta_ij (+ the E_theta(I)
                  higher-order electrostatic term, DEFERRED in v1 --- the
                  constant-theta approximation, ANNOUNCED at run time).
    * psi_ijk   : the TRIPLET parameter (two like-sign ions i,j + one
                  opposite-sign ion k).  Enters the cation/anion sums and the
                  sum_{{i<j}} m_i m_j psi_ijk cross term.

    * lambda_n,ion : the NEUTRAL-ion interaction (a neutral solute n with an
                  ion).  Enters ln gamma_n += sum_ion 2 m_ion lambda_n,ion (the
                  CO2-brine salting-out) and the ion's own ln gamma += 2 m_n
                  lambda_n,ion.  (slice S4)
    * zeta_n,c,a : the NEUTRAL-cation-anion triplet.  Enters ln gamma_n +=
                  sum_c sum_a m_c m_a zeta_n,c,a (and the symmetric ion legs).
                  (slice S4)

  Each entry is kind-discriminated:
    {{ kind theta;  a <ion>; b <ion>;          theta  <v>; source "..."; }}
    {{ kind psi;    a <ion>; b <ion>; c <ion>; psi    <v>; source "..."; }}
    {{ kind lambda; n <neutral>; ion <ion>;    lambda <v>; source "..."; }}
    {{ kind zeta;   n <neutral>; c <cation>; a <anion>; zeta <v>; source "..."; }}
  For a psi row, (a,b) is the LIKE-SIGN pair and c the opposite-sign ion; for a
  lambda/zeta row n is the NEUTRAL species KEY (e.g. CO2aq).  Absence-tolerant
  T-dependence slots are RESERVED (deferred, as the pairs.dat beta T-slots were).

  SCOPE: the core HMW seawater/brine system PLUS the carbonate subsystem (S4) ---
    cations  Na K Ca Mg H     anions  Cl SO4 OH CO3 HCO3     neutrals  CO2aq
  Borate, H4SiO4, HSO4 and the higher neutral system (H2S, ...) remain OUT.

  PRIMARY source per value: {src};
  CO2-brine neutral set: {srclam}.

  Nearest-wins per-ENTRY overlay: a case's constant/electrolyte/mixing.dat
  OVERRIDES individual entries here (same rule as pairs.dat) --- a self-contained
  case carries the entries it uses.
\\*---------------------------------------------------------------------------*/

mixing
(
"""

with open(OUT, 'w') as f:
    f.write(HDR.format(ref=REF, src=SRC, srclam=SRC_LAMBDA))
    f.write('    // -- theta_ij : like-sign ion-pair mixing (cation-cation, '
            'anion-anion) --\n')
    for (a, b), v in theta_rows:
        f.write(f'    {{ kind theta; a {a}; b {b}; theta {num(v)}; '
                f'source "{SRC}"; }}\n')
    f.write('\n    // -- psi_ijk : triplet (two like-sign a,b + one opposite c) '
            '--\n')
    for a, b, c, v in psi_rows:
        f.write(f'    {{ kind psi; a {a}; b {b}; c {c}; psi {num(v)}; '
                f'source "{SRC}"; }}\n')
    f.write('\n    // -- lambda_n,ion : neutral-ion interaction (CO2 salting-out) '
            '--\n')
    for n, ion, v in lambda_rows:
        f.write(f'    {{ kind lambda; n {n}; ion {ion}; lambda {num(v)}; '
                f'source "{SRC_LAMBDA}"; }}\n')
    f.write('\n    // -- zeta_n,c,a : neutral-cation-anion triplet --\n')
    for n, c, a, v in zeta_rows:
        f.write(f'    {{ kind zeta; n {n}; c {c}; a {a}; zeta {num(v)}; '
                f'source "{SRC_LAMBDA}"; }}\n')
    f.write(');\n')

# --- VERIFICATION (FAIL LOUDLY) -----------------------------------------------
print(f'mixing.dat : {len(theta_rows)} theta + {len(psi_rows)} psi + '
      f'{len(lambda_rows)} lambda + {len(zeta_rows)} zeta rows '
      f'(core+carbonate Na/K/Ca/Mg/H | Cl/SO4/OH/CO3/HCO3 | CO2aq)')
print(f'  dropped (out of scope): {len(dropped_theta)} theta, '
      f'{len(dropped_psi)} psi, {len(dropped_lambda)} lambda, '
      f'{len(dropped_zeta)} zeta rows (borate/H4SiO4/HSO4/Br/Fe/CO2-self/.../etc.)')

theta_map  = {(a, b): v for (a, b), v in theta_rows}
psi_map    = {(a, b, c): v for a, b, c, v in psi_rows}
lambda_map = {(n, ion): v for n, ion, v in lambda_rows}
zeta_map   = {(n, c, a): v for n, c, a, v in zeta_rows}

fails = []
def spot(label, got, want, tol=1e-9):
    ok = got is not None and abs(got - want) < tol
    print(f'SPOT {label:30s} got {got!s:>10} | expect {want:>8} '
          f'{"PASS" if ok else "FAIL"}')
    if not ok: fails.append(label)

# Anchors straight from the pitzer.dat -THETA / -PSI listing (HMW 1984):
spot('theta(Ca,Mg) [cc]',   theta_map.get(('Ca', 'Mg')),  0.007)
spot('theta(K,Na)  [cc]',   theta_map.get(('K', 'Na')),  -0.012)
spot('theta(Cl,SO4)[aa]',   theta_map.get(('Cl', 'SO4')),  0.03)
spot('theta(Cl,OH) [aa]',   theta_map.get(('Cl', 'OH')),  -0.05)
spot('psi(Ca,Na,Cl)',       psi_map.get(('Ca', 'Na', 'Cl')), -0.0148)
spot('psi(K,Na,SO4)',       psi_map.get(('K', 'Na', 'SO4')), -0.01)
spot('psi(Cl,SO4,Na)',      psi_map.get(('Cl', 'SO4', 'Na')), 0.0)
spot('psi(Cl,SO4,Mg)',      psi_map.get(('Cl', 'SO4', 'Mg')), -0.008)
# Carbonate anchors (S4) -- straight from the -THETA / -PSI listing:
spot('theta(CO3,HCO3)[aa]', theta_map.get(('CO3', 'HCO3')), -0.04)
spot('theta(CO3,OH) [aa]',  theta_map.get(('CO3', 'OH')),  0.1)
spot('theta(CO3,SO4)[aa]',  theta_map.get(('CO3', 'SO4')), 0.02)
spot('theta(Cl,CO3) [aa]',  theta_map.get(('CO3', 'Cl')), -0.02)
spot('theta(Cl,HCO3)[aa]',  theta_map.get(('Cl', 'HCO3')), 0.03)
spot('psi(CO3,HCO3,Na)',    psi_map.get(('CO3', 'HCO3', 'Na')), 0.002)
spot('psi(Cl,HCO3,Mg)',     psi_map.get(('Cl', 'HCO3', 'Mg')), -0.096)
# Lambda anchors (S4) -- the CO2-brine -LAMBDA listing:
spot('lambda(CO2aq,Na)',    lambda_map.get(('CO2aq', 'Na')),  0.085)
spot('lambda(CO2aq,Cl)',    lambda_map.get(('CO2aq', 'Cl')), -0.005)
spot('lambda(CO2aq,Ca)',    lambda_map.get(('CO2aq', 'Ca')),  0.183)
spot('lambda(CO2aq,SO4)',   lambda_map.get(('CO2aq', 'SO4')), 0.075)
# Zeta anchor (S4):
spot('zeta(CO2aq,Na,SO4)',  zeta_map.get(('CO2aq', 'Na', 'SO4')), -0.015)

# scope guard: NO out-of-system ION leaked through (neutrals are allowed keys)
allowed = set(CORE.values()) | set(NEUTRALS.values())
leaked  = [k for row in theta_map  for k in row     if k not in allowed]
leaked += [k for row in psi_map    for k in row     if k not in allowed]
leaked += [k for row in lambda_map for k in row     if k not in allowed]
leaked += [k for row in zeta_map   for k in row     if k not in allowed]
if leaked:
    print(f'GUARD scope leak: {sorted(set(leaked))} FAIL'); fails.append('scope')
else:
    print('GUARD no out-of-system ion leaked PASS')

if fails:
    sys.exit('\nFAIL LOUDLY: ' + '; '.join(fails))
print('\nALL CHECKS PASS')
