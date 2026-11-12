"""PROTOTYPE of the facts an engine could report on a declared panel
(review 2026-11-12).  Reads a panelDict (proposed grammar) and a run's
trajectory.csv, and prints FACTS, never a grade:
  (a) a shown quantity the run does not publish;
  (b) a numeric limit outside the element's declared range;
  (c) a limit the run never approaches (stays below 50 % of it) or always
      violates.
A regex reader, not the engine's dict parser -- a prototype of the checks,
not of their implementation.
usage: check_panel_proto.py <panelDict> <trajectory.csv>
"""
import csv, re, sys
panel = open(sys.argv[1]).read()
rows = list(csv.DictReader(open(sys.argv[2])))
cols = set(rows[0].keys())
def series(unit, cv):
    for name in (f'{unit}.{cv}', f'{unit}.kpi_{cv}'):
        if name in cols:
            return name, [float(r[name]) for r in rows]
    return None, None
body = panel.split('elements', 1)[1]
for m in re.finditer(r'name\s+(\w+);.*?(?=\n    \{\n        name|\Z)', body, re.S):
    el, whole = m.group(1), m.group(0)
    #  a strip's lamps each carry their own measurement and limit: judge each
    #  lamp line apart, so one lamp's limit is never applied to another's value
    parts = [l for l in whole.splitlines() if 'measurement' in l and 'word' in l] or [whole]
    for txt in parts:
      for u, cv in re.findall(r'measurement\s*\{\s*unit\s+(\w+);\s*cv\s+(\w+);\s*\}', txt):
          name, s = series(u, cv)
          if name is None:
              print(f'[panel] {el}: shows {u}.{cv}, which this run does NOT publish')
              continue
          rng = re.search(r'range\s*\(\s*([-0-9.eE]+)\s+([-0-9.eE]+)\s*\)\s*(\S+);', txt)
          lim = re.search(r'limit\s*\{\s*value\s+([-0-9.eE]+)', txt)
          if rng and lim and not (float(rng.group(1)) <= float(lim.group(1)) <= float(rng.group(2))):
              print(f'[panel] {el}: limit {lim.group(1)} lies outside the range {rng.group(1)}..{rng.group(2)}')
          for lo, hi in re.findall(r'low\s+([-0-9.eE]+)\s*\S*;\s*high\s+([-0-9.eE]+)', txt):
              lo, hi = float(lo), float(hi)
              out = sum(1 for v in s if not lo <= v <= hi)
              print(f'[panel] {el}: {name} outside the band [{lo:g}, {hi:g}] at {out} of {len(s)} written instants'
                    f' (min {min(s):.4g}, max {max(s):.4g})')
          for hi in re.findall(r'\bhigh\s+([-0-9.eE]+)\s*\w*;', txt):
              hi = float(hi)
              if max(s) < 0.5 * hi:
                  print(f'[panel] {el}: {name} never approaches its limit {hi:g} (max {max(s):.4g}) -- a limit nothing exercises')
              if min(s) > hi:
                  print(f'[panel] {el}: {name} ALWAYS above its limit {hi:g}')
