#!/usr/bin/env python3
"""
migrate_speciate_case.py <caseDir> -- migrate a SINGLE-MODEL speciate case off the
degenerate propertyDict + per-op activityModel onto the inline propertyPackage
manifest (roadmap Phase B/C).

- constant/propertyDict -> inline electrolyte propertyPackage: recordType
  propertyPackage; components ( water ); inputBasis { solvent water;
  analyticalMasters ( <the ion set> ) }; propertyMethods.aqueousActivity
  electrolyte.<model>.
- system/propsDict: strip the per-op `activityModel <m>;`; rename `totals` ->
  `analyticalTotals` (the manifest governs the model).

Refuses a case whose ops use MORE than one activity model (that is a model
CONTRAST -- needs the op->package mechanism, handled separately).
"""
import re, sys, os

case = sys.argv[1]
pd = os.path.join(case, "constant", "propertyDict")
ps = os.path.join(case, "system", "propsDict")
txt = open(ps).read()

# A comment mentioning activityModel is NOT a directive: only match `activityModel <m>;`
models = sorted(set(re.findall(r'activityModel\s+([A-Za-z]+)\s*;', txt)))
# CONTRAST case (>1 model): keep the per-op activityModel as explicit overrides,
# declare the reference model in the package (pitzerHMW is the headline; davies
# is the cautionary curve read against it).
contrast = len(models) > 1
model = ("pitzerHMW" if "pitzerHMW" in models else models[0]) if models else "davies"

# union of ion keys across every totals{...} block
ions = []
for blk in re.findall(r'totals\s*\{([^}]*)\}', txt):
    for m in re.finditer(r'([A-Za-z0-9()]+)\s+[-0-9.]', blk):
        if m.group(1) not in ions:
            ions.append(m.group(1))

name = os.path.basename(case).replace("-", "_") + "_pkg"
method_note = (
    f"the {model} activity method.  The speciate ops carry only the\n"
    "  ANALYSIS (analyticalTotals); no per-op model."
    if not contrast else
    f"the reference activity method {model}.  This is a model-CONTRAST case:\n"
    f"  the ops keep an explicit per-op `activityModel` ({' vs '.join(models)}) as a\n"
    "  deliberate override -- the whole point is to read the rival models against\n"
    "  each other on ONE feed."
)
manifest = f"""/*--------------------------------*- Choupo -*-----------------------*\\
  propertyPackage (INLINE, self-contained) -- the case's OFFICIAL dictionary.
  Multi-ion speciation SYSTEM: solvent water, the analytical basis measured in
  ions, and {method_note}  Replaces the degenerate water+ideal.
\\*---------------------------------------------------------------------------*/
recordType propertyPackage;
schemaVersion 1;

name {name};

components ( water );

inputBasis
{{
    solvent           water;
    analyticalMasters ( {' '.join(ions)} );
}}

propertyMethods
{{
    aqueousActivity electrolyte.{model};
}}
"""
open(pd, "w").write(manifest)

# propsDict: SINGLE model -> drop the per-op activityModel (package governs);
# CONTRAST -> keep it (explicit override).  Always: totals -> analyticalTotals.
if not contrast:
    txt = re.sub(r'[ \t]*activityModel\s+[A-Za-z]+;[ \t]*\n?', '', txt)
txt = re.sub(r'\btotals(\s*\{)', r'analyticalTotals\1', txt)
open(ps, "w").write(txt)
tag = f"CONTRAST ref={model} ({'/'.join(models)})" if contrast else f"model={model}"
print(f"migrated {case}: {tag}, masters=({' '.join(ions)})")
