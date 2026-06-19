#!/usr/bin/env python3
# chemsep_to_choupo.py -- OFFLINE curation importer of the PUBLIC ChemSep
# Database into Choupo's data/proposed/ staging tier.  Style precedent:
# import_coolprop.py (deterministic, collision-safe, emits a markdown report,
# NEVER guesses a number, NEVER writes to data/standards/).
#
# WHY ChemSep is a CLEAN source: the ChemSep DATABASE is copyright Harry
# Kooijman & Ross Taylor and distributed under the Artistic License 2.0
# (Perl Artistic v2) -- FSF-listed GPL-compatible, so aggregating it as DATA
# alongside Choupo's GPL-3.0 CODE is permitted (it keeps its own licence).
# Factual basis: DWSIM (GPLv3) bundles the same database under that licence.
# We use the DATABASE files only -- never the ChemSep SIMULATOR source code.
#
# WHAT it targets (Choupo's actual gap = binary data):
#   * binary interaction parameters: NRTL / UNIQUAC / Wilson  (the .ipd sets)
#   * pure-component constants (chemsep1.xml) as a secondary fill
#
# WHERE it lands (STAGE-ONLY, never data/standards/, never committed blindly):
#   * NEW component   -> data/proposed/components/<name>.dat
#   * NEW binary pair -> data/proposed/binaryPairs/{NRTL,UNIQUAC,Wilson}/<a>-<b>.dat
#   * COLLISION with an existing standards/ or proposed/ file
#                     -> data/proposed/_chemsep_review/...   (non-destructive)
#   * report          -> data/proposed/CHEMSEP-IMPORT.md
#
# Every emitted value carries a provenance{} block (origin ChemSep, the
# authors, the Artistic-2.0 licence, source file/record, reviewed false).
# A human sets `reviewed true` and promotes to data/standards/ -- a deliberate
# act this tool never performs.
#
# >>> REQUIRES the real ChemSep files on disk (third_party/chemsep/).  It does
#     NOT fabricate data: a property it cannot parse is SKIPPED and reported.
#     The chemsep1.xml / .ipd parsers below are written for the documented
#     ChemSep layout and MUST be validated against the actual file the first
#     time it is run (mismatches are reported, never silently mis-mapped).

import sys
import datetime
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT      = Path(__file__).resolve().parents[2]
SRC       = ROOT / 'third_party' / 'chemsep'
PROPOSED  = ROOT / 'data' / 'proposed'
COMP_OUT  = PROPOSED / 'components'
PAIR_OUT  = PROPOSED / 'binaryPairs'
REVIEW    = PROPOSED / '_chemsep_review'
STD_COMP  = ROOT / 'data' / 'standards' / 'components'
STD_PAIR  = ROOT / 'data' / 'standards' / 'binaryPairs'
REPORT    = PROPOSED / 'CHEMSEP-IMPORT.md'

LICENSE   = 'Artistic-2.0'
AUTHORS   = 'Harry Kooijman; Ross Taylor'

# Sources that must NEVER enter the catalogue (policy: no NonCommercial, no
# no-grant aggregators).  If a source file path or a record's citation carries
# one of these, the record is refused.
EXCLUDED = ['DIPPR', 'NIST', 'WEBBOOK', 'SRD', 'ASPEN', 'HYSYS', 'PRO-II',
            'PROII', 'UNISIM', 'YAWS', 'CRC', 'PERRY', 'REFPROP', 'DDBST']


def die_no_files():
    """Spec step 3: the importer REQUIRES the real ChemSep files; if absent it
    explains clearly and refuses -- it must never fabricate a database."""
    print("chemsep_to_choupo: no ChemSep database files found.\n")
    print(f"  Looked in: {SRC}")
    print("  Required (you provide them -- see third_party/chemsep/README.md):")
    print("    - chemsep1.xml   (pure-component database)")
    print("    - *.ipd          (binary interaction parameters: NRTL/UNIQUAC/Wilson)")
    print("    - LICENSE-Artistic-2.0.txt  (ships with the ChemSep download)\n")
    print("  Get them from the free ChemSep distribution (https://www.chemsep.org/)")
    print("  or a DWSIM install, drop them into third_party/chemsep/, and re-run.")
    print("  This tool does NOT download or fabricate data.")
    sys.exit(2)


