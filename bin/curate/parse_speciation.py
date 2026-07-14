#!/usr/bin/env python3
# SUPERSEDED 2026-06-30: the monolith this importer emitted was consolidated into
# the per-file Aspen layout (electrolyte/<file>.dat is GONE -> parameters/electrolyte/
# and data/standards/chemistry/, single-source). The live tier is per-file; the
# monolith->per-file migration is done by the gen_*.py scripts + guarded by the
# check_*.py scripts. To re-import from PHREEQC, update this script to emit per-file
# records directly (as written it regenerates the now-deleted monolith).

# parse_speciation.py — deterministic import of aqueous speciation + scaling
# minerals from USGS PHREEQC phreeqc.dat (public domain) into the Choupo
# electrolyte catalogue.  Style precedent: parse_pitzer.py.
#
# Produces:
#   data/standards/electrolyte/speciation.dat   (SOLUTION_SPECIES associations)
#   data/standards/electrolyte/minerals.dat     (PHASES dissolution equilibria)
#
# Decisions (documented, do not silently change):
#   * CARBONATE MASTER = HCO3- (the measured alkalinity carrier).  All logK/dH
#     converted from the db's CO3-2 basis via CO3-2 + H+ = HCO3-.
#   * PHREEQC -delta_h default unit is kJ/mol (NOT kcal) — verified against the
#     db's own -analytic expressions (Kw: 56.4 unmarked = 56.4 kJ = 13.5 kcal).
#     'kcal'-marked entries are converted at 4.184 J/cal.  dH emitted in J/mol,
#     omitted when any leg of a chained reaction lacks a value.
#   * EXCLUDED: every redox / e- couple (equilibrium speciation only), the
#     Pitzer activity-correction dimers (CO2)2/(H2S)2, commented-out reactions,
#     and any species outside the scaling-relevant master set.
#   * Spot-check anchors FAIL the run loudly on mismatch.

import re, sys, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REF  = ROOT / 'bin/curate/refs/phreeqc.dat'
IONS = ROOT / 'data/standards/electrolyte/ions.dat'
OUT_SPEC = ROOT / 'data/standards/electrolyte/speciation.dat'
OUT_MIN  = ROOT / 'data/standards/electrolyte/minerals.dat'
OUT_EXCH = ROOT / 'data/standards/electrolyte/exchange.dat'

SRC = 'USGS PHREEQC phreeqc.dat (public domain)'
CAL = 4.184          # J/cal

# Scaling-relevant master set: PHREEQC formula -> ions.dat key.
# (HCO3- replaces the db's CO3-2 master after the basis swap below.)
MASTERS = {'H+':'H', 'Ca+2':'Ca', 'Mg+2':'Mg', 'Na+':'Na', 'K+':'K',
           'Ba+2':'Ba', 'Sr+2':'Sr', 'Cl-':'Cl', 'SO4-2':'SO4',
           'HCO3-':'HCO3', 'F-':'F', 'H4SiO4':'H4SiO4'}

# Cation-exchange (ion-exchange softener) target set: PHREEQC EXCHANGE_SPECIES
# half-reactions  Me(z+) + z X- = MeX(z)  over the exchangeable cations that
# the scaling-relevant master set already carries.  Gaines-Thomas convention
# (the exchanger activity of a species is its EQUIVALENT FRACTION).  NaX is the
# reference (logK 0).  PHREEQC's -gamma activity-coefficient slots are NOT
# imported (Choupo uses the equivalent-fraction activity, not a Davies on the
# bound species).  X- is a pseudo-species declared in exchange.dat itself, NOT
# an ion in ions.dat (NaX/CaX2 are not aqueous ions either).
EXCH_CATIONS = {'Na+':'Na', 'K+':'K', 'Ca+2':'Ca', 'Mg+2':'Mg',
                'Sr+2':'Sr', 'Ba+2':'Ba'}

# Scaling minerals ONLY (task scope).  Brucite is requested but ABSENT from
# phreeqc.dat (it lives in pitzer.dat / wateq4f) — reported, not imported.
TARGET_PHASES = ['Calcite', 'Aragonite', 'Gypsum', 'Anhydrite', 'Celestite',
                 'Barite', 'Fluorite', 'Halite', 'Sylvite', 'Brucite',
                 'SiO2(a)', 'Chalcedony']
PHASE_KEY = {'SiO2(a)': 'SiO2a'}   # default: lowercase the db name

def ascii_clean(s):
    s = s.replace('\xb0', ' ')   # degree sign -> space ("300 C")
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', s).strip()

def charge_of(sp):
    m = re.search(r'([+-])(\d*)$', sp)
    if not m: return 0
    return (1 if m.group(1) == '+' else -1) * (int(m.group(2)) if m.group(2) else 1)

