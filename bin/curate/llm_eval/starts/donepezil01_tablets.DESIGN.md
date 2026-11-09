# DESIGN.md -- donepezil hydrochloride 10 mg film-coated tablets (round 1, approved by the student)

## 1. Goal
A tablet plant: 150 million 10 mg tablets a year (43 535 kg of packaged tablets, 0.29023 g each), lots of 300 kg of final blend.

## 2. Components
donepezilHydrochloride (API, bought), lactoseMonohydrate, maizeStarch, microcrystallineCellulose, hydroxypropylCellulose (binder), magnesiumStearate, hypromellose, polyethyleneGlycol, talcPowder, titaniumDioxide, yellowIronOxide, water, N2, O2.

## 3. Thermodynamics
Solids are placeholders (mass-balance boxes); water and air through the case's own property records.

## 4. Topology
Wet granulation train (binder, granulator, fluid-bed dryer, mill), final blender, tablet press, aqueous film coat, packaging line. Inlets: the *Feed files and the water and air feeds in 0/. Product: packagedTablets.

## 5. Specification per unit
The flowsheet is the balance per unit of product at a basis of 720 000 tablets/h pressed; every feed in 0/ is that tablet's formula at the basis. The batch plan, rated machines, costing and economics are in system/postDict.

## 6. Expected results
About 100 lots a year of 300 kg, the fluid-bed dryer and the packaging line pacing the two trains, every machine under its rating.

## 7. Left out
No machine physics (granulation end point, content uniformity, compression force, dissolution); machines are checked for fit only.

## 8. Revisions
(none yet)
