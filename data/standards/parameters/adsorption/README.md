# Adsorption parameters — the pair catalogue

`equilibria/<adsorbent>/<species>.dat` — ONE record per (adsorbent ×
adsorbate) pair: the pure-component adsorption isotherm (forum #106 contract;
the adsorbent's intrinsic identity lives in `data/standards/adsorbents/`,
never the equilibrium).

Each record declares, mandatorily:

```
recordType      adsorptionIsotherm;
schemaVersion   1;
adsorbent       zeolite5A;            // must match its directory
adsorbate       CO2;                  // component short-name
model           langmuir;             // factory key: henry | langmuir
parameters      { q_max 4.8; b_298 7.0; dH_ads -38000; }   // model-specific
tRef            298.15;               // van't Hoff anchor [K]
loadingBasis    molPerKgAdsorbent;    // q basis (declared, engine-converted)
pressureBasis   partialPressureBar;   // p basis (b_298 is per bar)
provenance      { origin ...; method "..."; curation "..."; }
```

Models (`src/thermo/adsorbent/IsothermModel.{H,cpp}`):
* `langmuir` — `q = q_max·b(T)·p/(1+b(T)·p)`, `b(T) = b_298·exp(−dH_ads/R·(1/T−1/tRef))`;
  parameters `q_max` [mol/kg], `b_298` [1/pressure-basis], `dH_ads` [J/mol, <0].
* `henry` — `q = H(T)·p`, same van't Hoff form; parameters `H_298`
  [mol/kg per pressure-basis], `dH_ads` [J/mol]. The dilute-coverage limit:
  no saturation, no site competition.

The PSA assembles the COMPETITIVE (extended Langmuir) mixture form across the
records of one adsorbent: `q_i = q_max_i·b_i·p_i/(1+Σ_j b_j·p_j)`. A species
with no record adsorbs nothing (announced by construction: it reports fully
to the raffinate).

Joint multicomponent records (`<A>__<B>.system.dat`, forum #106) are reserved
for models genuinely fitted jointly (dual-site competitive, IAST inputs) —
none shipped yet.

Gate: `bin/curate/check_adsorption_tree.py` (EXIT 1 on embedded `isotherms{}`
in `adsorbents/*.dat`, or a record missing model/bases/provenance, or an
`adsorbent` key that contradicts its directory).

Shipped records are order-of-magnitude 298 K TEACHING fits migrated 1:1 from
the pre-2026-07-12 embedded blocks — re-fit from the primary source cited in
each record before trusting any design number.