def parse_terms(side):
    """' 2 H+ + CO3-2 ' -> [(2.0,'H+'), (1.0,'CO3-2')]"""
    out = []
    for term in re.split(r'\s+\+\s+', side.strip()):
        m = re.match(r'^(\d+(?:\.\d+)?)\s+(.+)$', term)
        out.append((float(m.group(1)), m.group(2).strip()) if m
                   else (1.0, term.strip()))
    return out

# --- read db (latin-1 byte-safe), split into sections ------------------------
lines = REF.read_text(encoding='latin-1').splitlines()

sections, cur = {}, None
for ln in lines:
    if re.fullmatch(r'[A-Z][A-Z_0-9]*', ln.strip()) and ln[:1] not in ' \t':
        cur = ln.strip(); sections.setdefault(cur, []); continue
    if cur: sections[cur].append(ln)

# --- db master species (identity basis of the db) ----------------------------
db_masters = {'H2O', 'e-'}
for ln in sections['SOLUTION_MASTER_SPECIES']:
    p = re.split(r'#', ln)[0].split()
    if len(p) >= 3 and re.match(r'^[A-Za-z]', p[0]): db_masters.add(p[1])

# --- block scanner shared by SOLUTION_SPECIES and PHASES ---------------------
DH_UNIT = {None: 1e3, 'kj': 1e3, 'kjoules': 1e3, 'kcal': CAL * 1e3,
           'cal': CAL, 'j': 1.0, 'joules': 1.0}

def scan_options(block_lines):
    """Extract (logk, dh_J|None, analytic|None, range|None, lit-comments).

    analytic = the PHREEQC log_k(T) coefficient vector A1..A6 (T in K):
        log10 K(T) = A1 + A2*T + A3/T + A4*log10(T) + A5/T^2 + A6*T^2
    returned as a length-6 list (trailing slots padded with 0.0); None when
    the reaction carries no -analytical_expression.  A COMMENTED-OUT
    `#-analytic ...` line is NOT a key=value option (the '#' strips it in
    `body`), so it is correctly ignored.  `range` = the validity range parsed
    out of the analytic line's inline comment ("0 - 300 C"), None if absent.
    """
    logk, dh, analytic, vrange, lit = None, None, None, None, []
    for ln in block_lines:
        cm = re.search(r'#\s*(.+)$', ln)
        body = re.split(r'#', ln)[0]
        keep_comment = False
        for seg in body.split(';'):
            t = seg.split()
            if not t: continue
            key = t[0].lstrip('-').lower()
            if key == 'log_k' and len(t) >= 2:
                logk = float(t[1]); keep_comment = True
            elif key == 'delta_h' and len(t) >= 2:
                unit = re.sub(r'/mol$', '', t[2].lower()) if len(t) >= 3 else None
                dh = float(t[1]) * DH_UNIT[unit]; keep_comment = True
            elif key in ('analytic', 'analytical', 'analytical_expression'):
                # FAIL LOUDLY if a coefficient is not a number (never skip a
                # block we cannot parse): every remaining token must be float.
                coeffs = []
                for tok in t[1:]:
                    try:
                        coeffs.append(float(tok))
                    except ValueError:
                        sys.exit('FAIL: non-numeric analytic coefficient '
                                 f'{tok!r} in line: {ln.strip()!r}')
                if coeffs:
                    analytic = (coeffs + [0.0] * 6)[:6]
                    keep_comment = True
                    if cm:
                        m = re.search(r'(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*'
                                      r'(?:o?\s*)?[Cc]\b', ascii_clean(cm.group(1)))
                        if m: vrange = (float(m.group(1)), float(m.group(2)))
        if cm and keep_comment:
            c = ascii_clean(cm.group(1))
            if c and c not in lit: lit.append(c)
    return logk, dh, analytic, vrange, lit


def lincomb_analytic(acc, leg, coef, sign):
    """Accumulate sign*coef*leg into acc (length-6 vectors), or None-poison.

    Mirrors the dh chaining: if any leg with non-trivial stoichiometry lacks an
    analytic expression, the chained result is unavailable (None).  A db-master
    leg (leg is None but it is an identity with analytic 0) contributes nothing,
    so callers pass leg = [0]*6 for those.  Returns the new accumulator (or None
    once poisoned)."""
    if acc is None or leg is None:
        return None
    return [acc[k] + sign * coef * leg[k] for k in range(6)]

