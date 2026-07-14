#!/usr/bin/env python3
# audit_proposed.py -- deterministic licence/provenance audit of the
# data/local/components/ proposal tier.  Style precedent: parse_speciation.py
# (deterministic, spot-checked, emits a markdown report; never guesses).
#
# Context (the 2026-06-07 chemicals/CoolProp MIT ingest): ~326 proposal .dat
# whose LIVE values were already stripped of licence-encumbered numbers and
# Joback-substituted, but whose COMMENT TEXT still carries a FALSE pedigree --
# excluded-source tokens in the header `Tc<-IUPAC ... Cp<-POLING_POLY` line and
# whole commented-out coefficient tuples (a `//`-commented excluded fragment is
# STILL redistribution).  This audit classifies every file PASS / REJECT and
# writes data/local/PROPOSED-AUDIT.md.  It edits nothing -- the scrub is a
# separate, explicit step (scrub_proposed.py).
#
# A file is REJECT if ANY of:
#   (a) any line carries an EXCLUDED source token (header pedigree, comment, or
#       -- worst -- a live attribution), OR
#   (b) a commented-out coefficient TUPLE survives (a `//`-commented
#       vaporPressure/idealGasHeatCapacity/... `coefficients ( ... )` with
#       numbers -- redistribution of the encumbered fit), OR
#   (c) a LIVE numeric value lacks any per-value provenance attribution
#       (no `[origin=...]` / `[Joback]` / `[DERIVED...]` tag AND no top-level
#       provenance{} block) -- an un-attributed live number is not promotable.
#
# REJECT (a)/(b) are licence faults; REJECT (c) is a provenance gap.  The scrub
# step can only fix (a) header text + (b) commented tuples; a file that is
# REJECT solely on a SCRUBBABLE basis is reported as "REJECT->scrubbable".

import re
from pathlib import Path

ROOT  = Path(__file__).resolve().parents[2]
PROP  = ROOT / 'data/local/components'
OUT   = ROOT / 'data/local/PROPOSED-AUDIT.md'

# EXCLUDED source tokens (licensing memory, hard list).  Word-bounded,
# case-insensitive.  'CAS' is handled specially (the universal `CAS <regno>;`
# registry FIELD is legitimate; only CAS-as-a-SOURCE is excluded).
EXCLUDED = ['CRC', 'DIPPR', 'YAWS', 'WAGNER', 'MCGARRY', 'POLING', 'PERRY',
            'LANDOLT', 'NIST', 'WEBBOOK', 'SRD', 'REFPROP', 'VDI', 'MCGRAW']
# A LEADING word boundary only -- the excluded token may be a PREFIX of a larger
# identifier (WAGNER_MCGARRY, PERRY151, POLING_POLY, CRCSTD): those still name an
# excluded source and must be caught (a trailing \b would miss them because `_`
# and digits are word characters).
EXCL_RE  = re.compile(r'(?<![A-Za-z0-9_])(' + '|'.join(EXCLUDED) + r')',
                      re.IGNORECASE)

# CAS-as-source: the word CAS NOT acting as the registry-number field
# (`CAS  67-64-1;`), NOT a CoolProp fluid label (`CAS AIR.PPF` / `CAS SES36.ppf`
# -- CoolProp's own fluid-file id, not CAS Common Chemistry source data), and
# NOT inside the `name ... CAS <num>` header comment.
CAS_FIELD_RE  = re.compile(r'\bCAS\s+[0-9][0-9-]*\s*;?')        # registry field/header
CAS_CPFLUID_RE = re.compile(r'\bCAS\s+\S+\.[Pp][Pp][Ff]\b')    # CoolProp `*.PPF` label
CAS_TOKEN_RE  = re.compile(r'\bCAS\b')
CAS_PROVENANCE_KEY_RE = re.compile(r'^\s*CAS\s*(?:\{|$)')       # provenance.CAS field

# A commented-out coefficient tuple: a `//` line bearing `coefficients ( ... )`
# with at least one number inside.
COMMENT_COEFF_RE = re.compile(r'^\s*//.*coefficients\s*\([^)]*[0-9][^)]*\)')

# A live (non-comment) numeric assignment that should carry provenance:
# the reference-state scalars + model coefficient lines OUTSIDE a comment.
LIVE_NUM_RE = re.compile(r'^\s*(MW|Tc|Pc|omega|Tb|HvapTb|Vliq|dHf_298|dGf_298|'
                         r's_298|Hf_298|S_298)\s+[-0-9.eE]+')
# Per-value provenance tag anywhere on the line.
PROV_TAG_RE = re.compile(r'\[(origin|joback|derived|method|atct|codata|iupac|'
                         r'psrk|wikidata|coolprop|ambrosewalton|bell2018|'
                         r'mathews|staveley|horstmann)',
                         re.IGNORECASE)


