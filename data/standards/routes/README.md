# Routes — the tree of chemistry, one directed graph as records

Nothing in the engine reads this folder.  Its one consumer is the EduTool
*The tree of chemistry* (DEV.md 4c C191 A); its one gate is
`bin/curate/check_chemistry_graph.py`, wired into `bin/runTests`, which
re-reads every file here, balances every reaction with the engine's own
formula grammar (`src/thermo/ElementComposition.H`) against the engine's own
element table (`src/thermo/AtomicWeights.cpp`), and holds every substance and
route to the rules below.  The precedent is `../heuristics/`: a record kind
with no engine reader, held by a gate and a README.  Record:
`docs/design/the-tree-of-chemistry-is-a-record.md`.

## The message the graph carries (the architect's, not the curator's)

The hundred-odd commodity products grow from **seven organic roots**
(ethylene, propylene, the C4s, benzene, toluene, the xylenes, and synthesis
gas with methanol as its first derivative) and **four inorganic ones**
(ammonia, sulfuric acid, chlorine with caustic, the nitric and phosphoric
acids), and **the sustainable transition replaces the roots, not the leaves**.
The gate counts 7 + 4.

## Files

```
routes/
├── graph.dat         recordType routeGraph      the ONE header: roots, process
│                                                families, sources, production
│                                                volumes, and every SUBSTANCE
├── feedstocks.dat    recordType productionRoutes  feedstocks -> roots (crackers,
├── syngas.dat             "                       reformer, FCC, the separations)
├── olefins.dat            "                       ... one file per chapter; the
├── aromatics.dat          "                       split is EDITORIAL -- no fact
├── inorganic.dat          "                       is derived from which file a
└── transition.dat         "                       route lives in (the tree of 2050)
```

The graph is the union of every `productionRoutes` file that names the
header's graph (`graph treeOfChemistry;`).  A route's identity is its `name`,
unique across all files.

## A substance

```
{ name ethylene; label "ethylene"; component ethylene; }
{ name urea;     label "urea";     formula CH4N2O; cas 57-13-6; }
{ name PVC;      label "poly(vinyl chloride)"; component PVC; kind polymer; }
{ name naphtha;  label "naphtha (C5-C12 cut)"; cas 8030-30-6; kind lumped; }
```

| field | rule |
|---|---|
| `name` | the graph id; the catalogue's component name where one exists |
| `label` | what the tool prints |
| `component` | the catalogue record the formula and CAS are READ from.  A node that names one carries neither `formula` nor `cas`: **one home**, and the gate refuses a copy. |
| `formula` | only without `component`; the engine grammar (`ElementComposition.H`).  Quote it when it holds parentheses: `"Ca5(PO4)3F"`. |
| `cas` | only without `component`, and only where a CAS exists (a mixture may have one; a polymer class may not). |
| `kind` | `molecule` (default, omitted), `polymer` (the formula is the REPEAT UNIT; a polymerisation balances per unit), `lumped` (a cut or a mixture with no molecular formula: naphtha, coal, biomass, reformate, the crude C4 cut).  A lumped node may only FEED a `separation` or a `processYield` route, or appear in a slate -- never in a stoichiometry. |

**The role is not stored.**  A root is declared in the header; a feedstock is
a node no route produces; a product is a node no route consumes; everything
else is an intermediate.  Derived from the edges, the role can never disagree
with them.  The gate prints the census.

## A route

```
{
    name     ethyleneOxidation;
    kind     reaction;                   // reaction | separation | processYield
    target   ethyleneOxide;              // the substance the route is BUILT to make
    family   oxidation;                  // one of graph.dat's processFamilies
    era      incumbent;                  // incumbent | transition
    description "...";
    stoichiometry
    (
        { component ethylene;      nu -1; }     // nu < 0 reactants, nu > 0 products
        { component O2;            nu -0.5; }
        { component ethyleneOxide; nu 1; }
    );
    yield { basis carbon; band ( 0.80 0.90 ); origin assumed; reason "..."; }
    energy ( { route "..."; band ( 28 28 ); unit "GJ per t NH3"; origin literature; locus "..."; } );
    cycle    "...";                      // only on a route that closes a declared cycle
    cases    ( "tutorials/plant/hda" );  // Choupo cases that simulate the route
    provenance ( { source weissermelArpe2003; locus "ch. 7, 'Ethylene oxide'"; } );
}
```