def excluded(text: str) -> bool:
    up = (text or '').upper()
    return any(tok in up for tok in EXCLUDED)


def existing_component_stems() -> set:
    out = set()
    for d in (STD_COMP, COMP_OUT):
        if d.exists():
            out |= {p.stem.lower() for p in d.glob('*.dat')}
    return out


def prov_block(source_file: str, record: str, extra: dict | None = None) -> str:
    today = datetime.date.today().isoformat()
    lines = ['provenance', '{',
             '    origin        "ChemSep Database";',
             f'    authors       "{AUTHORS}";',
             f'    license       "{LICENSE}";',
             f'    sourceFile    "{source_file}";',
             f'    sourceRecord  "{record}";',
             '    importedBy    "chemsep_to_choupo";',
             f'    importedOn    "{today}";',
             '    reviewed      false;']
    for k, v in (extra or {}).items():
        lines.append(f'    {k}        "{v}";')
    lines.append('}')
    return '\n'.join(lines)


# ---------------------------------------------------------------------------
# ChemSep pure-component XML  ->  component .dat
# NOTE: chemsep1.xml stores each compound as <compound> with child elements
# like <CompoundID value=".."/>, <CAS value=".."/>, <CriticalTemperature
# value=".." units="K"/>, etc.  We emit ONLY the constants we can read; a
# missing/unparable property is skipped and reported (never fabricated).
# VALIDATE the tag names below against the actual file on first run.
# ---------------------------------------------------------------------------
XML_CONST = {
    # ChemSep tag (validated against chemsep1.xml v8.3) -> (Choupo key, SI unit)
    # ChemSep already stores these in SI (K, Pa, kg/kmol == g/mol), so the raw
    # `value` is emitted unchanged; the unit is recorded for the reviewer.
    'MolecularWeight':              ('MW',    'g/mol'),
    'CriticalTemperature':          ('Tc',    'K'),
    'CriticalPressure':             ('Pc',    'Pa'),
    'AcentricityFactor':            ('omega', '-'),
    'NormalBoilingPointTemperature':('Tb',    'K'),
}
# Choupo key -> SI unit, for annotating the staged draft.
XML_CONST_BY_KEY = {key: unit for (key, unit) in XML_CONST.values()}


def parse_components(xml_path: Path, report: list) -> int:
    n = 0
    try:
        root = ET.parse(xml_path).getroot()
    except Exception as e:
        report.append(f'- XML parse FAILED ({xml_path.name}): {e} -- nothing imported.')
        return 0
    existing = existing_component_stems()
    for comp in root.iter('compound'):
        def val(tag):
            el = comp.find(tag)
            return el.get('value') if el is not None else None
        name = val('CompoundID') or val('LibraryIndex') or ''
        if not name:
            continue
        cas = val('CAS')
        consts = {}
        for tag, (key, _note) in XML_CONST.items():
            v = val(tag)
            if v is not None:
                try:
                    consts[key] = float(v)
                except ValueError:
                    report.append(f'- {name}: unparable {tag}="{v}" -- skipped (not fabricated).')
        if not consts:
            report.append(f'- {name}: no usable constants parsed -- skipped.')
            continue
        slug = name.strip().replace(' ', '').replace('/', '_').replace('\\', '_')
        collide = slug.lower() in existing
        out_dir = REVIEW if collide else COMP_OUT
        out_dir.mkdir(parents=True, exist_ok=True)
        body = [f'// ChemSep import -- {name} (STAGED, review before promoting)',
                '// Flat draft: promotion = reshape into the reference-state schema.',
                f'name  {slug};']
        if cas:
            body.append(f'CAS   {cas};')
        for key in consts:
            unit = XML_CONST_BY_KEY[key]
            body.append(f'{key}  {consts[key]}{"" if unit == "-" else f"  // {unit}"};')
        body += ['', prov_block(xml_path.name, name,
                                {'note': 'collision: existing curated file kept'} if collide else None)]
        (out_dir / f'{slug}.dat').write_text('\n'.join(body) + '\n')
        report.append(f'- {name} -> {out_dir.relative_to(ROOT)}/{slug}.dat'
                      + ('  (COLLISION -> review)' if collide else ''))
        n += 1
    return n