# --- parse SOLUTION_SPECIES ---------------------------------------------------
# Each col-0 line with '=' starts a reaction; defined species = first RHS term.
rxns = []                       # (defined, lhs_terms, rhs_tail, logk, dh, lit)
i, body = 0, sections['SOLUTION_SPECIES']
while i < len(body):
    ln = body[i]
    if ln[:1] in ' \t#' or '=' not in ln or not ln.strip():
        i += 1; continue
    eq = re.split(r'#', ln)[0]
    lhs, rhs = (parse_terms(s) for s in eq.split('=', 1))
    j = i + 1
    while j < len(body) and (body[j][:1] in ' \t' or not body[j].strip()): j += 1
    logk, dh, ana, vr, lit = scan_options(body[i + 1:j])
    rxns.append((rhs[0][1], lhs, rhs[1:], logk, dh, ana, vr, lit))
    i = j

# Resolve every defined species to a composition over db masters, chaining
# through earlier-defined species; sum logK / dH / analytic along the chain.
comp, clogk, cdh, cana, cvr, clit = {}, {}, {}, {}, {}, {}

ZERO6 = [0.0] * 6

def basis(sp):
    # returns (composition, logK, dH, analytic|None, unknown)
    if sp in comp:       return comp[sp], clogk[sp], cdh[sp], cana[sp], False
    if sp in db_masters: return {sp: 1.0}, 0.0, 0.0, ZERO6, False  # identity: ana 0
    return {sp: 1.0}, 0.0, 0.0, None, True       # unknown -> excluded later

excluded = []                                    # (formula, reason)
for defined, lhs, rhs_tail, logk, dh, ana, vr, lit in rxns:
    if len(lhs) == 1 and not rhs_tail and lhs[0][1] == defined:
        continue                                 # identity line (db master)
    if re.fullmatch(r'\(.+\)\d+', defined):
        excluded.append((defined, 'Pitzer activity-correction dimer')); continue
    c, lk, dhh, unknown, dh_ok = {}, 0.0, 0.0, False, dh is not None
    # analytic chaining: this reaction's own analytic (its leg vs the masters)
    # PLUS the analytic of any chained species it forms from.  Seed with this
    # row's analytic (None when absent); poison to None if a chained leg lacks
    # one (a chain is only T-resolved when EVERY leg is).
    ana_chain = list(ana) if ana is not None else None
    for sign, terms in ((+1, lhs), (-1, rhs_tail)):
        for coef, sp in terms:
            b, blk, bdh, bana, unk = basis(sp)
            unknown |= unk
            if sp in comp and cdh[sp] is None: dh_ok = False
            for k, v in b.items(): c[k] = c.get(k, 0.0) + sign * coef * v
            lk  += sign * coef * blk
            dhh += sign * coef * (bdh or 0.0)
            # chained species contribute their own analytic with -1 sense (they
            # appear on the RHS tail of THIS reaction's formation, already in
            # the right sign via `sign`); db masters contribute ZERO6.
            ana_chain = lincomb_analytic(ana_chain, bana, coef, sign)
    if logk is None:
        excluded.append((defined, 'no log_k in db')); continue
    comp[defined]  = {k: v for k, v in c.items() if abs(v) > 1e-12}
    clogk[defined] = lk + logk
    cdh[defined]   = (dhh + dh) if dh_ok else None
    cana[defined]  = ana_chain
    cvr[defined]   = vr
    clit[defined]  = lit

# --- carbonate basis swap: CO3-2 -> HCO3- (formation sense) -------------------
HCO3_LOGK, HCO3_DH = clogk['HCO3-'], cdh['HCO3-']   # CO3-2 + H+ = HCO3-
HCO3_ANA          = cana['HCO3-']                   # its analytic shape (or None)
def swap_to_hco3(c, lk, dh, ana, sense):
    """sense +1 = formation entry (species), -1 = dissolution entry (mineral).

    The analytic vector is swapped the SAME way logK/dH are -- the basis change
    CO3-2 + H+ = HCO3- carries its own T-dependence, so the swapped analytic is
    `ana - sense*n*HCO3_ANA` (poisoned to None if either side lacks one).  The
    runtime uses analytic only as an ANCHORED CORRECTION (logK25 + [ana(T) -
    ana(298.15)]); the absolute offset cancels, only the T-SHAPE in the HCO3
    basis matters -- and this linear swap keeps it exact."""
    n = c.pop('CO3-2', 0.0)
    if not n: return c, lk, dh, ana, False
    c['HCO3-'] = c.get('HCO3-', 0.0) + n
    c['H+']    = c.get('H+', 0.0) - n
    for k in [k for k, v in c.items() if abs(v) < 1e-12]: del c[k]
    lk = lk - sense * n * HCO3_LOGK
    if dh is not None: dh = dh - sense * n * HCO3_DH
    ana = lincomb_analytic(ana, HCO3_ANA, n, -sense)
    return c, lk, dh, ana, True

