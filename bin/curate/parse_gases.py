#!/usr/bin/env python3
# parse_gases.py — deterministic import of gas–aqueous (Henry's-law) dissolution
# equilibria from the USGS PHREEQC phreeqc.dat (public domain) PHASES block into
# the Choupo electrolyte catalogue.  Style precedent: parse_speciation.py.
#
# Produces:
#   data/standards/electrolyte/gases.dat   (PHASES gas dissolution equilibria)
#
# A PHREEQC gas phase is a Henry's-law equilibrium between a fugacity-defined
# gas and a dissolved aqueous species:
#
#       gas(g)  =  dissolved        K = a(dissolved) / f(gas)
#
# where f(gas) is the Peng–Robinson fugacity computed from the gas's critical
# constants T_c, P_c and the acentric factor Omega that the db lists per phase.
# logK25 = log10 K at 25 C is the (decadic) Henry constant on the molality /
# atm-fugacity basis the db uses (gas = aq, so a more soluble gas has a LARGER
# logK; PHREEQC writes the gas on the LHS).
#
# Decisions (documented, do not silently change):
#   * SCOPE = the eight chemically-distinct gases: CO2, H2O, O2, H2, N2, H2S,
#     CH4, NH3.  EXCLUDED = the five redox-DECOUPLED twin masters Oxg / Hdg /
#     Ntg / Mtg / H2Sg(g) — these are PHREEQC's "dissolved gas without the e-
#     redox coupling" duplicates of O2 / H2 / N2 / CH4 / H2S, carrying IDENTICAL
#     T_c / P_c / Omega and analytic; they are NOT new chemistry (their pseudo-
#     element masters Oxg/Hdg/Ntg/Mtg/Sg are outside any real master set).
#   * H2S(g) dissolution in phreeqc.dat is written  H2S = H+ + HS-  (Henry +
#     first acid dissociation FUSED into one step); its logK / dH are therefore
#     the COMBINED values.  Recorded faithfully with a "Henry+Ka1 fused" note.
#   * PHREEQC -delta_h default unit is kJ/mol (verified by van't Hoff against
#     each phase's own -analytic: CO2 'kcal' x4.184 = -19.98 kJ matches the
#     analytic slope; H2O '-44.03 kJ' and the unmarked H2/Mtg values match as
#     kJ, NOT kcal).  'kcal'-marked entries are converted at 4.184 J/cal.  dH in
#     J/mol, omitted when the phase carries no -delta_h.
#   * analytic = the PHREEQC log_k(T) vector A1..A6 (T in K):
#         log10 K(T) = A1 + A2*T + A3/T + A4*log10(T) + A5/T^2 + A6*T^2
#     emitted verbatim (trailing all-zero slots dropped); the runtime uses it as
#     an anchored T-correction (logK25 + [ana(T) - ana(298.15)]).
#   * Tc [K], Pc [atm], Omega [-] copied verbatim from the db (-T_c -P_c -Omega).
#   * Spot-check anchors FAIL the run loudly on mismatch.

import re, sys, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REF  = ROOT / 'bin/curate/refs/phreeqc.dat'
OUT  = ROOT / 'data/standards/electrolyte/gases.dat'

SRC = 'USGS PHREEQC phreeqc.dat (public domain)'
CAL = 4.184          # J/cal

# The eight chemically-distinct gases (db PHASES names).  Order = emission order.
TARGET_GASES = ['CO2(g)', 'H2O(g)', 'O2(g)', 'H2(g)', 'N2(g)',
                'H2S(g)', 'CH4(g)', 'NH3(g)']
# The five redox-decoupled twin masters — reported, NOT imported.
TWIN_GASES = ['Oxg(g)', 'Hdg(g)', 'Ntg(g)', 'Mtg(g)', 'H2Sg(g)']

# dict-safe key per gas: drop "(g)", that is all that is needed here.
def gas_key(name):
    return name[:-3]   # 'CO2(g)' -> 'CO2'

DH_UNIT = {None: 1e3, 'kj': 1e3, 'kjoules': 1e3, 'kcal': CAL * 1e3,
           'cal': CAL, 'j': 1.0, 'joules': 1.0}

def ascii_clean(s):
    s = s.replace('\xb0', ' ')   # degree sign -> space
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', s).strip()

# --- read db (latin-1 byte-safe), split into sections ------------------------
lines = REF.read_text(encoding='latin-1').splitlines()
sections, cur = {}, None
for ln in lines:
    if re.fullmatch(r'[A-Z][A-Z_0-9]*', ln.strip()) and ln[:1] not in ' \t':
        cur = ln.strip(); sections.setdefault(cur, []); continue
    if cur: sections[cur].append(ln)


