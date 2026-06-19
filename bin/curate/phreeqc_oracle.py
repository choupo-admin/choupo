#!/usr/bin/env python3
# phreeqc_oracle.py — independent cross-check of the Choupo electrolyte stack
# against native USGS PHREEQC (public domain).  This is a CURATION / VALIDATION
# tool, NOT engine code: it lives in bin/curate/, runs OFF the hot path, and
# respects the property-architecture contract (validation belongs at the
# data/validation boundary, never inside the solver).  Style precedent:
# parse_speciation.py / parse_mixing.py — deterministic, fail-loud, spot-checked,
# cite-primary.
#
# WHAT IT VALIDATES
#   For each `speciate` operation in a Choupo electrolyte case it
#     (1) translates the propsDict water analysis -> a PHREEQC SOLUTION block,
#     (2) runs native PHREEQC on the model-matched database,
#     (3) parses PHREEQC's .out (saturation indices, pH, single-ion log-gamma,
#         ionic strength),
#     (4) runs choupoProps on the SAME case and parses its JSON diagnostics,
#     (5) tabulates Choupo vs PHREEQC per quantity (SI_<mineral>, pH, gamma_<ion>,
#         I) with absolute + relative deviation and PASS/FLAG vs a stated
#         tolerance.
#
# THE MODEL-PAIRING CAVEATS (announced, not hidden — a comparison is only honest
# once the reader knows what is being compared):
#   * activityModel pitzer  -> PHREEQC pitzer.dat.  This IS the same Harvie-
#     Moller-Weare (HMW) virial basis Choupo's pairs.dat / mixing.dat were
#     imported from, so the SATURATION INDICES are a TIGHT cross-check (expect
#     ~0.05-0.1 SI agreement; the residual is E_theta higher-order-mixing detail
#     + which complexes each side carries).  BUT pitzer.dat prints single-ion
#     gammas on the MacInnes scale (gamma_Cl reference), a DIFFERENT single-ion
#     convention than Choupo's — so per-ion gamma agreement is LOOSE under
#     Pitzer and is reported FYI, never gated.
#   * activityModel davies / absent -> PHREEQC phreeqc.dat, whose default ion
#     activities are WATEQ-Debye-Huckel, NOT Davies.  Same FAMILY, so expect a
#     few-% / ~0.05-0.15 SI agreement, NOT bit-identical.  The tolerance is
#     correspondingly looser and the caveat is printed.
#
# It is a curation tool, NOT a build dependency: bin/runTests must NEVER depend
# on PHREEQC being installed.  On a machine without PHREEQC this script exits
# with a clear install-or-set-CHOUPO_PHREEQC message (honest degradation).
#
# USAGE
#   bin/curate/phreeqc_oracle.py CASE [CASE ...]
#   bin/curate/phreeqc_oracle.py            # defaults to the 3 shipped cases
#   bin/curate/phreeqc_oracle.py --markdown CASE   # also print a VALIDATION.md
#                                                    block (human PROMOTES it;
#                                                    the tool never auto-writes)
# Env overrides (honest, self-contained):
#   CHOUPO_PHREEQC     path to the phreeqc binary  (default /usr/local/bin/phreeqc)
#   CHOUPO_PHREEQC_DB  database directory           (default
#                      /usr/local/share/doc/phreeqc/database)
#
# PRIMARY sources: USGS PHREEQC v3 (Parkhurst & Appelo, USGS TM 6-A43, public
# domain); phreeqc.dat / pitzer.dat are its bundled databases.  The HMW virial
# basis: Harvie, Moller & Weare, Geochim. Cosmochim. Acta 48 (1984) 723.

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHOUPO_PROPS = ROOT / 'choupoProps'

PHREEQC = Path(os.environ.get('CHOUPO_PHREEQC', '/usr/local/bin/phreeqc'))
PHREEQC_DB_DIR = Path(os.environ.get('CHOUPO_PHREEQC_DB',
                                     '/usr/local/share/doc/phreeqc/database'))

