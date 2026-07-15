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

models = sorted(set(re.findall(r'activityModel\s+([A-Za-z]+)', txt)))
if len(models) > 1:
    sys.exit(f"REFUSE {case}: {len(models)} activity models {models} -- model contrast, needs op->package.")
model = models[0] if models else "davies"

# union of ion keys across every totals{...} block
ions = []
for blk in re.findall(r'totals\s*\{([^}]*)\}', txt):
    for m in re.finditer(r'([A-Za-z0-9()]+)\s+[-0-9.]', blk):
        if m.group(1) not in ions:
            ions.append(m.group(1))

name = os.path.basename(case).replace("-", "_") + "_pkg"
manifest = f"""/*--------------------------------*- Choupo -*-----------------------*\\
  propertyPackage (INLINE, self-contained) -- the case's OFFICIAL dictionary.
  Multi-ion speciation SYSTEM: solvent water, the analytical basis measured in
  ions, and the {model} activity method.  The speciate ops carry only the
  ANALYSIS (analyticalTotals); no per-op model.  Replaces the degenerate water+ideal.
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

# propsDict: drop per-op activityModel; totals -> analyticalTotals
txt = re.sub(r'\s*activityModel\s+[A-Za-z]+;', '', txt)
txt = txt.replace("totals ", "analyticalTotals ").replace("totals{", "analyticalTotals{")
open(ps, "w").write(txt)
print(f"migrated {case}: model={model}, masters=({' '.join(ions)})")