def scan_gas(block_lines):
    """Extract (logk, dh_J|None, analytic|None, tc|None, pc|None, omega|None,
    lit-comments) from a gas PHASES block.  Options may be ';'-separated AND
    split across lines (the db mixes both styles)."""
    logk = dh = analytic = tc = pc = omega = None
    lit = []
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
                coeffs = []
                for tok in t[1:]:
                    try:
                        coeffs.append(float(tok))
                    except ValueError:
                        sys.exit('FAIL: non-numeric analytic coefficient '
                                 f'{tok!r} in line: {ln.strip()!r}')
                if coeffs:
                    analytic = (coeffs + [0.0] * 6)[:6]; keep_comment = True
            elif key == 't_c' and len(t) >= 2:
                tc = float(t[1])
            elif key == 'p_c' and len(t) >= 2:
                pc = float(t[1])
            elif key == 'omega' and len(t) >= 2:
                omega = float(t[1])
        if cm and keep_comment:
            c = ascii_clean(cm.group(1))
            if c and c not in lit: lit.append(c)
    return logk, dh, analytic, tc, pc, omega, lit


# --- parse PHASES, capture each gas's dissolution reaction -------------------
body, i = sections['PHASES'], 0
found = {}      # name -> (rhs_str, logk, dh, analytic, tc, pc, omega, lit)
while i < len(body):
    ln = body[i]
    if ln[:1] in ' \t#' or not ln.strip(): i += 1; continue
    name = re.split(r'#', ln)[0].strip()
    j = i + 1
    while j < len(body) and (body[j][:1] in ' \t' or not body[j].strip()): j += 1
    block = body[i + 1:j]
    rx = next((b for b in block if '=' in b and not b.strip().startswith('-')
               and not b.strip().startswith('#')), None)
    if name in TARGET_GASES and rx is not None:
        eq = re.split(r'#', rx)[0]
        lhs, rhs = (s.strip() for s in eq.split('=', 1))
        logk, dh, ana, tc, pc, omega, lit = scan_gas(block)
        found[name] = (rhs, logk, dh, ana, tc, pc, omega, lit)
    i = j

absent = [g for g in TARGET_GASES if g not in found]
if absent:
    sys.exit(f'FAIL: target gases absent from db PHASES: {absent}')

# --- formatting ---------------------------------------------------------------
def num(v, dec):
    s = f'{v:.{dec}f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s

def fmt_coeff(v):
    return f'{v:.10g}'

def analytic_field(ana):
    if ana is None: return ''
    a = list(ana)
    while len(a) > 1 and a[-1] == 0.0: a.pop()
    return ' analytic ( ' + ' '.join(fmt_coeff(v) for v in a) + ' );'

def src_of(lit):
    return SRC + ('; lit: ' + '; '.join(lit) if lit else
                  '; primary not stated in db')

stamp = ('generated by bin/curate/parse_gases.py from '
         'https://github.com/usgs-coupled/phreeqc3 master, fetched 2026-06-21')

HDR = """/*---------------------------------------------------------------------------*\\
  Choupo electrolyte catalogue --- DISSOLVED GASES (Henry's-law dissolution).

  Source: USGS PHREEQC phreeqc.dat (public domain), PHASES block;
  {stamp}.
  Per-row literature notes ("lit:") are the database's own inline comments.
  Do not hand-edit values --- re-run the script.

  ALL entries below are NEW (this file did not exist before 2026-06-21).

  Convention: gas(g)  =  dissolved        K = a(dissolved) / f(gas)
  where f(gas) is the Peng-Robinson fugacity from the gas's critical constants
  Tc [K], Pc [atm] and the acentric factor Omega.  logK25 = log10 K at 25 C is
  the decadic Henry constant on the molality / atm-fugacity basis; PHREEQC
  writes the gas on the LHS, so a MORE soluble gas has a LARGER logK.

  dH [J/mol] is the van't Hoff slot (PHREEQC -delta_h; db default unit kJ/mol
  --- verified by van't Hoff against each phase's own -analytic: CO2 'kcal'
  x4.184 = -19.98 kJ matches the analytic slope; H2O '-44.03 kJ' and the
  unmarked H2 / CH4 values match as kJ).  'kcal'-marked entries converted at
  4.184.  dH omitted when the phase carries no -delta_h.

  analytic ( A1 .. A6 ) is the db log_k(T) vector (T in K):
    log10 K(T) = A1 + A2*T + A3/T + A4*log10(T) + A5/T^2 + A6*T^2
  (trailing all-zero slots dropped); the runtime uses it as an anchored
  T-correction logK25 + [ana(T) - ana(298.15)].

  SCOPE = the eight chemically-distinct gases CO2, H2O, O2, H2, N2, H2S, CH4,
  NH3.  EXCLUDED = phreeqc.dat's five redox-DECOUPLED twin masters Oxg / Hdg /
  Ntg / Mtg / H2Sg(g) (identical Tc/Pc/Omega/analytic duplicates of O2 / H2 /
  N2 / CH4 / H2S, used only to model dissolved gas WITHOUT the e- redox
  coupling --- not new chemistry).  H2S(g) dissolution is written in the db as
  H2S = H+ + HS- (Henry + first acid dissociation FUSED); its logK / dH are the
  COMBINED values --- flagged "Henry+Ka1 fused".
\\*---------------------------------------------------------------------------*/

gases
(
"""