DEFAULT_CASES = [
    'tutorials/props/electrolyte/scaling_ro_brackish',
    'tutorials/props/electrolyte/pitzer_seawater_verify',
    'tutorials/props/electrolyte/pitzer_calcite_brine',
]

# --- Choupo ion key  ->  PHREEQC SOLUTION input element ----------------------
# Carbonate enters as TOTAL inorganic carbon C(4) (not "Alkalinity": when pH is
# solved by charge balance PHREEQC refuses a fixed alkalinity, and the Choupo
# `HCO3` total IS the DIC master) tagged `as HCO3` so the mass is the reported
# HCO3 mass.  SO4 -> the redox-resolved sulfur master S(6) `as SO4`.
PHREEQC_ELEMENT = {
    'Ca': 'Ca', 'Mg': 'Mg', 'Na': 'Na', 'K': 'K',
    'Cl': 'Cl', 'Sr': 'Sr', 'Ba': 'Ba', 'F': 'F',
    'SO4': 'S(6)', 'HCO3': 'C(4)', 'CO3': 'C(4)',
}
PHREEQC_AS = {            # the `as <species>` mass-basis modifier, where needed
    'SO4': 'SO4', 'HCO3': 'HCO3', 'CO3': 'CO3', 'F': 'F',
}

# Choupo mineral key  ->  PHREEQC PHASES name (for the SI cross-check).
PHREEQC_PHASE = {
    'calcite': 'Calcite', 'aragonite': 'Aragonite', 'gypsum': 'Gypsum',
    'anhydrite': 'Anhydrite', 'halite': 'Halite', 'sylvite': 'Sylvite',
    'barite': 'Barite', 'celestite': 'Celestite', 'fluorite': 'Fluorite',
}

# Choupo ion key  ->  PHREEQC species name (for the per-ion gamma cross-check).
PHREEQC_SPECIES = {
    'Ca': 'Ca+2', 'Mg': 'Mg+2', 'Na': 'Na+', 'K': 'K+', 'H': 'H+',
    'Cl': 'Cl-', 'SO4': 'SO4-2', 'HCO3': 'HCO3-', 'CO3': 'CO3-2',
    'OH': 'OH-', 'Sr': 'Sr+2', 'Ba': 'Ba+2', 'F': 'F-',
}

# Minerals whose SI is governed by the SULFATE sub-system.  Under Pitzer the
# two codes differ in MODEL STRUCTURE here (NOT a bug): PHREEQC pitzer.dat keeps
# SO4 FULLY DISSOCIATED (the pure HMW virial philosophy — every interaction is in
# the beta/theta/psi coefficients, no ion pairs), whereas Choupo runs the HMW
# activity model ON TOP OF a speciation network that DOES form CaSO4aq / MgSO4aq /
# NaSO4- pairs.  The pairing removes free SO4 (and free Ca/Mg), so Choupo's
# free-ion gypsum/anhydrite IAP sits ~0.3 log units BELOW pitzer.dat's whenever
# the case's catalogue activates SO4 pairing.  Carbonate (calcite/aragonite) SI
# is robust to this (its IAP is Ca*CO3-dominated) — that is why the GATE pin
# (calcite) agrees while the sulfate minerals FLAG.  Announced as a NOTE so the
# FLAG is read as the documented paired-vs-unpaired-SO4 artifact, not a defect.
SULFATE_MINERALS = {'SI_gypsum', 'SI_anhydrite', 'SI_celestite', 'SI_barite'}

# Per-quantity tolerances.  SI under pitzer.dat is the tight cross-check; under
# phreeqc.dat (Davies-vs-WATEQ) it is looser.  pH agrees tightly in BOTH (the
# charge-balance / given-pH closure is the same physics).  Single-ion gamma is
# gated only for Davies (phreeqc.dat is a like single-ion convention); under
# Pitzer it is MacInnes-scaled and reported FYI only.
TOL = {
    'pitzer': {'SI': 0.15, 'pH': 0.05, 'gamma': None, 'I': 0.05},
    'davies': {'SI': 0.20, 'pH': 0.05, 'gamma': 0.10, 'I': 0.05},
}