# --- ions.dat keys (alignment + coverage check) -------------------------------
ion_keys = set(re.findall(r'\{\s*species\s+(\w+);', IONS.read_text()))
missing = sorted(set(MASTERS.values()) - ion_keys)
if missing:
    sys.exit(f'FAIL: master ions missing from ions.dat: {missing} '
             f'(append them before running)')

def key_of(formula, z):
    base = re.sub(r'[+-]\d*$', '', formula).replace('(', '').replace(')', '')
    if base in ion_keys: return base             # reuse ions.dat key (OH, CO3, ...)
    sfx = 'aq' if z == 0 else ('p' if z > 0 else 'm') + ('' if abs(z) == 1 else str(abs(z)))
    return base + sfx

# --- select speciation entries over the master set ----------------------------
allowed = set(MASTERS) | {'H2O'}
species_rows = []   # (key, formula, z, masters, nuWater, logk, dh, analytic, vrange, lit, swapped)
emitted = set()

def emit_species(formula, c, lk, dh, ana, vr, lit, swapped):
    z = charge_of(formula)
    mast = {MASTERS[f]: v for f, v in c.items() if f != 'H2O'}
    nw = c.get('H2O', 0.0)
    species_rows.append((key_of(formula, z), formula, z, mast, nw, lk, dh,
                         ana, vr, lit, swapped))
    emitted.add(formula)

# CO3-2 itself becomes a derived species of the new basis: CO3-2 = HCO3- - H+
# (its analytic is -HCO3_ANA, the inverse of the basis half-reaction).
emit_species('CO3-2', {'HCO3-': 1.0, 'H+': -1.0}, -HCO3_LOGK,
             None if HCO3_DH is None else -HCO3_DH,
             None if HCO3_ANA is None else [-a for a in HCO3_ANA],
             cvr.get('HCO3-'), clit.get('HCO3-', []), True)

for sp in comp:
    if sp == 'HCO3-': continue                   # the master itself
    c, lk, dh, ana, swapped = swap_to_hco3(
        dict(comp[sp]), clogk[sp], cdh[sp], cana[sp], +1)
    if 'e-' in c:
        excluded.append((sp, 'redox couple (e-)')); continue
    bad = sorted(set(c) - allowed)
    if bad:
        excluded.append((sp, 'outside master set: ' + ','.join(bad))); continue
    emit_species(sp, c, lk, dh, ana, cvr[sp], clit[sp], swapped)

species_rows.sort(key=lambda r: r[0].lower())

# --- parse PHASES, select scaling minerals ------------------------------------
phases = {}     # name -> (formula, comp_products, logk, dh, analytic, vrange, lit)
body, i = sections['PHASES'], 0
while i < len(body):
    ln = body[i]
    if ln[:1] in ' \t#' or not ln.strip(): i += 1; continue
    name = re.split(r'#', ln)[0].strip()
    j = i + 1
    while j < len(body) and (body[j][:1] in ' \t' or not body[j].strip()): j += 1
    block = body[i + 1:j]
    rx = next((b for b in block if '=' in b and not b.strip().startswith('-')
               and not b.strip().startswith('#')), None)
    if rx:
        eq = re.split(r'#', rx)[0]
        lhs, rhs = (parse_terms(s) for s in eq.split('=', 1))
        c, lk0, dhh, dh_ok2 = {}, 0.0, 0.0, True
        # a phase's dissolution may reference a chained species (rare for the
        # scaling set, which uses db masters); its analytic must chain too.
        ana_phase = ZERO6
        for sign, terms in ((+1, rhs), (-1, lhs[1:])):   # lhs[0] = the mineral
            for coef, sp in terms:
                b, blk, bdh, bana, _ = basis(sp)
                if sp in comp and cdh[sp] is None: dh_ok2 = False
                for k, v in b.items(): c[k] = c.get(k, 0.0) + sign * coef * v
                lk0 += sign * coef * blk
                dhh += sign * coef * (bdh or 0.0)
                ana_phase = lincomb_analytic(ana_phase, bana, coef, sign)
        logk, dh, ana, vr, lit = scan_options(block)
        if logk is not None:
            dh_tot = (dhh + dh) if (dh is not None and dh_ok2) else None
            # the phase's OWN analytic (the dissolution K(T) directly) takes
            # priority; chained-species analytic only fills if the phase line
            # has none (it usually does for scaling minerals).
            if ana is not None:
                ana_tot = lincomb_analytic(list(ana), ana_phase, 1.0, +1) \
                          if ana_phase is not None else None
                # the phase analytic already IS the full dissolution K(T) over
                # db masters (ana_phase = 0 here), so this reduces to `ana`.
            else:
                ana_tot = None
            phases[name] = (lhs[0][1], c, lk0 + logk, dh_tot, ana_tot, vr, lit)
    i = j

