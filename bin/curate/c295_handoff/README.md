# C295 hand-off scratch (delete this folder when C295 lands)

These three files were scratch of the cloud session; they are kept here so the
session that continues C295 does not have to rebuild them.

- `map.txt` -- one line per case to move: `<case directory name> <origin>` where
  origin is `pairs`, `vp` or `components`; 678 cases.  Source of truth for the
  classification (the header rule of DEV.md 4c C295).  Destination:
  `data/curation/<origin>/<case>`.  curate01..19 and `fixtures/` stay.
- `rewrite.py` -- rewrites `tutorials/props/curation/<moved>` to
  `data/curation/<origin>/<moved>` in text files; usage in its own header
  (`rewrite.py <root> map.txt std` for data/standards).  Imported (sealed)
  copies inside cases are NOT edited by hand: run `python3 -I bin/choupo-import
  <case>` (needs the built `choupoProps --canonical-hash`).
- `expected_before.txt` -- git blob ids of every curation case's `expected`
  golden BEFORE the move; after the move every `expected` must have the SAME
  blob id (a moved case must not change its golden).