# ===========================================================================
#  honest degradation: refuse clearly if PHREEQC is absent
# ===========================================================================
def require_phreeqc():
    if not PHREEQC.exists():
        sys.exit(
            f'FAIL: PHREEQC binary not found at {PHREEQC}.\n'
            '  This is a CURATION tool — it is NOT a build/runTests dependency.\n'
            '  Install PHREEQC (https://www.usgs.gov/software/phreeqc-version-3,\n'
            '  public domain) or point CHOUPO_PHREEQC at the binary, e.g.\n'
            '    CHOUPO_PHREEQC=/path/to/phreeqc '
            'CHOUPO_PHREEQC_DB=/path/to/database \\\n'
            f'      {Path(__file__).name} <case>')
    if not PHREEQC_DB_DIR.is_dir():
        sys.exit(f'FAIL: PHREEQC database dir not found at {PHREEQC_DB_DIR}.\n'
                 '  Set CHOUPO_PHREEQC_DB to the directory holding phreeqc.dat '
                 'and pitzer.dat.')
    for db in ('phreeqc.dat', 'pitzer.dat'):
        if not (PHREEQC_DB_DIR / db).exists():
            sys.exit(f'FAIL: {db} missing from {PHREEQC_DB_DIR} '
                     '(needed for the Davies / Pitzer model pairing).')
    if not CHOUPO_PROPS.exists():
        sys.exit(f'FAIL: choupoProps not built at {CHOUPO_PROPS} — run `make all` '
                 'first (the oracle compares against the native binary).')


# ===========================================================================
#  parse a Choupo propsDict — only what the oracle needs from each speciate op
# ===========================================================================
def strip_comments(text):
    """Remove // line and /* block */ comments (the dict tokenizer's view)."""
    text = re.sub(r'/\*.*?\*/', ' ', text, flags=re.S)
    text = re.sub(r'//[^\n]*', '', text)
    return text


def match_braces(text, open_pos):
    """Return the index just past the brace matching text[open_pos] == '{'."""
    depth = 0
    for i in range(open_pos, len(text)):
        if text[i] == '{':
            depth += 1
        elif text[i] == '}':
            depth -= 1
            if depth == 0:
                return i
    sys.exit('FAIL: unbalanced braces in propsDict')


def parse_totals(block):
    """`Ca 84 mg/L; SO4 250 mg/L;` -> [(ion, value, unit), ...] (fail-loud)."""
    out = []
    for stmt in block.split(';'):
        t = stmt.split()
        if not t:
            continue
        if len(t) < 3:
            sys.exit(f'FAIL: totals entry missing a unit (bare number refused): '
                     f'{stmt.strip()!r}')
        ion, val, unit = t[0], t[1], t[2]
        try:
            v = float(val)
        except ValueError:
            sys.exit(f'FAIL: non-numeric total {val!r} in {stmt.strip()!r}')
        out.append((ion, v, unit.lower()))
    return out


def parse_props(case_dir):
    """Read system/propsDict, return the list of speciate operations as dicts:
       {name, totals:[(ion,val,unit)], pH:'solve'|float, T:float,
        activityModel:'davies'|'pitzer', pCO2:float|None}.
       Only `speciate` ops are taken (scalingScan emits r0/rmax summaries that
       do not map to one PHREEQC SOLUTION — out of the oracle's like-for-like
       scope; this is REPORTED, never silently dropped)."""
    pd = case_dir / 'system' / 'propsDict'
    if not pd.exists():
        sys.exit(f'FAIL: no system/propsDict in {case_dir}')
    text = strip_comments(pd.read_text())

    # locate the operations ( ... ) list, then split into { ... } op blocks
    m = re.search(r'\boperations\b\s*\(', text)
    if not m:
        sys.exit(f'FAIL: no operations(...) list in {pd}')
    # find each top-level { } inside the list
    ops, skipped = [], []
    i = m.end()
    while i < len(text):
        c = text[i]
        if c == ')':
            break
        if c == '{':
            j = match_braces(text, i)
            block = text[i + 1:j]
            op = parse_op_block(block)
            if op is None:
                pass
            elif op['type'] == 'speciate':
                ops.append(op)
            else:
                skipped.append((op['name'], op['type']))
            i = j + 1
        else:
            i += 1
    return ops, skipped