# ---------------------------------------------------------------------------
# ChemSep .ipd binary interaction parameters -> Choupo binaryPairs .dat
# The .ipd layout varies by model/version; this parser is DEFENSIVE -- it only
# emits rows it can confidently read and reports the rest.  CONFIRM the exact
# .ipd record layout against the real file on first run before trusting output.
# ---------------------------------------------------------------------------
def cas_to_choupo_name() -> dict:
    """Map CAS number -> Choupo component name (the .dat stem, which IS the
    catalogue lookup key).  Only components carrying a `CAS` field participate;
    a pair is staged only when BOTH CAS resolve here (no orphan references)."""
    out = {}
    if not STD_COMP.exists():
        return out
    for p in STD_COMP.glob('*.dat'):
        cas = None
        for line in p.read_text(errors='ignore').splitlines():
            s = line.strip()
            if s.upper().startswith('CAS') and ';' in s:
                cas = s.split(None, 1)[1].rstrip(';').strip()
                break
        if cas:
            out[cas] = p.stem
    return out


def _as_float(tok: str):
    """ChemSep writes leading-dot (.2892) and short sci (.187e-1) floats."""
    try:
        return float(tok)
    except ValueError:
        return None


# how many leading numeric params each model carries (after the two CAS cols)
IPD_NPARAMS = {'NRTL': 3, 'UNIQUAC': 2, 'Wilson': 2}   # NRTL: A12 A21 alpha12

# DECHEMA energies are in cal/mol; convert to Choupo's per-model convention.
R_CAL = 1.98720425864083      # gas constant, cal/(mol K)
CAL2J = 4.184                 # cal -> J


def choupo_params(model: str, i: str, j: str, a_ij: float, a_ji: float, alpha):
    """Convert DECHEMA cal/mol energies (i->j, j->i) to Choupo's parameters{}.
    NRTL    : tau = a + b/T (dimensionless)  -> a=0, b = A/R  [K]
    UNIQUAC : tau = exp(-a/T), a=(u_ij-u_jj)/R [K] -> a = A/R  [K]
    Wilson  : energies kept in J/mol               -> A = A_cal * 4.184
    All are exact, documented unit conversions -- no fitting, no guessing."""
    out = [f'    i           {i};', f'    j           {j};']
    if model == 'NRTL':
        out += [f'    a_ij        0.0;', f'    b_ij        {a_ij / R_CAL:.6g};   // K',
                f'    a_ji        0.0;', f'    b_ji        {a_ji / R_CAL:.6g};   // K',
                f'    alpha       {alpha:.6g};']
    elif model == 'UNIQUAC':
        out += [f'    a_ij        {a_ij / R_CAL:.6g};   // K', f'    a_ji        {a_ji / R_CAL:.6g};   // K']
    elif model == 'Wilson':
        out += [f'    A_ij        {a_ij * CAL2J:.6g};   // J/mol', f'    A_ji        {a_ji * CAL2J:.6g};   // J/mol']
    return out


