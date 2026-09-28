# thirdParty/thermo-ipdb — the `thermo` package's interaction-parameter tables

## The source

`thermo`, the chemical-engineering Python library by Caleb Bell (PyPI
`thermo`; read at version **0.6.1**, sdist `thermo-0.6.1.tar.gz`, sha256
`35ad523c54d54d91d8aaf8be0c68a628fb17cfae76fffe02d8e543facbef9e18`,
2026-09-28).  Its `thermo/interaction_parameters.py` exposes `IPDB`, "a
small database of interaction parameters.  Only two data sets are currently
included, both from ChemSep" -- `thermo/Interaction Parameters/ChemSep/`
holds `nrtl.json` / `nrtl.ipd`, `pr.json` / `pr.ipd`, `uniquac.json`,
`wilson.json` and `henry.json`, keyed by CAS pair.

## Licence — read carefully, the code and the tables differ

The package is MIT-licensed (`LICENSE.txt`: "Copyright (C) 2016, 2017,
2018, 2019, 2020, Caleb Bell ... Permission is hereby granted, free of
charge, to any person obtaining a copy of this software ...").  That grant
is Caleb Bell's, over his work.  It cannot relicense tables he did not
author:

- `nrtl.ipd` in the package is ChemSep's file, headed "Copyright 2008 Harry
  Kooijman and Ross Taylor ... DECHEMA NRTL at P=1atm" -- BYTE-IDENTICAL
  (`cmp`) to the `ipd/nrtl.ipd` shipped in ChemSep LITE 8.50.
- ChemSep's own licence (`help/chemsep.lic`) grants the Artistic License
  2.0 to the pure-component databank "and ONLY" that, and forbids
  sublicensing (card: [`thirdParty/chemsep/`](../chemsep/README.md)).
- The package ships an `Artistic_license_2_0.txt` beside the tables.  That
  file is the licence of ChemSep's PURE-COMPONENT databank; its presence in
  this folder does not extend it to the pair tables.

**Verdict: no value from these tables enters the public tree.**  Reaching the
same DECHEMA-derived numbers through a permissively licensed intermediary is
the provenance laundering CLAUDE.md section 10 names.
`bin/curate/check_source_licence.py` (EXCLUDED_TABLES) refuses a record that
names this copy as a value's origin.

## A second reason, independent of the licence

`IPDB.get_ip_specific(name, CASs, ip)` returns
`self.metadata[name]["missing"][ip]` when the pair is absent -- for the
ChemSep NRTL table `{"bij": 0, "alphaij": 0.3}`.  An absent pair therefore
comes back as a NUMBER (ideal mixing) indistinguishable from a measured
zero.  Any use of this API as a data source must test `has_ip_specific`
first; Choupo's own loaders refuse or announce an absent pair instead.

And a third: the `.ipd` carries some pairs TWICE, from two DECHEMA pages
(methanol/tetrachloromethane at p18 with alpha 0.2892, and again at p279
with alpha 0.4622).  `nrtl.json` keys by CAS pair and holds one of them
(alpha 0.4622 for both directions) -- a selection among two published sets
made without a word.  `chemsep_to_choupo.py` keeps both, as `.alt` variants.

## Does Choupo redistribute it?

No.  Nothing here is downloaded by a Choupo tool.  If you hold your own
ChemSep install, `bin/curate/chemsep_to_choupo.py` stages its `.ipd` pairs
into your private `data/local/parameters/` (announced `[local] UNVERIFIED`
at run time); that is the local route, and it reads ChemSep's files, not
this copy.

## What reads it

Nothing.  This card exists so that the next reader who finds "ChemSep NRTL
by CAS, MIT licence" does not conclude afresh that the values are free to
ship.