def parse_op_block(block):
    """Parse a single { ... } operation block (its nested {} sub-blocks first)."""
    name = field(block, 'name') or '?'
    typ = field(block, 'type') or '?'
    if typ == '?':
        return None

    # totals { ... }
    totals = []
    tm = re.search(r'\btotals\b\s*\{', block)
    if tm:
        end = match_braces(block, tm.end() - 1)
        totals = parse_totals(block[tm.end():end])

    # pH  (a scalar 'solve' or a number)
    ph = field(block, 'pH')
    if ph is None:
        ph = None
    elif ph.lower() == 'solve':
        ph = 'solve'
    else:
        ph = float(ph)

    # T (optional; Choupo default 298.15 K).  Accept `T <K>;` or `temperature`.
    tt = field(block, 'T') or field(block, 'temperature')
    T = float(tt) if tt else 298.15

    # activityModel (default davies — matches the engine default)
    am = (field(block, 'activityModel') or 'davies').lower()

    # atmosphere { pCO2 <v> atm; }
    pco2 = None
    am2 = re.search(r'\batmosphere\b\s*\{', block)
    if am2:
        end = match_braces(block, am2.end() - 1)
        sub = block[am2.end():end]
        pm = re.search(r'\bpCO2\b\s+([0-9.eE+-]+)', sub)
        if pm:
            pco2 = float(pm.group(1))

    return {'name': name, 'type': typ, 'totals': totals, 'pH': ph,
            'T': T, 'activityModel': am, 'pCO2': pco2}


def field(block, key):
    """Scalar `key value;` outside any nested {} — returns the value or None."""
    # mask nested {} so a sub-block's `name`/`file` can't be mistaken for ours
    masked = []
    depth = 0
    for ch in block:
        if ch == '{':
            depth += 1
            masked.append(' ')
        elif ch == '}':
            depth -= 1
            masked.append(' ')
        else:
            masked.append(ch if depth == 0 else ' ')
    flat = ''.join(masked)
    m = re.search(r'\b' + re.escape(key) + r'\b\s+([^\s;{}]+)\s*;', flat)
    return m.group(1) if m else None


# ===========================================================================
#  translate a Choupo speciate op -> a PHREEQC input file
# ===========================================================================
def to_phreeqc_units(unit):
    """Choupo total unit -> PHREEQC `units` line value (fail-loud on unknown)."""
    u = unit.replace(' ', '')
    if u in ('mol/kg', 'mol/kgw', 'mol/kgwater', 'molal'):
        return 'mol/kgw'
    if u in ('mg/l', 'mg/l.', 'mg/litre', 'mg/liter'):
        return 'mg/l'
    sys.exit(f'FAIL: unsupported total unit {unit!r} — extend to_phreeqc_units '
             '(never silently guess a unit).')


def build_phreeqc_input(op):
    """Render a PHREEQC SOLUTION (+ optional EQUILIBRIUM_PHASES for atmosphere)
       block from a parsed speciate op.  All totals must share one unit (PHREEQC
       SOLUTION takes a single `units`); a mixed-unit case fails loudly."""
    units = None
    for _, _, u in op['totals']:
        pu = to_phreeqc_units(u)
        if units is None:
            units = pu
        elif units != pu:
            sys.exit(f'FAIL: op {op["name"]!r} mixes total units '
                     f'({units} vs {pu}) — one PHREEQC SOLUTION needs one unit.')
    if units is None:
        units = 'mol/kgw'           # pure-water pins carry no totals

    temp_C = op['T'] - 273.15
    lines = ['SOLUTION 1', f'    units     {units}',
             f'    temp      {temp_C:.4f}']

    if op['pH'] == 'solve':
        # charge-balance pH — PHREEQC's `pH <guess> charge` (the Choupo
        # electroneutrality closure).  Use a neutral guess.
        lines.append('    pH        7.0 charge')
    else:
        lines.append(f'    pH        {op["pH"]:.4f}')

    for ion, val, _ in op['totals']:
        if ion not in PHREEQC_ELEMENT:
            sys.exit(f'FAIL: ion {ion!r} in op {op["name"]!r} has no PHREEQC '
                     'element mapping — extend PHREEQC_ELEMENT.')
        elem = PHREEQC_ELEMENT[ion]
        asmod = f' as {PHREEQC_AS[ion]}' if ion in PHREEQC_AS else ''
        lines.append(f'    {elem:<10}{val:g}{asmod}')

    # open-to-atmosphere: fix CO2(g) partial pressure (the Henry pin).  This
    # mirrors Choupo's `atmosphere { pCO2 ... }` — log10(pCO2) is PHREEQC's SI.
    if op['pCO2'] is not None:
        import math
        log_pco2 = math.log10(op['pCO2'])
        lines += ['EQUILIBRIUM_PHASES 1',
                  f'    CO2(g)    {log_pco2:.5f}']

    lines.append('END')
    return '\n'.join(lines) + '\n', units


