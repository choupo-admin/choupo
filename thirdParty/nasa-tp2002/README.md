# thirdParty/nasa-tp2002 — NASA/TP-2002-211556, a US government work

## The source

McBride, B. J., Zehe, M. J. and Gordon, S. (2002).  *NASA Glenn Coefficients
for Calculating Thermodynamic Properties of Individual Species.*
NASA/TP-2002-211556.  Glenn Research Center, National Aeronautics and Space
Administration.  NTRS citation 20020085330.

Table B1 gives, for every gas in the database, the enthalpy of formation and
the third-law entropy at 298.15 K; appendix D is the `thermo.inp` listing —
per species and per temperature interval, the nine coefficients of the NASA
Glenn polynomial (its eq. (1): seven for Cp, two integration constants) and,
on the record line, H(298.15), which the report's elements reference makes the
enthalpy of formation.

## Licence, and how it was established

A **work of the United States Government**: not subject to copyright in the
United States (17 U.S.C. § 105).  Free to reproduce, quote and redistribute,
with attribution as scholarly practice rather than as a licence condition.

It is an accepted public-domain source class in
`bin/curate/check_source_licence.py` (`ACCEPTED_PUBLIC_DOMAIN`), a CONTRACT
there: a catalogue record that cites it in an authority field must declare
`licence publicDomain;`, and the tool that reads it must carry the same word.

Verified 2026-10-25.

## Does Choupo redistribute it?

**The PDF, no — the values, yes, each cited to its page.**  The report lives
here, gitignored (`NASA-TP-2002-211556.pdf`).  Being public domain it may be
fetched by a tool: `bin/curate/nasa_tp2002_to_choupo.py --fetch` downloads it
from NTRS.  The report is born-digital, so `pdftotext -layout` reproduces its
tables exactly — unlike the 1993 NASA TM-4513, whose only copy is a scan whose
OCR turns digits into letters.

## What reads it

`bin/curate/nasa_tp2002_to_choupo.py`:

* `block <entry> ...` PRINTS the `standardThermochemistry`,
  `idealGasHeatCapacity { model NASA9; ... }` and `provenance {}` blocks for
  the named appendix-D entries, after holding H and S at 298.15 K recomputed
  from the printed coefficients to the printed values (an entry the report
  disagrees with itself on REFUSES — `CH2CO,ketene` does);
* `verify` holds every record that cites the report to it.

It writes no file under `data/standards/` or `tutorials/`; a curator places
the blocks.  `verify` is a tool and not a gate, because it needs the report on
disk (the `verify_against_poling` precedent).

The engine model that consumes the coefficients as printed is `NASA9`
(`src/thermo/heatCapacity/NASA9Cp.{H,cpp}`).  First used 2026-10-25 (DEV.md
§4c C164) for the 14 catalogue combustion species and the case-local flame
heat capacities that had come from GRI-Mech 3.0's thermo file
([`../grimech/README.md`](../grimech/README.md)).