mineral_rows, absent = [], []
for name in TARGET_PHASES:
    if name not in phases: absent.append(name); continue
    formula, c, lk, dh, ana, vr, lit = phases[name]
    c, lk, dh, ana, swapped = swap_to_hco3(dict(c), lk, dh, ana, -1)
    bad = sorted(set(c) - allowed)
    if 'e-' in c or bad:
        absent.append(f'{name} (outside master set)'); continue
    mast = {MASTERS[f]: v for f, v in c.items() if f != 'H2O'}
    mineral_rows.append((PHASE_KEY.get(name, name.lower()), formula,
                         mast, c.get('H2O', 0.0), lk, dh, ana, vr, lit, swapped))
mineral_rows.sort(key=lambda r: r[0].lower())

# --- formatting ---------------------------------------------------------------
def num(v, dec):
    s = f'{v:.{dec}f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s

def fmt_masters(mast):
    order = sorted(mast, key=lambda k: (mast[k] < 0, charge_of_key(k), k))
    return ' '.join(f'{{ ion {k}; nu {num(mast[k],3)}; }}' for k in order)

def fmt_coeff(v):
    # compact, deterministic, lossless-enough rendering of an analytic coeff
    # (spans 1e-5 .. 1e6); 10 significant digits, trailing-zero trimmed.
    return f'{v:.10g}'

def analytic_field(ana, vr):
    """' analytic ( A1 .. );  validC ( lo hi );' (validC is a REAL dict field --
    the solver reads it to announce out-of-range extrapolation, never a silent
    one); trailing all-zero analytic slots dropped; ('','') when ana is None.
    Returns (field, range-note-for-comment)."""
    if ana is None:
        return '', ''
    a = list(ana)
    while len(a) > 1 and a[-1] == 0.0:           # drop trailing zero slots
        a.pop()
    field = ' analytic ( ' + ' '.join(fmt_coeff(v) for v in a) + ' );'
    if vr is not None:
        field += f' validC ( {vr[0]:g} {vr[1]:g} );'
    rc = '' if vr is None else f'K(T) valid {vr[0]:g}-{vr[1]:g} C'
    return field, rc

ion_z = dict(re.findall(r'\{\s*species\s+(\w+);\s*ion\s*"[^"]*";\s*z\s*([+-]?\d+);',
                        IONS.read_text()))
def charge_of_key(k): return -int(ion_z.get(k, 0))   # cations first

def src_of(lit):
    return SRC + ('; lit: ' + '; '.join(lit) if lit else '')

stamp = 'generated by bin/curate/parse_speciation.py from ' \
        'https://github.com/usgs-coupled/phreeqc3 master, fetched 2026-06-11'

HDR = """/*---------------------------------------------------------------------------*\\
  Choupo electrolyte catalogue --- {title}

  Source: USGS PHREEQC phreeqc.dat (public domain), {block} block;
  {stamp}.
  Per-row literature notes ("lit:") are the database's own inline comments.
  Do not hand-edit values --- re-run the script.

  Convention: {conv}
  logK25 at 25 C, molality basis, water enters as activity a_w.
  dH [J/mol] is the van't Hoff slot (PHREEQC -delta_h; db default unit kJ/mol
  --- verified against the db's own -analytic expressions; kcal-marked entries
  converted at 4.184).  dH omitted when absent for any leg of a chain.

  CARBONATE MASTER = HCO3- (the measured alkalinity carrier).  Carbonate
  equilibria converted from the db's CO3-2 basis via CO3-2 + H+ = HCO3-
  (logK {hk}, dH {hd} kcal); rows touched carry "HCO3-basis" comments.
  Conversion pin: CO2aq logK25 6.352 = pK1 of carbonic acid (lit. 6.35).
{extra}\\*---------------------------------------------------------------------------*/
"""

spec_extra = """
  Naming: dict-safe keys aligned with ions.dat (existing keys reused: OH,
  CO3, HSO4, MgOH); otherwise parentheses dropped + charge suffix
  aq / p / m / p2 / m2  (CaHCO3p = CaHCO3+, MgSO42m2 = Mg(SO4)2-2).

  Scope: equilibrium speciation over the scaling-relevant master set
  {H, Ca, Mg, Na, K, Ba, Sr, Cl, SO4, HCO3, F, H4SiO4} only.  EXCLUDED:
  all redox / e- couples, the Pitzer activity-correction dimers (CO2)2 and
  (H2S)2, and species outside the master set.
"""
min_extra = """
  Scaling minerals only.  NOTE: brucite Mg(OH)2 is ABSENT from phreeqc.dat
  (it lives in pitzer.dat / wateq4f) and is therefore not imported here.
  nuWater < 0 means water is CONSUMED on dissolution (SiO2 + 2 H2O = H4SiO4).
"""