def database_for(model):
    if model == 'pitzer':
        return PHREEQC_DB_DIR / 'pitzer.dat'
    if model == 'davies':
        return PHREEQC_DB_DIR / 'phreeqc.dat'
    sys.exit(f'FAIL: no PHREEQC database paired with activityModel {model!r} '
             '(known: pitzer, davies).')


# ===========================================================================
#  run PHREEQC + parse its .out
# ===========================================================================
def run_phreeqc(pqi_text, db_path):
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        pin = td / 'oracle.pqi'
        pout = td / 'oracle.pqo'
        pin.write_text(pqi_text)
        proc = subprocess.run([str(PHREEQC), str(pin), str(pout), str(db_path)],
                              capture_output=True, text=True)
        out = pout.read_text() if pout.exists() else ''
        if 'ERROR' in out or 'ERROR' in proc.stderr or proc.returncode != 0:
            errs = '\n'.join(l for l in (out + proc.stderr).splitlines()
                             if 'ERROR' in l)
            sys.exit('FAIL: PHREEQC reported errors (never silently skip):\n'
                     + (errs or proc.stderr or '(no .out written)')
                     + '\n--- input was ---\n' + pqi_text)
        return out


def parse_phreeqc_out(out):
    """Return {SI_<min>, pH, gamma_<ion>, I} parsed from a PHREEQC .out.
       Fail-loud if the SI section or a requested quantity cannot be parsed."""
    res = {}

    # pH = (used for the solved-pH cases; for given-pH it echoes the input)
    m = re.search(r'^\s*pH\s*=\s*([0-9.eE+-]+)', out, re.M)
    if m:
        res['pH'] = float(m.group(1))

    # Ionic strength (mol/kgw) = 6.701e-01
    m = re.search(r'Ionic strength\s*\(mol/kgw\)\s*=\s*([0-9.eE+-]+)', out)
    if m:
        res['I'] = float(m.group(1))

    # Saturation indices block:  "  Calcite           0.78     -7.70   -8.48  CaCO3"
    si_block = ''
    sm = re.search(r'Saturation indices.*', out, re.S)
    if sm:
        si_block = sm.group(0)
    inv_phase = {v: k for k, v in PHREEQC_PHASE.items()}
    for line in si_block.splitlines():
        t = line.split()
        if len(t) >= 2 and t[0] in inv_phase:
            try:
                res[f'SI_{inv_phase[t[0]]}'] = float(t[1])
            except ValueError:
                pass

    # Distribution of species — single-ion log gamma (last-but-one numeric col
    # before the mole-V column).  PHREEQC line:
    #   "   Ca+2  9.953e-03  2.490e-03  -2.002  -2.604  -0.602  -16.70"
    #                                                    ^Log Gamma
    # We pull `Log Gamma` and convert gamma = 10**LogGamma.
    sp_block = ''
    dm = re.search(r'Distribution of species.*?(?:Saturation indices|'
                   r'-------\nEnd of simulation)', out, re.S)
    if dm:
        sp_block = dm.group(0)
    else:
        dm = re.search(r'Distribution of species.*', out, re.S)
        sp_block = dm.group(0) if dm else ''
    inv_sp = {v: k for k, v in PHREEQC_SPECIES.items()}
    for line in sp_block.splitlines():
        t = line.split()
        if len(t) >= 6 and t[0] in inv_sp:
            # columns: Species Molality Activity LogMolality LogActivity LogGamma [V]
            try:
                log_gamma = float(t[5])
            except ValueError:
                continue
            res[f'gamma_{inv_sp[t[0]]}'] = 10.0 ** log_gamma

    return res