def excluded_hits(line):
    """Return list of excluded tokens found on this line (CAS-aware)."""
    hits = [m.group(1).upper() for m in EXCL_RE.finditer(line)]
    # CAS: count only if a bare CAS token remains after removing the registry
    # field and any 'CAS <num>' substrings.
    stripped = CAS_FIELD_RE.sub('', line)
    stripped = CAS_CPFLUID_RE.sub('', stripped)   # CoolProp `*.PPF` fluid label
    if CAS_PROVENANCE_KEY_RE.match(stripped):
        stripped = ''                              # structured identity provenance
    # also drop a 'by CAS' registry-lookup mention? No -- 'by CAS' (use the CAS
    # REGISTRY NUMBER to look a value up via open methods) does NOT redistribute
    # CAS Common Chemistry data; but to stay conservative we DO flag a bare CAS
    # source word.  We exempt only the explicit 'by CAS' registry-lookup idiom.
    stripped = re.sub(r'\bby\s+CAS\b', '', stripped, flags=re.IGNORECASE)
    if CAS_TOKEN_RE.search(stripped):
        hits.append('CAS')
    return hits


def audit_file(path):
    text = path.read_text()
    lines = text.splitlines()
    has_prov_block = bool(re.search(r'^\s*provenance\b', text, re.MULTILINE))

    excl = {}          # token -> first line number
    comment_coeffs = []  # line numbers
    unattributed = []    # line numbers of live nums without provenance

    for i, line in enumerate(lines, 1):
        for tok in excluded_hits(line):
            excl.setdefault(tok, i)
        if COMMENT_COEFF_RE.match(line):
            comment_coeffs.append(i)
        if LIVE_NUM_RE.match(line):
            # Live numeric value.  Attributed if it carries a [tag] OR a
            # provenance{} block exists (the flat-form fallback).
            if not PROV_TAG_RE.search(line) and not has_prov_block:
                unattributed.append(i)

    reasons = []
    if excl:
        reasons.append('excluded-token(' +
                       ','.join(f'{t}@{ln}' for t, ln in sorted(excl.items())) + ')')
    if comment_coeffs:
        reasons.append('commented-coeff-tuple@' +
                       ','.join(map(str, comment_coeffs)))
    if unattributed:
        reasons.append('unattributed-live-value@' +
                       ','.join(map(str, unattributed)))

    verdict = 'PASS' if not reasons else 'REJECT'
    # Scrubbable iff the ONLY faults are excluded-token (header/comment) and
    # commented coeff tuples -- both removable text -- with no unattributed
    # live value AND no excluded token sitting on a LIVE (non-comment) line.
    scrubbable = False
    if verdict == 'REJECT' and not unattributed:
        live_excl = False
        for i, line in enumerate(lines, 1):
            s = line.lstrip()
            if s.startswith('//') or s.startswith('/*') or s.startswith('*'):
                continue
            if excluded_hits(line):
                live_excl = True
                break
        scrubbable = not live_excl
    return verdict, scrubbable, reasons


def main():
    files = sorted(PROP.glob('*.dat'))
    rows = []
    n_pass = n_reject = n_scrubbable = 0
    for f in files:
        verdict, scrubbable, reasons = audit_file(f)
        if verdict == 'PASS':
            n_pass += 1
        else:
            n_reject += 1
            if scrubbable:
                n_scrubbable += 1
        rows.append((f.name, verdict, scrubbable, reasons))

    with OUT.open('w') as o:
        o.write('# `data/local/` component audit — licence + provenance\n\n')
        o.write('Deterministic audit by `bin/curate/audit_proposed.py` over '
                f'**{len(files)}** files in `data/local/components/`.\n'
                'Classifies PASS / REJECT; no file is edited (the scrub is a '
                'separate explicit step).\n\n')
        o.write('**Reject reasons:** `excluded-token` = a licence-encumbered '
                'source word survives (header pedigree, comment, or a live '
                'attribution); `commented-coeff-tuple` = a `//`-commented '
                'coefficient list with numbers survives (a commented excluded '
                'fragment is still redistribution); `unattributed-live-value` = '
                'a live numeric scalar carries no per-value provenance.\n\n')
        o.write('**`REJECT→scrubbable`** = the only faults are removable comment '
                'text (header pedigree + commented tuples); a deterministic '
                'scrub makes it PASS. A reject with a LIVE excluded token or an '
                'unattributed value is **not** auto-scrubbable.\n\n')
        o.write('## Counts\n\n')
        o.write(f'| classification | count |\n|---|---|\n')
        o.write(f'| PASS (token-clean) | {n_pass} |\n')
        o.write(f'| REJECT total | {n_reject} |\n')
        o.write(f'| — of which REJECT→scrubbable | {n_scrubbable} |\n')
        o.write(f'| — of which hard REJECT | {n_reject - n_scrubbable} |\n')
        o.write(f'| **total** | **{len(files)}** |\n\n')
        o.write('## Per-file table\n\n')
        o.write('| file | verdict | scrubbable | reasons |\n')
        o.write('|------|---------|-----------|---------|\n')
        for name, verdict, scrubbable, reasons in rows:
            v = verdict + ('→scrubbable' if (verdict == 'REJECT' and scrubbable) else '')
            sc = 'yes' if scrubbable else ('—' if verdict == 'PASS' else 'no')
            rs = '; '.join(reasons) if reasons else '—'
            o.write(f'| `{name}` | {v} | {sc} | {rs} |\n')

    print(f'audit: {len(files)} files -> PASS {n_pass}, REJECT {n_reject} '
          f'({n_scrubbable} scrubbable, {n_reject - n_scrubbable} hard)')
    print(f'wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