with open(OUT_SPEC, 'w') as f:
    f.write(HDR.format(title='AQUEOUS SPECIATION (association equilibria).',
                       block='SOLUTION_SPECIES', stamp=stamp,
                       conv='sum( nu_i * ion_i ) + nuWater * H2O  =  species\n'
                            '  K = a_species / ( prod a_i^nu_i * a_w^nuWater );',
                       hk=num(HCO3_LOGK, 3), hd=num(HCO3_DH / (CAL * 1e3), 3),
                       extra=spec_extra))
    f.write('\nreactions\n(\n')
    for key, formula, z, mast, nw, lk, dh, ana, vr, lit, swapped in species_rows:
        l1 = f'    {{ species {key}; ion "{formula}"; z {z:+d};'.replace('z +0', 'z 0')
        l1 += f' masters ( {fmt_masters(mast)} );'
        if nw: l1 += f' nuWater {num(nw,3)};'
        l2 = f'      logK25 {num(lk,4)};'
        if dh is not None: l2 += f' dH {num(dh,1)};'
        af, rc = analytic_field(ana, vr)
        l2 += af
        l2 += f' source "{src_of(lit)}"; }}'
        tail = '; '.join(([rc] if rc else []) + (['HCO3-basis'] if swapped else []))
        if tail: l2 += '   // ' + tail
        f.write(l1 + '\n' + l2 + '\n')
    f.write(');\n')

with open(OUT_MIN, 'w') as f:
    f.write(HDR.format(title='SCALING MINERALS (dissolution equilibria).',
                       block='PHASES', stamp=stamp,
                       conv='mineral(s) [+ |nu| H+ ...]  =  sum( nu_i * ion_i ) + nuWater * H2O\n'
                            '  K = prod a_i^nu_i * a_w^nuWater  (negative nu = consumed);',
                       hk=num(HCO3_LOGK, 3), hd=num(HCO3_DH / (CAL * 1e3), 3),
                       extra=min_extra))
    f.write('\nminerals\n(\n')
    for key, formula, mast, nw, lk, dh, ana, vr, lit, swapped in mineral_rows:
        l1 = f'    {{ mineral {key}; formula "{formula}";'
        l1 += f' masters ( {fmt_masters(mast)} );'
        if nw: l1 += f' nuWater {num(nw,3)};'
        l2 = f'      logK25 {num(lk,4)};'
        if dh is not None: l2 += f' dH {num(dh,1)};'
        af, rc = analytic_field(ana, vr)
        l2 += af
        l2 += f' source "{src_of(lit)}"; }}'
        tail = '; '.join(([rc] if rc else [])
                         + ([f'HCO3-basis: {formula}(s) + H+ = products'] if swapped else []))
        if tail: l2 += '   // ' + tail
        f.write(l1 + '\n' + l2 + '\n')
    f.write(');\n')

# --- parse EXCHANGE_SPECIES (cation-exchange half-reactions) ------------------
# Each col-0 line with '=' starts a half-reaction  Me(z+) + z X- = MeX(z).
# We keep only the cations in EXCH_CATIONS (the scaling-relevant exchangeable
# set the master tier already carries).  X- = X- (the identity) is the master
# reference, dropped.  -gamma slots are ignored (equivalent-fraction activity).
exch_rows = []     # (species_key, masters[(ionkey,nu)|('X',nu)], logk, dh, lit, is_ref, src_note)
if 'EXCHANGE_SPECIES' in sections:
    # Reaction lines here are TAB-indented (unlike SOLUTION_SPECIES); a new
    # half-reaction is any line carrying '=' that is not a commented-out one.
    body, i = sections['EXCHANGE_SPECIES'], 0
    while i < len(body):
        ln = body[i]
        code = re.split(r'#', ln)[0]
        if '=' not in code or not code.strip():
            i += 1; continue
        eq = code
        lhs, rhs = (parse_terms(s) for s in eq.split('=', 1))
        j = i + 1
        while j < len(body) and '=' not in re.split(r'#', body[j])[0]: j += 1
        logk, dh, _, _, _ = scan_options(body[i + 1:j])
        # the defined species is the single RHS term (NaX, CaX2, ...)
        defined = rhs[0][1] if rhs else ''
        # the LHS is  cation + n X-   (skip the X- = X- identity)
        cat, nX = None, 0.0
        for coef, sp in lhs:
            if sp == 'X-': nX = coef
            elif sp in EXCH_CATIONS: cat = sp
        # capture the inline literature comment on the -delta_h / -log_k lines
        litnote = ''
        for b in body[i + 1:j]:
            cm = re.search(r'#\s*(.+)$', b)
            if cm and ('delta_h' in b or 'log_k' in b):
                litnote = ascii_clean(cm.group(1))
        i = j
        if defined == 'X-' or cat is None or logk is None:
            continue
        ionkey = EXCH_CATIONS[cat]
        is_ref = (cat == 'Na+')        # NaX is the Gaines-Thomas reference
        # ordered legs: the cation then the site X (the conserved-capacity leg)
        masters = [(ionkey, 1.0), ('X', nX)]
        exch_rows.append((defined, masters, logk, dh,
                          'USGS PHREEQC phreeqc.dat (public domain)'
                          + ('; lit: ' + litnote if litnote else ''),
                          is_ref))

