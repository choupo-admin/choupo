# Assets — physical equipment/material records, ONE flat home

Every `.dat` here is a piece of PHYSICAL kit a case can name: membranes,
construction materials, adsorbents, ion-exchange resins.  The folder is FLAT
(Migration 4, 2026-07-16); the `kind` field says which reader consumes the
record — one namespace, one consumer each:

| kind | consumed by | records |
|---|---|---|
| `RO` / `NF` | `MembraneRegistry` (solution-diffusion; SpiralWoundModule) | SW30HR, NF270, NF270_dspmde |
| `membraneModule` | `MembraneModuleRegistry` (the HARDWARE a membrane is deployed in: area, channel geometry, limits, rated test; `module <name>;` in SpiralWoundModule) | NF270-4040, SW30HR-380 (spiral elements), SEPA_CF (a flat-sheet laboratory cell) |
| `IEM` | the `electrodialysisStack` unit's own reader | CMX_AMX |
| `edStack` | `EDStackRegistry` (the electrodialysis HARDWARE the membrane pair is built into: cell pairs, active area, channel, spacer, hydraulic passes, the stack's OWN Sherwood correlation, limits; `stack <name>;` in `electrodialysisStack`) | EUR2C-7P18 (a bench stack), EurodiaED-100P-50 (an industrial stack) |
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

## `kind membraneModule` — the hardware, apart from the membrane

A membrane record (`kind RO | NF`) carries TRANSPORT (A_w, B_s) and knows
nothing about geometry; a module record carries the HARDWARE -- the active
area, the feed-channel height and spacer porosity, the leaf length, the
manufacturer's limits and the standard test the data sheet quotes -- and
knows nothing about transport.  A spiral element (`format spiralWound;`) is
wound with ONE membrane and names it; a laboratory flat-sheet cell (`format
flatSheetCell;`) takes any coupon, so the CASE declares `membrane` beside
`module`.  A cell has one membrane face over its channel (W = A/L); a
spiral leaf has two (W = A/(2L)); the engine reads the format and says
which it used.

**What the sheet does not state is an ESTIMATE, marked and announced**
(Vítor Geraldes, 2026-09-15: *"onde faltam parâmetros coloca um valor
educado, com uma nota a dizer que tem de ser verificado"*).  A value no
document gives carries `{ origin estimated; reviewStatus unverified; notes
"how to verify it"; }` in the record's `provenance {}`; the reader refuses
an estimate with no note or no review status, and the module announces
every estimate it reads on every run (`[estimate] module '...'`, and the
end-of-run caveat block).  A data-sheet value carries `origin literature`
with the sheet named, or no block at all -- it must never be marked an
estimate.  `bin/curate/check_membrane_modules.py` holds the three records
to a second transcription of their documents and runs each spiral's rated
test through the engine, printing the result beside the sheet's.  Record:
`docs/design/a-module-is-a-record.md`.

## `kind edStack` — the stack, apart from the membranes

An IEM record (`kind IEM`) carries a membrane PAIR's areal resistance,
thickness and counter-ion transport number and knows nothing about the stack;
a stack record carries the HARDWARE — how many cell pairs, how much active
area, the channel the diluate flows through, the spacer, the hydraulic
passes, the manufacturer's limits, and the mass-transfer correlation fitted
to *that* stack with *that* spacer — and knows nothing about the membranes
beyond naming the pair.

**`activeArea` is the CELL-PAIR area of the whole stack** (Vítor Geraldes,
2026-09-16: *a stack of 50 m² has 50 m² of anionic membrane AND 50 m² of
cationic membrane*).  The area per cell pair, the area per membrane kind and
the total membrane area are DERIVED by the engine and announced; a record
that stores any of them is refused, as is one that stores a `linearVelocity`
— the crossflow velocity is the diluate flow the unit already has, divided by
the channel section of the channels running in parallel, and the run prints
that arithmetic.  **`hydraulicPasses` is here and not in the case**: the pass
belongs to the equipment (the same ruling).

The `massTransfer {}` block is equipment-and-spacer data, never a universal
law: `Sh = a Re^b Sc^c` fitted to one stack, with the velocity basis it was
fitted on declared beside it.  Estimates follow the `kind membraneModule`
contract exactly — `{ origin estimated; reviewStatus unverified; notes "how to
verify it"; }`, refused without the note, announced on every run that reads
one — and reach ONE level into `limits {}` and `massTransfer {}`, because
that is where two of EUR2C-7P18's four estimates live.
**Two things a stack record may leave OUT, and both absences are facts.**  A
record whose source names no membrane pair does not name one, and the CASE
then declares `membrane <name>;` beside `stack` (the SEPA CF shape); declaring
one beside a record that DOES name a pair refuses instead, so the record
decides which way the refusal points.  And where nobody states the channel
width or its length, **exactly one of the two is stored** — the width, as the
estimate — and the length is `activeArea / (cellPairs × channelWidth)`,
derived and announced as derived.  Storing a back-calculated length beside a
back-calculated width is two homes for one guess, and the second reads like a
declaration.

A borrowed correlation carries the **Reynolds band it was fitted over**
(`massTransfer { validity { Re ( lo hi ); } }`) — equipment data like every
other validity window here — and the engine ANNOUNCES a run that leaves it
rather than refusing.  `bin/curate/check_ed_stack.py` holds both records to a
second transcription of their sources.  Record:
`docs/design/a-stack-is-a-record-and-its-limiting-current-is-predicted.md`.

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
