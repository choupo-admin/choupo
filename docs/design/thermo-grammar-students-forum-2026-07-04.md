# Students' forum — usability of the propertyPackage convention (2026-07-04)

Panel: the usual student archetypes (first-time MCFT student; the careful
reader; the one who only reads run logs; the one who breaks things on purpose).
Materials: `propertyPackages/co2Water_henry.dat`, the `flash08` run log, and
the deliberately-broken variants.

## Findings

1. **The manifest reads as one sentence** — components, methods per phase,
   `solution { solvent water; solutes ( CO2 ); }`, the pair with its path.
   Every student located "who dissolves in what, by which law, from which
   file" in under a minute.  PASS.
2. **The run log carries the whole assembly story** — `[builder]` (per-group
   rungs), `[henry]` (constants + source file).  The log-only student
   reconstructed the thermo without opening any file.  PASS.
3. **FINDING (fixed):** the log named the METHOD but not the selected PACKAGE.
   A student asked "where IS this manifest?"  Fixed: the run now prints
   `Property package:  co2Water_henry   (record: data/standards/propertyPackages/...)`.
4. **The breaker's test** — deleting the pair line refuses with the exact
   missing entry named (`parameters.henryPairs has no 'CO2-water' entry --
   declare the pair file`).  PASS (A3 behaves).
5. **Noted for the docs task:** docs/ai (the case-author LLM corpus) does not
   yet describe the package convention — an author's assistant would still
   teach the flat thermoPackage.  Carried to the consolidation task.

## Verdict
The convention is understandable and the errors are actionable.  One fix
applied (package announcement); one debt carried (docs/ai).