# Gaines-Thomas reference (NaX) first, then by ion key for determinism.
exch_rows.sort(key=lambda r: (not r[5], r[0].lower()))

EXCH_HDR = """/*---------------------------------------------------------------------------*\\
  Choupo electrolyte catalogue --- CATION EXCHANGE (ion-exchange softener).

  Source: USGS PHREEQC phreeqc.dat (public domain), EXCHANGE_SPECIES block;
  {stamp}.
  Per-row literature notes ("lit:") are the database's own inline comments.
  Do not hand-edit values --- re-run the script.

  MODEL: Gaines-Thomas mass-action cation exchange against a fixed-capacity
  pseudo-phase.  The exchanger carries ONE conserved master --- the free site
  X- --- and the bound species NaX / KX / CaX2 / MgX2 / ... form by

      Me(z+) + z X-  =  MeX(z)         K = a(MeX) / ( a_Me^1 * a(X-)^z )

  with the GAINES-THOMAS exchanger-activity convention: the activity of a bound
  species s is its EQUIVALENT FRACTION  beta_s = z_s * m_sX / CEC  (NOT its
  molality), where CEC = sum_s z_s * m_sX is the cation-exchange CAPACITY in
  equivalents per kg water.  The aqueous-ion activity a_Me stays Davies (as in
  speciation.dat).  NaX is the reference (logK 0).  logK25 at 25 C; dH [J/mol]
  is the van't Hoff slot (PHREEQC -delta_h, kJ/mol default).

  THE NEW LEG KIND  `{{ site X; nu n; }}`  (distinct from `{{ ion ...; }}`)
  flags "this leg consumes the conserved exchange capacity" --- the kernel adds
  ONE master (X-) and ONE capacity balance (CEC = sum of equivalents on sites),
  reusing the aqueous-complex + conserved-balance machinery (it is an EQUALITY,
  NOT the mineral active-set complementarity).

  Scope: the scaling-relevant exchangeable cations {{Na, K, Ca, Mg, Sr, Ba}}.
  X- is a pseudo-species declared HERE (not an ion in ions.dat; NaX/CaX2 are
  not aqueous ions).  PHREEQC's -gamma activity slots are NOT imported.
\\*---------------------------------------------------------------------------*/
"""

def fmt_exch_legs(masters):
    out = []
    for k, nu in masters:
        if k == 'X': out.append(f'{{ site X; nu {num(nu,3)}; }}')
        else:        out.append(f'{{ ion {k}; nu {num(nu,3)}; }}')
    return ' '.join(out)

with open(OUT_EXCH, 'w') as f:
    f.write(EXCH_HDR.format(stamp=stamp))
    f.write('\nexchanger X;\nconvention GainesThomas;\n\nexchange\n(\n')
    for defined, masters, logk, dh, src, is_ref in exch_rows:
        l1 = f'    {{ species {defined};'
        if is_ref: l1 += ' reference true;'
        l1 += f' masters ( {fmt_exch_legs(masters)} );'
        l2 = f'      logK25 {num(logk,4)};'
        if dh is not None: l2 += f' dH {num(dh,1)};'
        l2 += f' source "{src}"; }}'
        if is_ref: l2 += '   // Gaines-Thomas reference'
        f.write(l1 + '\n' + l2 + '\n')
    f.write(');\n')

# --- VERIFICATION (FAIL LOUDLY) ------------------------------------------------
print(f'speciation.dat : {len(species_rows)} reactions')
print(f'minerals.dat   : {len(mineral_rows)} minerals '
      f'(absent from db: {", ".join(absent) if absent else "none"})')
print(f'excluded       : {len(excluded)} db species '
      f'(redox: {sum(1 for _, r in excluded if "redox" in r)}, '
      f'dimer: {sum(1 for _, r in excluded if "dimer" in r)}, '
      f'out-of-set: {sum(1 for _, r in excluded if "outside" in r)}, '
      f'no-logk: {sum(1 for _, r in excluded if "log_k" in r)})')
print(f'exchange.dat   : {len(exch_rows)} half-reactions '
      f'({", ".join(r[0] for r in exch_rows)})')

raw = REF.read_text(encoding='latin-1')
def text_logk(pat):
    return float(re.search(pat, raw).group(1))

