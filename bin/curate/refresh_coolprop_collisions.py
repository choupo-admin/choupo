#!/usr/bin/env python3
# refresh_coolprop_collisions.py -- promote the CoolProp-anchored collision
# files staged in data/proposed/_coolprop_review/ over the existing proposal
# files in data/proposed/components/, as a STRICT UPGRADE (never a field loss).
#
# WHY a MERGE, not an overwrite: CoolProp gives superior MEASURED constants
# (Tc/Pc/omega/MW/Tb), a fitted Antoine and Cp polynomials -- but it has NO
# formation properties (dHf, s_298), NO group decompositions (Joback/UNIFAC),
# and NO solid model (Hsub/Hfus).  The existing chemicals-lineage proposal
# files often DO carry gibbsFormation{}, groups{}, diffusionVolume and (for
# CO2/water) a curated sublimation{} block with Hsub.  A blind overwrite would
# drop those.  So this tool takes the CoolProp file as the BASE and re-inserts
# the prior file's blocks that CoolProp cannot supply.
#
#   * collision over an existing proposal file  -> MERGE (upgrade in place)
#   * collision over a STANDARD (no proposal file yet) -> COPY (a clean
#     CoolProp alternative staged in proposed/, shadowed by the frozen
#     standard at run time -- useful where the standard cites excluded sources)
#
# STAGE-ONLY: writes under data/proposed/components/ only; never data/standards/,
# never git.  _coolprop_review/ is kept as the pristine pre-merge CoolProp record.

import re
from pathlib import Path

ROOT   = Path(__file__).resolve().parents[2]
COMP   = ROOT / 'data/proposed/components'
REVIEW = ROOT / 'data/proposed/_coolprop_review'
OUT    = ROOT / 'data/proposed/COOLPROP-REFRESH.md'

# Blocks CoolProp cannot supply -> preserved from the prior proposal file.
PRESERVE_BLOCKS = ['gibbsFormation', 'groups']
# A scalar line CoolProp does not emit.
PRESERVE_LINES  = ['diffusionVolume']


def extract_block(text, name):
    """Return (block_text, start, end) for `name { ... }` with brace matching,
    or None.  Block name must start a line."""
    m = re.search(r'(?m)^[ \t]*' + re.escape(name) + r'\b', text)
    if not m:
        return None
    i = text.find('{', m.start())
    if i < 0:
        return None
    depth = 0
    for j in range(i, len(text)):
        if text[j] == '{':
            depth += 1
        elif text[j] == '}':
            depth -= 1
            if depth == 0:
                start = m.start()
                end = j + 1
                return (text[start:end], start, end)
    return None


def extract_line(text, key):
    m = re.search(r'(?m)^[ \t]*' + re.escape(key) + r'\b[^\n]*;', text)
    return m.group(0) if m else None


def has_hsub(subl_block):
    m = re.search(r'\bHsub\b[^\n;]*?([0-9][0-9.eE+\-]*)', subl_block)
    return bool(m and float(m.group(1)) > 0.0)


def merge(coolprop_text, prior_text):
    """CoolProp base + prior's CoolProp-absent blocks/lines. Returns merged text."""
    preserved = []
    notes = []
    for b in PRESERVE_BLOCKS:
        e = extract_block(prior_text, b)
        if e:
            preserved.append(e[0])
            notes.append(b)
    for k in PRESERVE_LINES:
        ln = extract_line(prior_text, k)
        if ln:
            preserved.append(ln)
            notes.append(k)

    out = coolprop_text

    # sublimation: if the prior file has an Hsub-bearing block, it wins (the
    # curated solid data CoolProp lacks).  Replace the CoolProp anchors-only
    # block with the prior curated one.
    prior_sub = extract_block(prior_text, 'sublimation')
    cp_sub     = extract_block(out, 'sublimation')
    if prior_sub and has_hsub(prior_sub[0]):
        if cp_sub:
            out = out[:cp_sub[1]] + prior_sub[0] + out[cp_sub[2]:]
        else:
            preserved.insert(0, prior_sub[0])
        notes.append('sublimation(curated Hsub)')

    if not preserved:
        return out, notes

    # insert the preserved blocks/lines just BEFORE the provenance block (or at
    # end if none), each separated by a blank line.
    insert = '\n' + '\n\n'.join(preserved) + '\n'
    prov = extract_block(out, 'provenance')
    if prov:
        out = out[:prov[1]] + insert.lstrip('\n') + '\n' + out[prov[1]:]
    else:
        out = out.rstrip() + '\n' + insert

    # add a provenance note line if a provenance block exists
    prov = extract_block(out, 'provenance')
    if prov and notes:
        note = ('    preserved      "from prior proposal (NOT CoolProp): '
                + ', '.join(notes) + '";\n')
        # insert before the closing brace of the provenance block
        close = prov[1] + prov[0].rfind('}')
        out = out[:close] + note + out[close:]
    return out, notes


def main():
    if not REVIEW.exists():
        print('no _coolprop_review/ -- nothing to refresh'); return
    upgraded, new_alt, merged_notes = [], [], {}
    for r in sorted(REVIEW.glob('*.dat')):
        name = r.stem
        target = COMP / f'{name}.dat'
        cp_text = r.read_text()
        if target.exists():
            merged, notes = merge(cp_text, target.read_text())
            target.write_text(merged)
            upgraded.append(name)
            if notes:
                merged_notes[name] = notes
        else:
            target.write_text(cp_text)      # clean CoolProp alternative to a standard
            new_alt.append(name)
    write_report(upgraded, new_alt, merged_notes)
    print(f'refresh: {len(upgraded)} UPGRADED (merge over existing proposal), '
          f'{len(new_alt)} NEW-ALT (CoolProp alternative to a standard).')
    pres = [n for n in upgraded if n in merged_notes]
    print(f'  {len(pres)} carried preserved blocks (gibbsFormation/groups/'
          f'diffusionVolume/sublimation); e.g. '
          + ', '.join(f'{n}[{"+".join(merged_notes[n])}]' for n in pres[:4]))


def write_report(upgraded, new_alt, notes):
    L = ['# CoolProp collision refresh -- proposal tier (STAGE-ONLY)', '']
    L.append(f'- **{len(upgraded)} UPGRADED**: CoolProp-anchored constants/VP/Cp merged over the '
             f'existing proposal file, PRESERVING fields CoolProp cannot supply '
             f'(gibbsFormation, groups, diffusionVolume, curated sublimation).')
    L.append(f'- **{len(new_alt)} NEW-ALT**: a clean CoolProp alternative staged for a name that '
             f'previously existed ONLY as a frozen standard (shadowed by the standard at run time).')
    L.append('- `_coolprop_review/` kept as the pristine pre-merge CoolProp record. '
             'NOTHING committed; NOTHING written to data/standards/.')
    L.append('')
    L.append('## Upgraded (merge over existing proposal)')
    L.append('')
    L.append('| name | preserved from prior |')
    L.append('|---|---|')
    for n in sorted(upgraded):
        L.append(f'| {n} | {", ".join(notes.get(n, ["(none -- CoolProp superset)"]))} |')
    L.append('')
    L.append('## New CoolProp alternatives to a standard')
    L.append('')
    L.append(', '.join(sorted(new_alt)) if new_alt else '(none)')
    L.append('')
    OUT.write_text('\n'.join(L))


if __name__ == '__main__':
    main()