| field | rule |
|---|---|
| `kind reaction` | a balanced stoichiometry on molecules and repeat units; the gate sums atoms per element to zero, requires the target among the products and at least one reactant. |
| `kind separation` | `feed <node>;` and a `yield` on a `mass` basis (kg target per kg feed); no stoichiometry. |
| `kind processYield` | `feed <node>;` and a `slate ( { component; massPerKgFeed ( lo hi ); origin; reason\|locus; } ... )`, the target among them, no `yield` block: the form of a steam cracker, a gasifier or a reformer, whose feed has no formula.  **The slate IS the forced co-production.** |
| `target` | the substance the route is built for.  Every other product is a **forced co-product** -- derived, never listed twice.  The DEPTH view walks TARGET arcs (reactant -> target); the CONVERGENCE view walks every product. |
| `family` | a word from `graph.dat`'s `processFamilies`, each with its meaning there (one home). |
| `era` | `incumbent` or `transition` (a route that replaces or displaces an incumbent route to a root -- the tree of 2050 draws the two side by side). |
| `yield` | `basis` carbon \| hydrogen \| nitrogen \| sulfur \| chlorine \| phosphorus \| mass, the basis element required in the target's formula; `band ( lo hi )`, 0 < lo <= hi, <= 1 on an atom basis; `origin literature` (with `locus`) or `origin assumed` (with `reason`).  **A number nobody read back is `assumed`, never a fact.** |
| `energy` | optional, only where a source states it: per-route bands with unit, origin and locus/reason. |
| `cycle` | the reason this route may close a cycle (ethylene <-> ethanol; CO2 -> CO; CO2 -> CH4; the balanced VCM plant's HCl).  The target graph minus the marked routes must be acyclic; a marked route must still lie on a cycle of the full graph, or the mark is a stale pin and fails. |
| `cases` | Choupo case directories (from the tree root) that simulate the route; every one must exist.  Never invent one. |
| `provenance` | a non-empty list of `{ source <id>; locus "..."; }`, each `source` declared in `graph.dat`.  An uncited route is refused entry. |

**Hydrogen per carbon is derived, never stored**: the gate (and the tool)
reads it off the stoichiometry (CO2 -> methanol 3, CO2 -> CH4 4).  What a
source STATES beyond the stoichiometry (energy per tonne) is stored under
`energy` with its locus.

## A source (in `graph.dat`)

```
{
    name          iea2018;
    citation      "IEA (2018), The Future of Petrochemicals, OECD/IEA, Paris";
    url           "https://www.iea.org/reports/the-future-of-petrochemicals";
    licence       ccBy4;                 // ccBy4 | ccBy3 | citedWork | publicDomain
    verification  checkedCopy;           // checkedCopy | bibliographicRecord | titleOnly
    verificationNote "PDF read 2026-11-01; page numbers are the report's own";
}
```

`licence` is the grant the SOURCE carries: `ccBy4`/`ccBy3` (text and figures
reusable with attribution -- the IEA's reports since their relicensing, and
two open-access papers), `citedWork` (a copyrighted work named as the
reference for a FACT: a title or a DOI is a citation, a copied table is not),
`publicDomain` (a government work).  `verification` says how well the
citation itself is known: `checkedCopy` (opened and read), `bibliographicRecord`
(title, authors, journal, volume, pages corroborated against the Crossref
record of the DOI on the date noted; the paper not opened), `titleOnly` (a
textbook or encyclopaedia named by title as the standard reference for the
route; no page claimed).  A source nobody cites fails.

**Not used, by the licence policy (CLAUDE.md sections 7 and 10):**
industry-association statistics.  Checked 2026-11-01: the American Chemistry
Council's terms permit non-commercial use only (excluded regardless of
copyleft); Cefic's and Plastics Europe's terms pages could not be retrieved
and state no grant that was found, so they are no-grant.  The only market
numbers here are the IEA's, under CC BY 4.0, each with its page.

## What the gate does NOT check

Whether a yield band is TRUE of its route; whether a locus is right; whether
the route list is COMPLETE.  Nearly every band here is `origin assumed` -- the
curator's typical band for the route as taught in the works named, with the
reason that says so -- and the census line counts them, so nobody can read
them as measured.  Replacing an `assumed` band by a `literature` one is a
curation act: read the page, cite it as `locus`, and the gate holds the
record to the new word.