fails = []
def spot(label, parsed, dbtext, classic, tol=0.05):
    db = text_logk(dbtext)
    ok_db = abs(parsed - db) < 1e-9
    ok_cl = abs(db - classic) <= tol
    note = '' if abs(db - classic) < 1e-9 else \
        f'  [db master revised vs classic {classic}: D={db-classic:+.3f}]'
    print(f'SPOT {label:34s} parsed {parsed:8.3f} | db text {db:8.3f} | '
          f'{"PASS" if ok_db and ok_cl else "FAIL"}{note}')
    if not (ok_db and ok_cl): fails.append(label)

skey = {r[0]: r for r in species_rows}
mkey = {r[0]: r for r in mineral_rows}

spot('Kw  H2O = OH- + H+', skey['OH'][5],
     r'H2O\s*=\s*OH-\s*\+\s*H\+\s*\n\s*-log_k\s+(-?[\d.]+)', -14.0)
spot('calcite (raw, CO3-2 basis)', mkey['calcite'][4] - HCO3_LOGK,
     r'Calcite\s*\n\s*CaCO3[^\n]*\n\s*-log_k\s+(-?[\d.]+)', -8.48)
spot('gypsum  CaSO4:2H2O', mkey['gypsum'][4],
     r'Gypsum\s*\n\s*CaSO4:2H2O[^\n]*\n\s*-log_k\s+(-?[\d.]+)', -4.58)

# units guard: Kw dH must be ~56.4 kJ/mol (kills any kcal-default mistake)
dh_kw = skey['OH'][6]
ok = 50e3 <= dh_kw <= 60e3
print(f'GUARD Kw dH = {dh_kw:.0f} J/mol (expect ~56400, kJ-default) '
      f'{"PASS" if ok else "FAIL"}')
if not ok: fails.append('Kw dH unit guard')

# conversion pins
for label, got, want in [('CO2aq logK (pK1 carbonic acid)', skey['CO2aq'][5], 16.681 - 10.329),
                         ('MgHCO3p logK', skey['MgHCO3p'][5], 11.399 - 10.329),
                         ('calcite logK (HCO3 basis)', mkey['calcite'][4], -8.45 + 10.329)]:
    ok = abs(got - want) < 1e-9
    print(f'PIN  {label:34s} {got:.4f} (expect {want:.4f}) {"PASS" if ok else "FAIL"}')
    if not ok: fails.append(label)

# exchange spot-checks: the Gaines-Thomas selectivity logKs (db EXCHANGE_SPECIES)
ekey = {r[0]: r for r in exch_rows}
for label, key, wantK, wantDH in [
        ('NaX (reference, logK 0)',  'NaX',  0.0,  None),
        ('KX   logK (db 0.7)',       'KX',   0.7,  -4300.0),
        ('CaX2 logK (db 0.8)',       'CaX2', 0.8,   7200.0),
        ('MgX2 logK (db 0.6)',       'MgX2', 0.6,   7400.0)]:
    if key not in ekey:
        print(f'EXCH {label:34s} MISSING'); fails.append(label); continue
    gotK, gotDH = ekey[key][2], ekey[key][3]
    okK  = abs(gotK - wantK) < 1e-9
    okDH = (wantDH is None and gotDH is None) or \
           (wantDH is not None and gotDH is not None and abs(gotDH - wantDH) < 1e-6)
    print(f'EXCH {label:34s} logK {gotK:6.3f} (expect {wantK}) '
          f'dH {("--" if gotDH is None else f"{gotDH:.0f}")} '
          f'{"PASS" if okK and okDH else "FAIL"}')
    if not (okK and okDH): fails.append(label)
# Na/Ca binary isotherm spot-check: at equal aqueous activity (a_Ca = a_Na),
# the Gaines-Thomas ratio beta(CaX2)/beta(NaX)^2 = K_Ca * a_Ca / a_Na^2 = 10^0.8
# (Ca is equivalent-fraction-favoured) -- the divalent-selectivity sanity check.
gt_ratio = 10 ** (ekey['CaX2'][2] - 2 * ekey['NaX'][2])
ok = abs(gt_ratio - 10 ** 0.8) < 1e-9
print(f'ISOT Na/Ca selectivity beta(CaX2)/beta(NaX)^2 at a_Ca=a_Na = '
      f'{gt_ratio:.4f} (expect {10**0.8:.4f}, Ca favoured) {"PASS" if ok else "FAIL"}')
if not ok: fails.append('Na/Ca isotherm')

print('\n--- excluded species (reason) ---')
for sp, r in excluded: print(f'  {sp:14s} {r}')

if fails:
    sys.exit('\nFAIL LOUDLY: ' + '; '.join(fails))
print('\nALL CHECKS PASS')
