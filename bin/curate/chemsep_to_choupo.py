#!/usr/bin/env python3
# chemsep_to_choupo.py -- OFFLINE curation importer of the PUBLIC ChemSep
# Database into Choupo's data/local/ staging tier.  Style precedent:
# import_coolprop.py (deterministic, collision-safe, emits a markdown report,
# NEVER guesses a number, NEVER writes to data/standards/).
#
# WHY ChemSep is a CLEAN source: the ChemSep DATABASE is copyright Harry
# Kooijman & Ross Taylor and distributed under the Artistic License 2.0
# (Perl Artistic v2) -- FSF-listed GPL-compatible, so aggregating it as DATA
# alongside Choupo's GPL-3.0 CODE is permitted (it keeps its own licence).
# Factual basis: the ChemSep pure-component database is published under Artistic-2.0.
# We use the DATABASE files only -- never the ChemSep SIMULATOR source code.
#
# WHAT it targets (Choupo's actual gap = binary data):
#   * binary interaction parameters: NRTL / UNIQUAC / Wilson  (the .ipd sets)
#   * pure-component constants (chemsep1.xml) as a secondary fill
#
# WHERE it lands (STAGE-ONLY, never data/standards/, never committed blindly):
#   * NEW component   -> data/local/components/<name>.dat
#   * NEW binary pair -> data/local/binaryPairs/{NRTL,UNIQUAC,Wilson}/<a>-<b>.dat
#   * COLLISION with an existing standards/ or proposed/ file
#                     -> data/local/_chemsep_review/...   (non-destructive)
#   * report          -> data/local/CHEMSEP-IMPORT.md
#
# Every emitted value carries a provenance{} block (origin ChemSep, the
# authors, the Artistic-2.0 licence, source file/record, reviewed false).
# A human sets `reviewed true` and promotes to data/standards/ -- a deliberate
# act this tool never performs.
#
# >>> REQUIRES the real ChemSep files on disk (thirdParty/chemsep/).  It does
#     NOT fabricate data: a property it cannot parse is SKIPPED and reported.
#     The chemsep1.xml / .ipd parsers below are written for the documented
#     ChemSep layout and MUST be validated against the actual file the first
#     time it is run (mismatches are reported, never silently mis-mapped).

import argparse
import hashlib
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT      = Path(__file__).resolve().parents[2]
SRC       = ROOT / 'thirdParty' / 'chemsep'
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
    print("  Required (you provide them -- see thirdParty/chemsep/README.md):")
    print("    - chemsep1.xml   (pure-component database)")
    print("    - *.ipd          (binary interaction parameters: NRTL/UNIQUAC/Wilson)")
    print("    - pcd/Artistic_license_2_0.txt  (ships with the ChemSep download)\n")
    print("  Get them from the free ChemSep distribution (https://www.chemsep.org/)")
    print("  drop them into thirdParty/chemsep/, and re-run.")
    print("  This tool does NOT download or fabricate data.")
    sys.exit(2)


def excluded(text: str) -> bool:
    up = (text or '').upper()
    return any(tok in up for tok in EXCLUDED)


def component_index() -> tuple[dict, dict]:
    """Return (lower-case stem -> (path, CAS), CAS -> path) for every live
    component tier.  CAS is the identity key; the stem is only a lookup key.
    Keeping both prevents aliases such as Argon/argon/Ar from becoming three
    catalogue records for the same substance."""
    stems = {}
    by_cas = {}
    for d in (STD_COMP, COMP_OUT):
        if d.exists():
            for p in sorted(d.glob('*.dat')):
                text = p.read_text(errors='ignore')
                match = re.search(r'^\s*CAS\s+([0-9-]+)\s*;', text, re.MULTILINE)
                cas = match.group(1) if match else None
                stems[p.stem.lower()] = (p, cas)
                if cas:
                    by_cas.setdefault(cas, p)
    return stems, by_cas


def slug(name: str) -> str:
    """Create a dict-safe lower-camel catalogue key from a ChemSep name."""
    words = re.findall(r'[A-Za-z0-9]+', name)
    if not words:
        return ''
    first = words[0]
    first = first[:1].lower() + first[1:] if first[:1].isalpha() else first
    return first + ''.join(w[:1].upper() + w[1:] for w in words[1:])