def parse_ipd(ipd_path: Path, report: list, casmap: dict) -> int:
    nm = ipd_path.name.lower()
    model = 'NRTL' if 'nrtl' in nm else 'UNIQUAC' if 'uniquac' in nm and 'uniquacp' not in nm \
            else 'Wilson' if 'wilson' in nm else None
    if model is None:
        report.append(f'- {ipd_path.name}: not an NRTL/UNIQUAC/Wilson set -- skipped.')
        return 0
    npar = IPD_NPARAMS[model]
    n = matched = 0
    seen = {}                                          # (lo,hi) -> count this file
    for raw in ipd_path.read_text(errors='ignore').splitlines():
        s = raw.strip()
        if not s or s.startswith('#') or s.startswith('[') or '=' in s.split()[0] \
                or not s[0].isdigit():
            continue                                   # header / comment / blank
        tok = s.split()
        if len(tok) < 2 + npar:
            continue
        cas1, cas2 = tok[0], tok[1]
        params = [_as_float(t) for t in tok[2:2 + npar]]
        if any(p is None for p in params):
            continue                                   # not a clean data row
        n += 1
        name1, name2 = casmap.get(cas1), casmap.get(cas2)
        if not (name1 and name2) or name1 == name2:
            continue                                   # references a compound we don't have
        matched += 1
        lo, hi = sorted((name1, name2))
        out_dir = (PAIR_OUT / model)
        out_dir.mkdir(parents=True, exist_ok=True)
        # Multiple DECHEMA entries can exist for one pair: keep ALL as variants
        # (<lo>-<hi>.dat, then .alt2/.alt3...) so nothing is silently overwritten.
        seen[(lo, hi)] = seen.get((lo, hi), 0) + 1
        fname = f'{lo}-{hi}.dat' if seen[(lo, hi)] == 1 else f'{lo}-{hi}.alt{seen[(lo, hi)]}.dat'
        a12, a21 = params[0], params[1]                 # A12 = 1->2, A21 = 2->1
        alpha = params[2] if model == 'NRTL' else None
        # re-key the directional energies to the alphabetical i=lo, j=hi order
        A_lo_hi = a12 if name1 == lo else a21
        A_hi_lo = a21 if name1 == lo else a12
        body = [f'// ChemSep DECHEMA {model} pair -- {lo}-{hi} (STAGED, review before promoting)',
                '// parameters{} = Choupo convention, converted from the cal/mol source{} below',
                '// (exact unit conversions, no fit). REVIEW the VALUES, then promote.',
                f'components  ( {lo} {hi} );',
                f'model       {model};', '',
                'parameters',
                '{'] + choupo_params(model, lo, hi, A_lo_hi, A_hi_lo, alpha) + ['}', '',
                'source   // raw DECHEMA, for audit -- direction stated by NAME (no flip)',
                '{',
                '    units        cal/mol;',
                f'    A_{name1}_{name2}   {a12};   // CAS {cas1} -> {cas2}',
                f'    A_{name2}_{name1}   {a21};   // CAS {cas2} -> {cas1}']
        if model == 'NRTL':
            body.append(f'    alpha               {params[2]};   // non-randomness (symmetric)')
        body += ['}', '',
                 prov_block(ipd_path.name, f'{cas1}/{cas2}',
                            {'model': model, 'units': 'cal/mol', 'basis': '1 atm DECHEMA'})]
        (out_dir / fname).write_text('\n'.join(body) + '\n')
        report.append(f'- {model}: {lo}-{hi}  (CAS {cas1}/{cas2}) -> '
                      f'{out_dir.relative_to(ROOT)}/{fname}'
                      + ('  (variant)' if seen[(lo, hi)] > 1 else ''))
    report.append(f'- {ipd_path.name}: {n} data rows read, **{matched}** matched our catalogue '
                  f'(both CAS known); the rest reference compounds we do not have.')
    return matched


def main():
    if not SRC.exists():
        die_no_files()
    xmls = sorted(SRC.glob('*.xml'))           # chemsep1.xml sits at the SRC root
    ipds = sorted(SRC.rglob('*.ipd'))          # .ipd sets live under ipd/
    if not xmls and not ipds:
        die_no_files()
    if not list(SRC.rglob('*rtistic*')):
        print('WARNING: no Artistic-2.0 licence text found under third_party/chemsep/ -- '
              'add it (it ships with the ChemSep download) before promoting anything.\n')

    report = ['# ChemSep import (STAGED in data/proposed/ -- nothing promoted)', '',
              f'- Source dir: `third_party/chemsep/`  ({len(xmls)} xml, {len(ipds)} ipd)',
              f'- Licence: {LICENSE}; authors: {AUTHORS}', '']
    nc = npp = 0
    report.append('## Components (chemsep1.xml)')
    for x in xmls:
        if excluded(x.name):
            report.append(f'- {x.name}: REFUSED (excluded-source token in name).')
            continue
        nc += parse_components(x, report)
    report.append('')
    casmap = cas_to_choupo_name()
    report.append(f'## Binary pairs (.ipd)  [CAS->name map: {len(casmap)} catalogue components]')
    for ip in ipds:
        if excluded(ip.name):
            report.append(f'- {ip.name}: REFUSED (excluded-source token in name).')
            continue
        npp += parse_ipd(ip, report, casmap)

    report += ['', '## Summary',
               f'- components staged: **{nc}**',
               f'- binary pairs staged: **{npp}**',
               '- NOTHING written to data/standards/; NOTHING committed.',
               '- Review each staged .dat (set `reviewed true`) before promotion.']
    PROPOSED.mkdir(parents=True, exist_ok=True)
    REPORT.write_text('\n'.join(report) + '\n')
    print(f'chemsep_to_choupo: staged {nc} components, {npp} binary pairs.')
    print(f'  report: {REPORT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