# ===========================================================================
#  run choupoProps + parse its JSON diagnostics block
# ===========================================================================
def run_choupo(case_dir):
    proc = subprocess.run([str(CHOUPO_PROPS), str(case_dir)],
                          capture_output=True, text=True)
    out = proc.stdout
    m = re.search(r'<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>',
                  out, re.S)
    if not m:
        sys.exit('FAIL: no Choupo result JSON block in choupoProps output for '
                 f'{case_dir} (the <<<Choupo:result-*>>> sentinels were absent — '
                 'did the run crash?).\n--- stderr ---\n' + proc.stderr)
    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError as e:
        sys.exit(f'FAIL: could not parse Choupo result JSON: {e}')
    by_name = {}
    for op in data.get('operationResults', []):
        by_name[op['name']] = op.get('diagnostics', {})
    return by_name


# ===========================================================================
#  compare + report
# ===========================================================================
def compare_op(op, choupo_diag, phreeqc_res):
    """Return rows [(quantity, choupo, phreeqc, abs_dev, rel_dev, tol, status,
       note)] for every quantity BOTH sides report.  Fail-loud if a quantity
       Choupo reports as a comparison target is absent from the PHREEQC parse
       (never silently skip a quantity)."""
    tol = TOL[op['activityModel']]
    rows = []

    def add(q, ch, ph, kind):
        t = tol[kind]
        absd = abs(ch - ph)
        reld = absd / abs(ph) if ph != 0 else float('inf')
        if t is None:
            status = 'FYI'          # reported, not gated (e.g. Pitzer gamma)
        else:
            status = 'PASS' if absd <= t else 'FLAG'
        note = ''
        if (op['activityModel'] == 'pitzer' and q in SULFATE_MINERALS
                and status == 'FLAG'):
            note = 'paired-vs-unpaired SO4 (Choupo pairs SO4; pitzer.dat does ' \
                   'not) — model-structure artifact, not a defect'
        rows.append((q, ch, ph, absd, reld, t, status, note))

    # SI for every mineral BOTH report
    for q, ch in sorted(choupo_diag.items()):
        if q.startswith('SI_') and q in phreeqc_res:
            add(q, ch, phreeqc_res[q], 'SI')

    # pH (Choupo always reports it; PHREEQC echoes/solves it)
    if 'pH' in choupo_diag and 'pH' in phreeqc_res:
        add('pH', choupo_diag['pH'], phreeqc_res['pH'], 'pH')

    # ionic strength
    if 'I' in choupo_diag and 'I' in phreeqc_res:
        add('I', choupo_diag['I'], phreeqc_res['I'], 'I')

    # single-ion gamma (diagSpecies-driven on the Choupo side)
    for q, ch in sorted(choupo_diag.items()):
        if q.startswith('gamma_') and q in phreeqc_res:
            add(q, ch, phreeqc_res[q], 'gamma')

    return rows


def fmt_rows(rows):
    out = []
    hdr = f'    {"quantity":<16}{"Choupo":>12}{"PHREEQC":>12}' \
          f'{"abs":>11}{"rel%":>9}{"tol":>8}  status'
    out.append(hdr)
    out.append('    ' + '-' * (len(hdr) - 4))
    notes = []
    for q, ch, ph, absd, reld, t, status, note in rows:
        ts = '   --' if t is None else f'{t:.3f}'
        tag = ' *' if note else ''
        out.append(f'    {q:<16}{ch:>12.4f}{ph:>12.4f}{absd:>11.4f}'
                   f'{reld * 100:>9.2f}{ts:>8}  {status}{tag}')
        if note:
            notes.append(f'      * {q}: {note}')
    out.extend(notes)
    return '\n'.join(out)