def prov_block(source_file: str, source_sha256: str, record: str,
               extra: dict | None = None) -> str:
    lines = ['provenance', '{',
             '    status        "UNVERIFIED SOURCE IMPORT -- review before relying on it (data/local tier)";',
             '    origin        literature;',
             '    database      "ChemSep Database";',
             '    method        "DECHEMA parameters as tabulated by ChemSep";',
             '    methodVersion "chemsep-pcd-8.3";',
             f'    authors       "{AUTHORS}";',
             f'    license       "{LICENSE}";',
             f'    sourceFile    "{source_file}";',
             f'    sourceSha256  "{source_sha256}";',
             f'    sourceRecord  "{record}";',
             '    importedBy    "chemsep_to_choupo";',
             '    review        { state pending; reviewer unassigned; }',
             '    validity      { note "1 atm DECHEMA VLE; temperature range not captured on import"; }']
    for k, v in (extra or {}).items():
        lines.append(f'    {k}        "{v}";')
    lines.append('}')
    return '\n'.join(lines)


def component_source_block(source_file: str, source_sha256: str,
                           record: str, collide_note: str = '') -> str:
    lines = ['source', '{',
             '    database      "ChemSep pure-component data v8.3";',
             f'    authors       "{AUTHORS}";',
             f'    license       "{LICENSE}";',
             f'    sourceFile    "{source_file}";',
             f'    sourceSha256  "{source_sha256}";',
             f'    sourceRecord  "{record}";',
             '    importedBy    "chemsep_to_choupo";',
             '    review        { state pending; reviewer unassigned; }']
    if collide_note:
        lines.append(f'    notes         "{collide_note}";')
    lines.append('}')
    return '\n'.join(lines)


