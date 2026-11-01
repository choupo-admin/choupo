# The tree of chemistry is a record

*DEV.md 4c C191 (A), the graph's curation -- 2026-11-01.  Home
`data/standards/routes/` (its README is the grammar); gate
`bin/curate/check_chemistry_graph.py`; no engine change, no GUI, no lesson:
the EduTool that draws it is the next general's.*

## 1. The commission

The architect's message for the EduTool *The tree of chemistry*: the
hundred-odd commodity products grow from SEVEN organic roots (ethylene,
propylene, the C4s, benzene, toluene, the xylenes, synthesis gas with
methanol as its first derivative) and FOUR inorganic ones (ammonia, sulfuric
acid, chlorine with caustic, the nitric and phosphoric acids), and the
sustainable transition REPLACES THE ROOTS, not the leaves.  Three views of
one directed graph: DEPTH (a product back to its roots, mass and carbon on
every edge), CONVERGENCE and FORCED CO-PRODUCTION (what a root or a cracker
produces whether the market wants it or not), and THE TREE OF 2050 (for each
root the fossil route beside the alternatives).  "DATA is the whole work":
a curated graph record under `data/standards/` with a citation per edge from
open, citable sources, licence-checked.

## 2. The decision: one graph, two record types, a gate, and nothing derived twice

**Where.**  `data/standards/routes/`, a sibling KIND beside `heuristics/`,
which is the precedent: a record kind no engine reads, held by a gate and a
README (*zero physics in TypeScript* applied to a graph: a route hard-coded
in a component is a claim with no author and no way to check it).  It is not
under `chemistry/` -- that folder is REAL EQUILIBRIA with logK and dH, read by
the speciation builder, and a production route is not an equilibrium.

**What.**  ONE header (`recordType routeGraph`, `graph.dat`) holds the roots,
the process-family vocabulary, the sources, the production volumes and every
substance; the routes live in `recordType productionRoutes` files split by
chapter (feedstocks, syngas, olefins, aromatics, inorganic, transition).  The
split is editorial: no fact is derived from which file a route lives in, and
the gate reads the union.

**The arity decisions, each one a field NOT written:**

* A node's ROLE (feedstock | root | intermediate | product) is not stored.  A
  root is declared once; the rest is read off the edges (no inbound arc =
  feedstock, no outbound = product).  Stored, it would be a second home that
  goes false the day a route is added.
* A node with a catalogue component carries neither formula nor CAS: both are
  READ from `components/<name>.dat`, and the gate refuses a copy.  Only the
  substances the catalogue does not hold carry their own (urea, formaldehyde,
  MTBE, the polymers' repeat units, the lumped cuts' CAS where one exists).
* FORCED CO-PRODUCTS are not listed.  A route names its `target`; every other
  product of its stoichiometry (or every other member of its slate) is a
  forced co-product by derivation.  The Hock cleavage says `target phenol;`
  and the acetone follows.
* HYDROGEN PER CARBON is not stored.  The gate and the tool read it off the
  stoichiometry (CO2 -> methanol 3, CO2 -> CH4 4, rWGS 1).  What a source
  STATES beyond the stoichiometry -- energy per tonne -- is stored under
  `energy` with its locus, and only where a source states it.
* A SOURCE is declared once, by id, with its licence and its verification
  word; a route cites the id and adds a locus.  A source nobody cites fails.

**The three route kinds** are the honest answer to "balance every edge":
a steam cracker, a gasifier, a reformer, a lignin depolymerisation take a
feed with no molecular formula.  `kind reaction` balances atoms;
`kind separation` is a mass yield of one target from a feed; `kind
processYield` is a mass SLATE on a lumped feed -- and the slate IS the
cracker's forced co-production, stated as kg per kg of naphtha with its
origin.  A lumped node may appear nowhere else.  Synthesis gas is not a node:
the root is the pair CO + H2 (with methanol), reforming and gasification
produce the two molecules, and methanol synthesis consumes them -- a lumped
"syngas" would have made the best-known chemistry in the graph unbalanceable.

**Cycles.**  The DEPTH view walks target arcs backwards; a cycle there is a
view that never ends.  So the target graph minus the routes marked
`cycle "<why>"` must be acyclic, and a marked route must still lie on a
cycle of the FULL graph (reactants -> every product) or its mark is a stale
pin and fails.  Four are marked today: ethylene <-> ethanol (hydration and
dehydration are both practised), CO2 -> CO (the reverse shift against the
shift), CO2 -> CH4 (power-to-gas closes the loop the reformer opens) and the
oxychlorination that consumes the HCl the EDC cracker returns.

