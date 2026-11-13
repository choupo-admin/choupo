#!/usr/bin/env python3
"""Item 4(a): numerical dust at every pump / CSTR inlet of the scratch runs
(the result JSON's stream compositions, 12 significant digits as printed),
and what the plan's resolution would do with each tiny constituent.

usage (repository root):
  python3 -I docs/reviews/2026-11-13-density-pilot-plan/item4_dust.py <scratch_dir> > item4_dust.tsv
Relies on item1_reach.tsv having been written next to this script (inlet
stream names) -- it re-reads the unit list the same way.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
scratch = os.path.abspath(sys.argv[1])
here = os.path.dirname(os.path.abspath(__file__))
rows = [l.rstrip('\n').split('\t') for l in open(os.path.join(here, 'item1_reach.tsv'))][1:]
print('case\tunit\tstream\tcomponent\tx\tbelow_1e-6\tbelow_1e-12\tplan_would')
for r in rows:
    case, unit, typ, stream = r[0], r[1], r[2], r[3]
    if stream in ('-',):
        continue
    d = json.loads(open(os.path.join(scratch, 'cases', case, 'result.json')).read().split('<<<Choupo:result-end>>>')[0])
    z = d['streams'][stream]['composition']
    for c, x in z.items():
        if 0 < x < 1e-6:
            note = r[11]
            print(f'{case}\t{unit}\t{stream}\t{c}\t{x:.6g}\t{x<1e-6}\t{x<1e-12}\tsee leaf note: {note}')