with open(OUT, 'w') as f:
    f.write(HDR.format(stamp=stamp))
    for name in TARGET_GASES:
        rhs, logk, dh, ana, tc, pc, omega, lit = found[name]
        key = gas_key(name)
        l1 = f'    {{ gas {key}; reaction "{name} = {rhs}"; dissolved "{rhs}";'
        l2 = f'      logK25 {num(logk,4)};'
        if dh is not None: l2 += f' dH {num(dh,1)};'
        l2 += analytic_field(ana)
        if tc is not None:    l2 += f' Tc {num(tc,4)};'
        if pc is not None:    l2 += f' Pc {num(pc,4)};'
        if omega is not None: l2 += f' omega {num(omega,4)};'
        l2 += f' source "{src_of(lit)}"; }}'
        tail = ' fused' if rhs != key.replace('aq', '') and '+' in rhs else ''
        if rhs != key and '+' in rhs:
            l2 += '   // Henry+Ka1 fused: gas dissolution + first acid dissociation'
        f.write(l1 + '\n' + l2 + '\n')
    f.write(');\n')

# --- VERIFICATION (FAIL LOUDLY) -----------------------------------------------
print(f'gases.dat : {len(found)} gases of {len(TARGET_GASES)} targeted '
      f'(absent: {", ".join(absent) if absent else "none"})')
print(f'EXCLUDED redox-twins (not imported): {", ".join(TWIN_GASES)}')

raw = REF.read_text(encoding='latin-1')
fails = []
def spot(label, parsed, want, tol=1e-9):
    ok = parsed is not None and abs(parsed - want) < tol
    print(f'SPOT {label:30s} parsed {parsed} (expect {want}) '
          f'{"PASS" if ok else "FAIL"}')
    if not ok: fails.append(label)

co2 = found['CO2(g)']
spot('CO2 logK25', co2[1], -1.468)
spot('CO2 dH (kcal->J)', round(co2[2], 4), round(-4.776 * CAL * 1e3, 4))
spot('CO2 Tc', co2[4], 304.2)
spot('CO2 Pc', co2[5], 72.86)
spot('CO2 Omega', co2[6], 0.225)
h2o = found['H2O(g)']
spot('H2O dH (kJ->J)', h2o[2], -44030.0)
h2s = found['H2S(g)']
spot('H2S logK25 (fused)', h2s[1], -7.93)
spot('H2S dH (kJ->J)', round(h2s[2], 1), 9100.0)
nh3 = found['NH3(g)']
spot('NH3 logK25', nh3[1], 1.7966)
spot('NH3 Tc', nh3[4], 405.6)

# van't Hoff guard: CO2 dH from analytic must match the db -delta_h (~-20 kJ)
import math
R, T, ln10 = 8.314462, 298.15, math.log(10)
A = (list(co2[3]) + [0.0] * 6)[:6]
dlnKdT = ln10 * (A[1] - A[2] / T**2 + A[3] / (T * ln10)
                 - 2 * A[4] / T**3 + 2 * A[5] * T)
dH_ana = R * T**2 * dlnKdT
ok = abs(dH_ana - co2[2]) < 1500.0     # within ~1.5 kJ
print(f'GUARD CO2 dH: analytic {dH_ana:.0f} vs -delta_h {co2[2]:.0f} J/mol '
      f'{"PASS" if ok else "FAIL"}')
if not ok: fails.append('CO2 dH unit guard')

if fails:
    sys.exit('\nFAIL LOUDLY: ' + '; '.join(fails))
print('\nALL CHECKS PASS')
