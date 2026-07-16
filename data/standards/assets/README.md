# Assets — physical equipment/material records, ONE flat home

Every `.dat` here is a piece of PHYSICAL kit a case can name: membranes,
construction materials, adsorbents, ion-exchange resins.  The folder is FLAT
(Migration 4, 2026-07-16); the `kind` field says which reader consumes the
record — one namespace, one consumer each:

| kind | consumed by | records |
|---|---|---|
| `RO` / `NF` | `MembraneRegistry` (solution-diffusion; SpiralWoundModule) | SW30HR, NF270, NF270_dspmde |
| `IEM` | the `electrodialysisStack` unit's own reader | CMX_AMX |
| `constructionMaterial` | `MaterialRegistry` (sizing / costing) | carbonSteel, SS304, SS316, aluminium |
| `adsorbent` | `AdsorbentRegistry` (identity only; the per-species isotherms are PAIR data under `parameters/adsorption/equilibria/<name>/`) | activatedCarbon, zeolite13X, zeolite5A |
| `ionExchangeResin` | the `exchange` props op / `IonExchanger` unit | SAC_Na |

Each registry scans this ONE folder and filters by its own kind(s); a record
with no `kind` is refused loudly.  Case-local tiers keep their author-facing
names (`constant/membranes/`, `constant/adsorbents/`, …) — the flat home is
the STANDARDS catalogue only.  Adsorbent identity here is intrinsic (name,
class, bulk density); anything pair- or sample-dependent lives in
`parameters/` or the case `constant/` (see the arity doctrine).