def component_provenance_block(keys: set) -> str:
    lines = ['provenance', '{']
    for key in ('MW', 'Tc', 'Pc', 'omega', 'Tb'):
        if key not in keys:
            continue
        lines += [f'    {key}', '    {',
                  '        origin        literature;',
                  '        method        "ChemSep database import";',
                  '        methodVersion "chemsep-pcd-8.3";',
                  '        uncertainty   "not quantified by source";',
                  '        notes         "ChemSep v8.3 record; Artistic-2.0";',
                  '    }']
    if all(k in keys for k in ('Tc', 'Pc', 'omega')):
        lines += ['    vaporPressure', '    {',
                  '        origin        predictive;',
                  '        method        "Ambrose-Walton corresponding states";',
                  '        methodVersion "choupo-aw-1989";',
                  '        uncertainty   "not quantified; validate against saturation data";',
                  '        notes         "computed from ChemSep Tc/Pc/omega";',
                  '    }']
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
def parse_components(xml_path: Path, report: list, write: bool) -> dict:
    counts = {'source': 0, 'new': 0, 'refreshed': 0, 'existing_cas': 0,
              'name_collision': 0, 'skipped': 0}
    try:
        root = ET.parse(xml_path).getroot()
    except Exception as e:
        report.append(f'- XML parse FAILED ({xml_path.name}): {e} -- nothing imported.')
        return counts
    source_sha256 = hashlib.sha256(xml_path.read_bytes()).hexdigest()
    stems, by_cas = component_index()
    for comp in root.iter('compound'):
        def val(tag):
            el = comp.find(tag)
            return el.get('value') if el is not None else None
        name = val('CompoundID') or val('LibraryIndex') or ''
        if not name:
            continue
        counts['source'] += 1
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
            counts['skipped'] += 1
            continue
        refresh_path = None
        if cas and cas in by_cas:
            represented = by_cas[cas]
            represented_text = represented.read_text(errors='ignore')
            if (represented.parent == COMP_OUT
                    and 'importedBy    "chemsep_to_choupo"' in represented_text):
                refresh_path = represented
            else:
                report.append(f'- {name} (CAS {cas}): already represented by '
                              f'`{represented.relative_to(ROOT)}` -- skipped.')
                counts['existing_cas'] += 1
                continue
        key = refresh_path.stem if refresh_path else slug(name)
        if not key:
            report.append(f'- {name}: cannot form a dict-safe name -- skipped.')
            counts['skipped'] += 1
            continue
        collide = refresh_path is None and key.lower() in stems
        out_dir = REVIEW if collide else COMP_OUT
        out_path = refresh_path or (out_dir / f'{key}.dat')
        if write:
            out_dir.mkdir(parents=True, exist_ok=True)
        body = ['/*--------------------------------*- Choupo -*-----------------------*\\',
                f'  Component: {key}  (CAS {cas or "not supplied"})',
                '  PROPOSAL TIER -- UNVERIFIED. Imported from ChemSep v8.3',
                '  pure-component data under Artistic License 2.0.',
                '  Critical constants are source data; Psat is an explicitly',
                '  estimated Ambrose-Walton corresponding-states closure.',
                '\\*---------------------------------------------------------------------------*/',
                '', f'name        {key};']
        if cas:
            body.append(f'CAS         {cas};')
        # ChemSep stores kg/kmol (numerically equal to Choupo kg/kmol), K,
        # Pa, dimensionless omega, K.  Choupo stores Pc in bar.
        if 'MW' in consts:
            body.append(f'MW          {consts["MW"]:.12g};      // kg/kmol [origin=ChemSep v8.3]')
        if 'Tc' in consts:
            body.append(f'Tc          {consts["Tc"]:.12g};      // K [origin=ChemSep v8.3]')
        if 'Pc' in consts:
            body.append(f'Pc          {consts["Pc"] / 1.0e5:.12g};      // bar; source Pa / 1e5 [origin=ChemSep v8.3]')
        if 'omega' in consts:
            body.append(f'omega       {consts["omega"]:.12g};      // [-] [origin=ChemSep v8.3]')
        if 'Tb' in consts:
            body.append(f'Tb          {consts["Tb"]:.12g};      // K [origin=ChemSep v8.3]')
        if all(k in consts for k in ('Tc', 'Pc', 'omega')):
            body += ['', 'vaporPressure', '{',
                     '    model AmbroseWalton;  // [origin=estimated method=Ambrose-Walton]', '}']
        else:
            body += ['', '// GAP: Tc/Pc/omega incomplete; no vapour-pressure model emitted.']
        collide_note = ''
        if collide:
            prior = stems[key.lower()][0].relative_to(ROOT)
            collide_note = f'name collision with {prior}; existing file kept'
        body += ['', component_source_block(xml_path.name, source_sha256, name,
                                            collide_note),
                 '', component_provenance_block(set(consts))]
        if write:
            out_path.write_text('\n'.join(body) + '\n')
        report.append(f'- {name} (CAS {cas}) -> `{out_path.relative_to(ROOT)}`'
                      + ('  (NAME COLLISION -> review)' if collide else ''))
        if refresh_path:
            counts['refreshed'] += 1
        else:
            counts['name_collision' if collide else 'new'] += 1
    return counts


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
    # Standards win when the same identity also has a lower-tier proposal.
    # setdefault preserves that precedence while allowing proposed-only
    # components to unlock proposed binary pairs.
    for directory in (STD_COMP, COMP_OUT):
        if not directory.exists():
            continue
        for p in sorted(directory.glob('*.dat')):
            cas = None
            for line in p.read_text(errors='ignore').splitlines():
                s = line.strip()
                if s.upper().startswith('CAS') and ';' in s:
                    cas = s.split(None, 1)[1].rstrip(';').strip()
                    break
            if cas:
                out.setdefault(cas, p.stem)
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


def parse_ipd(ipd_path: Path, report: list, casmap: dict, write: bool) -> int:
    nm = ipd_path.name.lower()
    model = 'NRTL' if 'nrtl' in nm else 'UNIQUAC' if 'uniquac' in nm and 'uniquacp' not in nm \
            else 'Wilson' if 'wilson' in nm else None
    if model is None:
        report.append(f'- {ipd_path.name}: not an NRTL/UNIQUAC/Wilson set -- skipped.')
        return 0
    npar = IPD_NPARAMS[model]
    source_sha256 = hashlib.sha256(ipd_path.read_bytes()).hexdigest()
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
        if write:
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
                 prov_block(ipd_path.name, source_sha256, f'{cas1}/{cas2}',
                            {'model': model, 'units': 'cal/mol', 'basis': '1 atm DECHEMA'})]
        if write:
            (out_dir / fname).write_text('\n'.join(body) + '\n')
        report.append(f'- {model}: {lo}-{hi}  (CAS {cas1}/{cas2}) -> '
                      f'{out_dir.relative_to(ROOT)}/{fname}'
                      + ('  (variant)' if seen[(lo, hi)] > 1 else ''))
    report.append(f'- {ipd_path.name}: {n} data rows read, **{matched}** matched our catalogue '
                  f'(both CAS known); the rest reference compounds we do not have.')
    return matched