**The ammonia edge is written once.**  Fossil ammonia is N2 + 3 H2 fed by
reforming and shift; green ammonia is the same edge fed by electrolysis.  The
graph says what the architect said: the transition replaces the root, and
the leaf does not move.  The same holds for every hydrogenation and for
methanol: `CO2 + 3 H2` sits beside `CO + 2 H2` as a transition route to the
same node, and everything downstream of methanol -- formaldehyde, acetic acid,
MTO olefins, MTA aromatics -- is then made from CO2 and electricity without a
single downstream edge changing.

## 3. Rejected

* **A `role` field on each node.**  Derivable; would disagree with the edges.
* **A `coProducts ( ... )` list on each route.**  Derivable from the
  stoichiometry minus the target; two homes for one fact.
* **A lumped `syngas` node fed by `processYield` reforming edges.**  Would
  have left SMR, shift and methanol synthesis unbalanced -- the chemistry a
  student must be able to check by hand.
* **Yield bands typed as facts.**  Every band the curator did not read back on
  a page is `origin assumed` with the reason that says so, and the gate's
  claim line counts them (189 of 189 on the day it was built: NO yield band
  here is a literature value).  Inventing a locus would convert *unsourced*
  into *falsely sourced*, which no reader and no gate can detect.
* **Industry-association production statistics.**  Checked 2026-11-01: the
  American Chemistry Council's terms grant non-commercial use only (excluded
  regardless of copyleft, CLAUDE.md section 10); Cefic's and Plastics Europe's
  terms pages returned 404 and no grant was found, so they are no-grant.  The
  only market numbers are the IEA's five, each with its page.
* **The `.dat` files generated at build time from a Python table.**  The
  committed artefact is the record a human curates and reviews (Nycolle Braga
  Caetano is named as the graph's reviewer); the author's editor script stayed
  outside the tree.
* **A `secondaryTarget` for co-produced roots (NaOH beside Cl2).**  NaOH is
  made by no route built for it, and that is the point of the chlor-alkali
  root; the gate prints it in the co-product-only census instead.

## 4. What the record holds (measured by the gate on 2026-11-01, which recounts)

157 substances (14 feedstocks, 11 roots with 19 members, 77 intermediates, 47
leaves); 168 routes (140 reactions, 18 separations, 10 process yields; 144
incumbent, 24 transition); 18 sources; 5 production volumes; 51 links to 44
distinct Choupo cases; 4 cycle-marked routes.  Every reaction balances on
`src/thermo/AtomicWeights.cpp`'s element table under the
`ElementComposition.H` grammar -- and building the gate found two of the
author's own equations wrong before any reader saw them (the phenol
hydrogenation short of one H2; a carbon-basis yield on a hydrogen target).

## 5. Sources and their licences

| id | work | licence | verification |
|---|---|---|---|
| iea2018 | IEA, *The Future of Petrochemicals* (2018) | CC BY 4.0 (the report page, read 2026-11-01; the 2018 PDF's front matter predates the relicensing and still says "subject to specific restrictions") | checkedCopy -- the PDF read; pp. 24-25 for the seven primary chemicals, 185 Mt/yr ammonia, 100 Mt/yr methanol, 255 Mt/yr ethylene + propylene, 110 Mt/yr BTX; p. 32 Fig. 2.5 for the HVC slates; p. 52 for urea's 0.73 t CO2 |
| ieaAmmonia2021 | IEA, *Ammonia Technology Roadmap* (2021) | CC BY 4.0 | checkedCopy -- the executive-summary page: 41 GJ/t average, 28 (gas) / 36 (coal) GJ/t best available, 2.4 t CO2/t, > 70 % from gas |
| ieaHydrogen2019 | IEA, *The Future of Hydrogen* (2019) | CC BY 4.0 | checkedCopy -- the report page: ~70 Mt/yr dedicated hydrogen |
| weissermelArpe2003, chauvelLefebvre1989, ullmanns, kirkOthmer, moulijn2013, obrien2005 | the textbooks and encyclopaedias | citedWork | titleOnly -- named as the standard reference for the route; no table, no page |
| ren2006, tian2015, zhangYu2013, sattler2014, perezFortes2016, zakzeski2010, huber2006 | the reviews (DOIs in the record) | citedWork | bibliographicRecord -- Crossref record of each DOI read 2026-11-01 |
| amghizar2017 | Amghizar et al., *Engineering* 3 (2017) 171 | CC BY 4.0 (per Crossref) | bibliographicRecord |
| smith2020 | Smith, Hill & Torrente-Murciano, *Energy Environ. Sci.* 13 (2020) 331 | CC BY 3.0 (per Crossref) | bibliographicRecord |

The IEA's attribution form (`https://www.iea.org/terms/creative-commons-cc-licenses`,
read 2026-11-01): "IEA (year), Title, URL, Licence: CC BY 4.0", no implied
endorsement, a derived work carries its own disclaimer, no logos.  Every IEA
entry in `graph.dat` carries the URL and the licence word.

