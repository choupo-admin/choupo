#!/usr/bin/env python3
"""Reconcile ChemSep name collisions against existing proposal identities.

Only a missing CAS is filled, and only when the generated ChemSep key, stored
component name and filename agree after conservative punctuation/case
normalisation. Existing, conflicting CAS values are never changed.
"""

import argparse
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REVIEW = ROOT / 'data/local/_chemsep_review'
CATALOGUES = (ROOT / 'data/standards/components',
              ROOT / 'data/local/components')
REPORT = ROOT / 'data/local/CHEMSEP-COLLISIONS.md'


def normalise(value: str) -> str:
    return re.sub(r'[^a-z0-9]', '', value.lower())


def field(text: str, key: str):
    match = re.search(rf'^\s*{re.escape(key)}\s+([^;]+)\s*;', text, re.MULTILINE)
    return match.group(1).strip().strip('"') if match else None


def add_identity(text: str, cas: str) -> str:
    name_match = re.search(r'^(\s*name\s+[^;]+;\s*)$', text, re.MULTILINE)
    if not name_match:
        raise ValueError('no live name field')
    text = text[:name_match.end()] + f'\nCAS         {cas};' + text[name_match.end():]

    provenance = re.search(r'^provenance\s*\n\{', text, re.MULTILINE)
    entry = (
        '\n    CAS\n'
        '    {\n'
        '        origin        literature;\n'
        '        method        "ChemSep identity reconciliation";\n'
        '        methodVersion "chemsep-pcd-8.3";\n'
        '        uncertainty   "registry identifier; exact match";\n'
        '        notes         "ChemSep v8.3; Artistic-2.0";\n'
        '    }')
    if provenance:
        text = text[:provenance.end()] + entry + text[provenance.end():]
    else:
        text += '\nprovenance\n{' + entry + '\n}\n'
    return text


def candidates(stem: str):
    wanted = stem.lower()
    return [path for directory in CATALOGUES for path in directory.glob('*.dat')
            if path.stem.lower() == wanted]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--prune-resolved', action='store_true',
                        help='remove generated review drafts after a successful merge')
    args = parser.parse_args()

    rows = []
    merged = already = refused = 0
    for draft in sorted(REVIEW.glob('*.dat')) if REVIEW.exists() else []:
        draft_text = draft.read_text(errors='ignore')
        cas = field(draft_text, 'CAS')
        source_name = field(draft_text, 'sourceRecord') or draft.stem
        matches = candidates(draft.stem)
        verdict = ''
        target = None
        if not cas:
            verdict = 'REFUSED: ChemSep draft has no CAS'
        elif len(matches) != 1:
            verdict = f'REFUSED: expected one case-insensitive stem match, found {len(matches)}'
        else:
            target = matches[0]
            target_text = target.read_text(errors='ignore')
            target_name = field(target_text, 'name')
            target_cas = field(target_text, 'CAS')
            if not target_name or normalise(target_name) != normalise(source_name):
                verdict = f'REFUSED: name mismatch ({target_name!r} vs {source_name!r})'
            elif target_cas and target_cas != cas:
                verdict = f'REFUSED: CAS conflict ({target_cas} vs {cas})'
            elif target_cas == cas:
                verdict = 'ALREADY: matching live CAS'
                already += 1
            else:
                target.write_text(add_identity(target_text, cas))
                verdict = 'MERGED: added live CAS + structured provenance'
                merged += 1
        if verdict.startswith('REFUSED'):
            refused += 1
        elif args.prune_resolved and verdict.startswith(('MERGED', 'ALREADY')):
            draft.unlink()
            verdict += '; generated review draft removed'
        rows.append((draft.name, cas or '-',
                     str(target.relative_to(ROOT)) if target else '-', verdict))

    lines = ['# ChemSep collision reconciliation', '',
             'Deterministic identity-only reconciliation. No thermophysical value is changed.', '',
             f'- merged: **{merged}**', f'- already reconciled: **{already}**',
             f'- refused/manual review: **{refused}**', '',
             '| draft | CAS | target | verdict |', '|---|---|---|---|']
    lines += [f'| `{draft}` | `{cas}` | `{target}` | {verdict} |'
              for draft, cas, target, verdict in rows]
    REPORT.write_text('\n'.join(lines) + '\n')
    print(f'chemsep collisions: merged {merged}, already {already}, refused {refused}')
    print(f'wrote {REPORT.relative_to(ROOT)}')
    return 1 if refused else 0


if __name__ == '__main__':
    raise SystemExit(main())
