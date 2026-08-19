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
| `catalyst` | `CatalystRegistry` (pellet geometry, densities, `epsilon_p`, `tau`; consumed by the `thielePellet` props op) | *(none yet — see below)* |

Each registry scans this ONE folder and filters by its own kind(s); a record
with no `kind` is refused loudly.  Case-local tiers keep their author-facing
names (`constant/membranes/`, `constant/adsorbents/`, …) — the flat home is
the STANDARDS catalogue only.  Adsorbent identity here is intrinsic (name,
class, bulk density); anything pair- or sample-dependent lives in
`parameters/` or the case `constant/` (see the arity doctrine).

## `kind catalyst` — why this folder holds none yet

A catalyst pellet is an asset of exactly the same kind as an adsorbent, and
`CatalystRegistry` already scans this folder for `kind catalyst;`
(`docs/design/where-the-catalyst-pellet-lives.md`, 2026-08-18).  No record
lives here, and that is a curation position rather than an omission: every
value in `data/standards/` is expected to carry a PRIMARY citation, and the two
that matter most to a pellet's answer — the intraparticle porosity
`epsilon_p` and the tortuosity `tau` — were not sourceable to a primary when the
Thiele slice was built.  Attaching a citation that does not support them would
convert *unsourced* into *falsely sourced*, which neither a reader nor a gate
can detect.

So the reference case declares its pellet case-locally in `constant/assets/` and
labels it a TEACHING SURROGATE **in a parsed field** (`provenance.identity.origin
teachingSurrogate;`), which the engine announces on every run that reads it.
Promoting a real, cited catalyst here needs no code change.

**`D_eff` never goes on a catalyst record.**  An effective diffusivity belongs
to a (catalyst, species) pair at a temperature; on the asset it would be one
number standing silently for every species in the mixture.  A MEASURED value
lives at `parameters/diffusion/effective/<catalyst>/<species>.dat`; in the
ordinary case nothing is stored at all, because
`D_eff = (epsilon_p/tau)·D_molecular` is derived at the point of use and
announced with the rule that produced it.  `Catalyst::readIdentity` refuses a
record that embeds one — at either level of the file — the same way
`Adsorbent::readIdentity` refuses an embedded `isotherms{}` block.