## 6. What could not be sourced and was left out, or marked

* **Every yield band** is `assumed` (section 3).  The two publisher sites that
  hold the reviews refused the fetch (HTTP 403), so no abstract number was
  read; the Crossref records corroborate the citations and nothing more.
* **Energy per tonne of ethylene by feedstock** (Ren 2006) and **electrolyser
  consumption per kg H2** are `origin assumed` with the review or report named
  as where to read them back; the only `literature` energy figures are the
  four IEA ammonia ones.
* **No cumene case exists in the tree.**  C191 says "cumene, methanol, ammonia
  exist"; a grep of every `controlDict` finds ammonia (nine cases), methanol
  (two), acetic acid, HDA, the acetone process, esterification, the Claus
  stage, WGS and reforming -- and no cumene.  The three cumene edges link no
  case.  A `cumene01` is a candidate for the plant tier.
* **Not in the graph**, said plainly: Fischer-Tropsch beyond one representative
  edge; the ethoxylates, alkyd and epoxy resins, polyurethane as a polymer
  (TDI and MDI are its leaves), titanium dioxide, the chlorinated solvents
  beyond methyl chloride, carbon black, hydrazine, methylamines, the higher
  glycols, isophthalic acid, ABS as a terpolymer, and any specialty.  A graph
  check cannot see a missing route; the README says so.

## 7. The sabotages (by hand, on the live files, restored by copy)

| | sabotage | verdict |
|---|---|---|
| S1 | `nu -0.5` -> `nu -1` on `ethyleneOxidation` | FAIL: `does not balance: O  reactants 2 vs products 1` |
| S2 | the `provenance` list of `hockCleavage` emptied | FAIL: `cites no source -- an uncited route is refused entry` |
| S3 | the `cycle` mark removed from `ethyleneHydration` | FAIL: `the target graph has an undeclared cycle: ethylene -> ethanol -> ethylene` |
| S4 | `cases ( "tutorials/plant/cumene01" )` on `benzenePropylation` | FAIL: `names a Choupo case that does not exist` |
| S5 | `formula C2H4;` typed on the `ethylene` node | FAIL: `carries formula although it names a component -- the record is the one home` |

The outputs are quoted in the gate's docstring; each was observed, not
predicted.

## 8. For the tool's author

* Read the records as `columnControlRecords.ts` reads `heuristics/`: a Vite
  raw-glob over `data/standards/routes/*.dat` and the GUI's dict parser; the
  header is the file with `recordType routeGraph`.
* Resolve a node's formula and CAS through `component` into the catalogue
  reader the Explorer already has; the graph carries them only where the
  catalogue does not.
* The DEPTH view walks target arcs (`target`) backwards to the declared roots
  and the feedstocks; mass per kg of the product comes from the stoichiometry
  and the molar masses (the catalogue's MW where there is a component, the
  formula otherwise) divided by the yield band -- show the band, never a point.
* The CONVERGENCE view walks every product (stoichiometry and slate); a
  co-product is any product that is not the route's target.
* THE TREE OF 2050 groups routes by the root they produce and `era`; hydrogen
  per carbon is `-nu(H2) / (nu(target) * C atoms of target)`; energy per tonne
  is the `energy` list, with its origin word shown.
* Every `origin assumed` band must be drawn as the curator's band, with its
  reason reachable; the census line in the gate's claim says how many.
* A route's `cases` are the case directories to open; the lesson's `file:line`
  citations into the engine belong beside them.
* Add a route by adding a block; add a substance by adding one line; run the
  gate.  Nothing else in the tree knows the graph exists.