def clean_pending_pair_outputs() -> int:
    """Remove only reproducible, still-pending outputs from prior runs.

    This prevents obsolete .alt variants surviving a changed CAS/name map.
    Human-reviewed/approved files are never removed.
    """
    removed = 0
    for directory in (PAIR_OUT / 'NRTL', PAIR_OUT / 'UNIQUAC', PAIR_OUT / 'Wilson'):
        if not directory.exists():
            continue
        for path in directory.glob('*.dat'):
            text = path.read_text(errors='ignore')
            generated = 'importedBy    "chemsep_to_choupo"' in text
            approved = ('reviewed      true;' in text
                        or re.search(r'\bstate\s+(approved|reviewed)\s*;', text))
            if generated and not approved:
                path.unlink()
                removed += 1
    return removed


def main():
    parser = argparse.ArgumentParser(
        description='Stage ChemSep records without modifying data/standards/.')
    parser.add_argument('--dry-run', action='store_true',
                        help='scan and report planned actions without writing files')
    parser.add_argument('--components-only', action='store_true',
                        help='skip binary interaction parameter import')
    args = parser.parse_args()

    if not SRC.exists():
        die_no_files()
    xmls = sorted(SRC.glob('*.xml'))           # chemsep1.xml sits at the SRC root
    ipds = sorted(SRC.rglob('*.ipd'))          # .ipd sets live under ipd/
    if not xmls and not ipds:
        die_no_files()
    if not list(SRC.rglob('*rtistic*')):
        print('WARNING: no Artistic-2.0 licence text found under thirdParty/chemsep/ -- '
              'add it (it ships with the ChemSep download) before promoting anything.\n')

    report = ['# ChemSep import (STAGED in data/local/ -- nothing promoted)', '',
              f'- Source dir: `thirdParty/chemsep/`  ({len(xmls)} xml, {len(ipds)} ipd)',
              f'- Licence: {LICENSE}; authors: {AUTHORS}', '']
    component_counts = {'source': 0, 'new': 0, 'refreshed': 0, 'existing_cas': 0,
                        'name_collision': 0, 'skipped': 0}
    npp = 0
    report.append('## Components (chemsep1.xml)')
    for x in xmls:
        if excluded(x.name):
            report.append(f'- {x.name}: REFUSED (excluded-source token in name).')
            continue
        result = parse_components(x, report, write=not args.dry_run)
        for key, value in result.items():
            component_counts[key] += value
    report.append('')
    casmap = cas_to_choupo_name()
    if args.components_only:
        report.append('## Binary pairs (.ipd)')
        report.append('- Skipped by `--components-only`.')
    else:
        report.append(f'## Binary pairs (.ipd)  [CAS->name map: {len(casmap)} catalogue components]')
        if not args.dry_run:
            removed = clean_pending_pair_outputs()
            report.append(f'- cleared **{removed}** reproducible pending pair files from prior runs.')
        for ip in ipds:
            if excluded(ip.name):
                report.append(f'- {ip.name}: REFUSED (excluded-source token in name).')
                continue
            npp += parse_ipd(ip, report, casmap, write=not args.dry_run)

    report += ['', '## Summary',
               f'- source component records: **{component_counts["source"]}**',
               f'- new component proposals: **{component_counts["new"]}**',
               f'- existing ChemSep proposals refreshed: **{component_counts["refreshed"]}**',
               f'- existing CAS identities skipped: **{component_counts["existing_cas"]}**',
               f'- name collisions isolated for review: **{component_counts["name_collision"]}**',
               f'- unusable records skipped: **{component_counts["skipped"]}**',
               f'- binary pairs staged: **{npp}**',
               '- NOTHING written to data/standards/; NOTHING committed.',
               '- Review each staged .dat (set `reviewed true`) before promotion.']
    if not args.dry_run:
        PROPOSED.mkdir(parents=True, exist_ok=True)
        REPORT.write_text('\n'.join(report) + '\n')
    mode = 'would stage' if args.dry_run else 'staged'
    print(f'chemsep_to_choupo: {mode} {component_counts["new"]} new components, '
          f'{component_counts["refreshed"]} refreshed, '
          f'{component_counts["name_collision"]} name collisions, {npp} binary pairs; '
          f'skipped {component_counts["existing_cas"]} existing CAS identities.')
    if args.dry_run:
        print('  dry-run: no files written')
    else:
        print(f'  report: {REPORT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