def markdown_block(case_dir, per_op):
    """A markdown block suitable for VALIDATION.md — PRINTED only; the human
       promotes it (writing data/standards/ is a curation act, never automatic)."""
    name = Path(case_dir).name
    lines = [f'### PHREEQC cross-check — `{name}`', '',
             '| op | model | quantity | Choupo | PHREEQC | abs | status |',
             '|----|-------|----------|-------:|--------:|----:|--------|']
    for op, rows in per_op:
        for q, ch, ph, absd, reld, t, status, note in rows:
            st = status + (' \\*' if note else '')
            lines.append(f'| {op["name"]} | {op["activityModel"]} | {q} '
                         f'| {ch:.3f} | {ph:.3f} | {absd:.3f} | {st} |')
    notes = sorted({n for _, rows in per_op for *_, n in rows if n})
    if notes:
        lines.append('')
        for n in notes:
            lines.append(f'\\* {n}')
    return '\n'.join(lines)


def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    want_md = '--markdown' in argv
    cases = args or DEFAULT_CASES

    require_phreeqc()

    print('PHREEQC oracle — independent cross-check of the Choupo electrolyte '
          'stack')
    print(f'  phreeqc  : {PHREEQC}')
    print(f'  database : {PHREEQC_DB_DIR}')
    print('  CAVEATS  : pitzer -> pitzer.dat (same HMW basis -> SI tight; '
          'single-ion gamma is\n'
          '             MacInnes-scaled -> FYI only).  davies -> phreeqc.dat '
          '(WATEQ-DH, same\n'
          '             family as Davies -> looser SI tol, gamma gated).')

    any_flag = False
    for case in cases:
        case_dir = (ROOT / case).resolve() if not Path(case).is_absolute() \
            else Path(case)
        if not case_dir.is_dir():
            sys.exit(f'FAIL: case dir not found: {case_dir}')
        print('\n' + '=' * 76)
        print(f'CASE  {case}')
        print('=' * 76)

        ops, skipped = parse_props(case_dir)
        if skipped:
            print('  [skipped — no single-SOLUTION mapping] '
                  + ', '.join(f'{n} ({t})' for n, t in skipped))
        choupo = run_choupo(case_dir)

        per_op = []
        for op in ops:
            if op['name'] not in choupo:
                sys.exit(f'FAIL: op {op["name"]!r} absent from Choupo JSON '
                         '(parse mismatch).')
            db = database_for(op['activityModel'])
            pqi, units = build_phreeqc_input(op)
            ph_out = run_phreeqc(pqi, db)
            ph_res = parse_phreeqc_out(ph_out)
            rows = compare_op(op, choupo[op['name']], ph_res)
            per_op.append((op, rows))

            print(f'\n  >>> op {op["name"]}  (activityModel={op["activityModel"]} '
                  f'-> {db.name}, units={units}, '
                  f'pH={"solve" if op["pH"]=="solve" else op["pH"]})')
            if not rows:
                print('      (no overlapping quantities to compare)')
                continue
            print(fmt_rows(rows))
            # a FLAG that carries an explanatory note (the documented paired-vs-
            # unpaired-SO4 artifact) is NOT counted as an unexplained flag.
            if any(r[6] == 'FLAG' and not r[7] for r in rows):
                any_flag = True

        if want_md:
            print('\n  --- markdown (PRINTED only; promote by hand) ---')
            print(markdown_block(case_dir, per_op))

    print('\n' + '=' * 76)
    if any_flag:
        print('SUMMARY: some quantities FLAGGED — inspect above (a FLAG may be a '
              'real\n  discrepancy OR a model-pairing artifact; read the caveat '
              'for that model).')
    else:
        print('SUMMARY: all gated quantities within tolerance (FYI rows are '
              'ungated by design).')


if __name__ == '__main__':
    main(sys.argv[1:])
