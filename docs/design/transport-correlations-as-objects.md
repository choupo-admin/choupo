# Correlations as first-class objects — the transport families

*Record of the 2026-09-05 slice (task #91), and — in §8 — of its
2026-09-06 continuation (task #93 step 7b), the Chapman-Enskog campaign §7
named.  Engine:
`src/thermo/transport/` (all eight models, `GasMixingRules.{H,cpp}`,
`CorrelationVerify.H`), `src/thermo/ThermoPackage.cpp`,
`src/propertyOps/TransportBench`, `src/unitOperations/heatTransfer/SprayDryer.cpp`,
`src/unitOperations/membrane/SpiralWoundModule.cpp`,
`bin/curate/check_source_licence.py`.  Witness:
`tutorials/props/transport/transport01_gas_bench`.  Gate:
`bin/curate/check_transport_correlations.py`.  Predecessor:
[`correlations-as-objects.md`](correlations-as-objects.md) (the friction
family, 2026-08-25), whose §8 named this as the next slice.*

---

## 1  Facts, verified before anything was written

`src/thermo/transport/` already carried: Chung (gas μ, with the Neufeld 1972
collision-integral fit evaluated at Chung's T\* = 1.2593 T/T_c), Eucken
(gas k), Fuller (gas D_AB), Andrade / Vogel / chemsepEq101 (liquid μ),
SatoRiedel / chemsepEq16 (liquid k), WilkeChang (liquid D°), BrockBird
(σ), the IAPWS water transport release; and, in `ThermoPackage.cpp`, Wilke
mixing for μ and Wassiljewa / Mason-Saxena mixing for k — **with the same
φ_ij typed twice, sixty lines apart** — and Grunberg-Nissan with G_ij = 0.

Of the component records, **0 carry Lennard-Jones σ / ε/k, a Sutherland
constant S, a dipole moment or a measured critical volume.**  So
Chapman-Enskog and Sutherland were not buildable without inventing data,
and they were not built.  §7 names what building them requires.

Every model was correct.  None stated its window, cited its primary at run
time, or proved anything about itself; the citations lived in comments.

## 2  Four silences around the layer, found by reading

None was a failing case.  All four were the kind of thing a gate can see
and a golden cannot:

1. **The Theory Guide taught a grammar that did not exist.**  Its
   "Data-file extension" listing showed `viscosityGas { model Sutherland;
   coefficients (mu0 T0 S); }` and `lennardJones { sigma; epsOverK; }` —
   keys no engine reader ever parsed — beside `viscosityLiq { model
   Andrade; coefficients (A B); }`, which is not how a record declares
   Andrade either (`liquidViscosity { andrade { A; B; } }` is).  Its
   roadmap table listed Sato-Riedel as "v1.x roadmap" a year after it
   shipped, its transport-map figure named Sutherland/Chapman-Enskog as the
   gas correlation Choupo uses, and a subsection titled *modified Eucken*
   described a model the engine does not register.
2. **Chung did two things the 1988 paper does not, and said so only in a
   comment.**  It ESTIMATES V_c from Z_c = 0.2918 − 0.0928 ω (no record
   carries a critical volume) and DROPS the polar (μ_r) and association (κ)
   terms of F_c, applying the non-polar form to water, ammonia and every
   other polar component alike.  Its header cited RPP 4th ed. as the source
   and did not name Chung, Ajlan, Lee & Starling (1988) at all.
3. **The spray dryer "reported the kinetics as zero"** when the case
   declared no transport model — `tau_dry_constant = 0`, Re = 0, h = 0, exit
   0, a plausible KPI row for a drying time nothing computed.  A second
   silence sat forty lines above: a `catch (const std::exception&)` around
   `thermo.viscosityLiquid` that, when a DECLARED liquid-viscosity model
   could not price the feed, kept the 1e-3 Pa·s water knob and a source
   string naming a model that was not running.
4. **The membrane module hard-coded `mu_feed = 1e-3` and `D_solute =
   1.6e-9`** for every feed — a glucose NF, a Pitzer brine — unless a
   sub-block overrode them, and said nothing.

And one beside them: **ChemSep is an accepted source only because the
importer's header comment says so.**  `check_source_licence.py` had never
heard the name.  Had the importer been deleted the 356 records naming
ChemSep would have gone on passing a gate with no rule about them.

## 3  What was built, in the order the brief fixed

### 3a  Honesty first (no number moved)

* **Theory Guide** — the listing replaced with the grammar the engine reads
  (`transport { vapour { viscosity { model Chung; } thermalConductivity {
  model Eucken; } diffusivity { model Fuller; } } liquid { viscosity {
  model Andrade; } } }`, and the record's `liquidViscosity { andrade { A;
  B; } }`), with a sentence recording what the earlier printing showed and
  that no reader ever existed; Sato-Riedel marked as shipping; Chapman-Enskog
  kept as future WITH the reason (no σ/ε in any record); the Sutherland and
  Chapman-Enskog subsections kept as THEORY and each given a *Status: NOT
  implemented* paragraph; the figure node and caption corrected; the Eucken
  subsection retitled and told which form ships.  `theoryGuide.pdf`
  rebuilt.
* **Chung** cites Chung, Ajlan, Lee & Starling, Ind. Eng. Chem. Res. 27(4),
  671-679 (1988) as PRIMARY, RPP 4th ed. eq. 9-4.10 as the route, Neufeld,
  Janzen & Aziz, J. Chem. Phys. 57, 1100 (1972) for Ω_v; and ANNOUNCES,
  through `AdvisoryLog` once per component per run, that V_c was estimated
  from Z_c(ω) and that the polar/association terms were dropped.  The
  announcement names the component; a spray dryer's suspended sucrose is
  no longer among them, because `viscosityGas` now evaluates only species
  with y > 0 — which the rule always skipped, so no number moved.
* **SprayDryer** — no transport model → REFUSES by name with the remedy
  (every one of the nine corpus dryer cases declares `viscosity { model
  Chung; }`, checked case by case, so no golden depended on the zero); k
  and D still optional, their absence ANNOUNCED (Nu = Sh = 2, pure
  conduction) rather than refused, because that is a coarser model, not an
  absent one.  The `catch(...)` is gone: a declared liquid model that cannot
  price the feed REFUSES quoting the package's reason and says it will NOT
  substitute water.  No corpus dryer declares a liquid model, so nothing
  moved.
* **SpiralWoundModule** — the two constants stay (eleven membrane goldens
  plus optim04) and are ANNOUNCED as `[legacy] ... ASSUMED` with the remedy;
  a value declared in the sub-block wins; a declared `liquidViscosity` /
  `liquidDiffusivity` transport model is honoured and announced with the
  model.  No membrane case declares liquid transport (checked), so the
  model route moved nothing.
* **check_source_licence** — `ACCEPTED_DATABANK = {"ChemSep": Artistic-2.0,
  importer}`; a known databank name in an authority field is compliant only
  through that table; the importer's `LICENSE` constant must agree; a row no
  record cites FAILS (a row that pins nothing is the `check_true_ions`
  shape); the OK line names the acceptance and the count.

### 3b  Objects

`TransportModel`, `ThermalConductivityModel`, `DiffusivityModel`,
`LiquidViscosityModel`, `LiquidConductivityModel` gain **pure** virtuals
`validityWindow()`, `citation()`, `verify()` (returning the shared
`CorrelationVerify`, which carries the anchor's KIND), so a model registered
without them does not compile.  Each model's arithmetic moved into a
public static `kernel(...)` the hot path calls — one home, reachable by
`verify()`, the bench and the gate without a `Component`.  The two gas
bases also gain a non-pure `windowNote(component, T)` for a computable
verdict at a point.

The φ_ij lives once, in `gasMixing::wilkePhi` / `wilkeSum`, called by both
`viscosityGas` and `thermalConductivityGas` — the same expression in the same
order, so the 41 transport-declaring cases and every membrane golden are
unmoved (checked by running them, and by the full suite).

### 3c  The anchors, and what each actually tests

The catalogue holds **no measured viscosity, conductivity or diffusivity**.
Every anchor is therefore one of two kinds, and the bench prints which:

| model | anchor | kind | what it tests |
|---|---|---|---|
| Eucken | monatomic gas, Cp = 5R/2, must give **exactly** (15/4) R μ / M (Chapman & Cowling) | theory | the 5R/4 is the constant that makes the formula contain the rigorous limit; a wrong constant fails |
| Wilke φ_ij | φ_ii = (1+1)² / √16 = 1 for identical species, any η and M | theory | the exponents ½, ¼ and the 8 |
| Chung | Neufeld Ω_v(T\* = 1) = 1.59252, the fit's own three-term value as a literal | arithmetic | transcription of the collision-integral fit |
| Fuller | M_A = M_B = 4, Σv = 1, T = 100 K, P = 1 bar → 1.43e-7 × 10^3.5 / 8 | arithmetic | transcription and the cm²→m², Pa→bar chain |
| Andrade | exp(A + B/T) at the water record's own A, B, 298.15 K | arithmetic | transcription of the form |
| Vogel | C = 0 reduces EXACTLY to `Andrade::kernel` | arithmetic | a claim the header had always made, now checked against the other model's code |
| chemsepEq101 | C = D = E = 0 reduces EXACTLY to `Andrade::kernel` | arithmetic | the five-parameter form contains the two-parameter one |
| SatoRiedel | at T = T_b the bracket ratio is 1, so λ = 1.1053/√M whatever T_c | arithmetic | the bracket structure (Tr vs Tbr) |
| chemsepEq16 | B = C = D = E = 0 → A + 1 | arithmetic | the additive constant sits OUTSIDE the exponential |

**Fuller's paper worked example was NOT used as an anchor.**  The brief
allowed it only if the number could be cited; the paper was not in hand,
so the anchor is arithmetic and says so.  Likewise Sato-Riedel's citation
names RPP eq. 10-9.1 as the ROUTE and states that the primary attributions
inside it were not re-read — rather than restating Riedel's page numbers as
if they had been.

### 3d  The bench and its witness

`transportBench` (choupoProps): the verify table (window, primary citation,
anchor, kind, [PASS]) for every registered model in the five families plus
the mixing rule; then, with `compare { T; P; }`, every gas model for every
component with its computable window verdict, the mixture μ (Wilke) and k
(Wassiljewa / Mason-Saxena) through the package's own functions at an
announced composition, and the spread across models per family.  **It
never ranks.**

Witness `transport01_gas_bench` — N2, O2, CO2, water at 373.15 K, 1 bar;
header's first sentence: *nothing in this case is measured.*  What it
shows:

```
  spread across gas-viscosity models (worst component)    = 0.00 %  (1 model(s) registered)
  spread across gas-conductivity models (worst component) = 0.00 %  (1 model(s) registered)
  A SPREAD OVER ONE MODEL IS NOT AGREEMENT -- it is the absence of a second opinion.
```

That line is the honest state of the transport layer: one model per gas
family, so the disagreement the friction bench teaches with cannot yet be
shown here.  The bench says so rather than printing a 0 that reads as
consensus.  Also visible: four Chung announcements (one per gas, water
included), and four `APPROXIMATION HERE` flags from Eucken — every witness
gas is polyatomic by its own record's Cp, and plain Eucken is exact only
for a monatomic one.

## 4  The gate, and what firing it found

`check_transport_correlations` recomputes Chung μ, Eucken k, Wilke μ_mix and
Wassiljewa k_mix for the four gases **from the sealed records** (MW, Tc, Pc,
ω, the Cp polynomial) — never from the log — and agrees with the engine to
1e-9; recounts the anchor kinds from the printed lines; requires the
spread sentence while one model is registered and its ABSENCE once two are;
checks Chung's two announcements on water in the caveat block and the JSON;
refuses the guide a `model Sutherland;` / `lennardJones {` / `viscosityGas
{` example while the engine has no reader (an arm designed to relax the day
one exists); builds two copies of sprayDryer01 — transport stripped, and a
declared Andrade the sucrose cannot serve — and requires each to refuse
naming why; requires membrane01's `[legacy]` announcement; reads
`ThermoPackage.cpp` for a private φ_ij (no output arm can see a second home
that agrees); and holds the witness, sprayDryer01 and membrane01 to their
goldens through `runtests_verdict`.

Four sabotages by hand, on outputs and inputs, never on source; the gate's
docstring quotes the observed lines.  Two things they taught:

* **S3 — a sealed record edited under the witness ran to exit 0.**  Water's
  ω changed 0.3449 → 0.30 inside the witness's own `constant/components/`;
  the run printed no seal divergence, refused nothing, and produced a moved
  μ.  Arm (b) stayed silent, CORRECTLY — it reads the record the engine
  read, and both moved together — and arm (k) caught it through the golden.
  So the recount is record-derived (which is what it claims) and the golden
  is what guards a drifting record.  **The seal's silence on a changed
  mirrored value is a FINDING outside this slice**, recorded here for
  Vítor: whether `sealSchema computational` should have announced or
  refused is a seal question, not a transport one.
* **S4 — arm (g) said "cannot run" rather than passing.**  With the shipped
  dryer's transport block stripped, the arm that strips a copy had nothing
  to strip and refused to claim a refusal it could not have caused.

## 5  What did NOT change

Every number.  The 41 cases declaring a transport block, the 12 membrane
cases and the 9 spray-dryer cases reproduce their goldens; the full suite
is the record of that.  The seal did not change physics: the witness was
sealed by `bin/choupo-import` and its golden recorded on the sealed run.

## 6  What this does NOT establish, said plainly

* **No correlation here is checked against a measurement.**  Seven anchors
  are the correlation's own closed form; two are identities.  The gate's
  OK line says so.
* **Only one model per gas family is registered**, so the bench cannot yet
  show a disagreement; the witness's spread column is 0 and labelled as
  meaning nothing.
* **Wilke-Chang** (liquid D°) and **BrockBird** (σ) gained no
  window/citation/verify in this slice; they remain the next members.
* Fitted liquid models (Andrade, Vogel) declare no `Trange` in this
  catalogue, so leaving their fitted range is not announced — a gap in the
  RECORDS, stated in each model's window string rather than hidden by it.
* Whether a basis string or a window string is TRUE of its correlation is
  not gated; it is read.

## 7  The curation campaign this names and does not start (RUN on 2026-09-06 — see §8)

Chapman-Enskog (gas μ and D_AB from Hirschfelder, Curtiss & Bird 1954, Ω
from the Neufeld fit — which would leave `ChungViscosity.cpp` for ONE shared
home both models call) and the modified Eucken need Lennard-Jones σ and
ε/k on the records.  **Those numbers are not to be typed from memory or
from a secondary table.**  The named source is Svehla, R. A. (1962),
*Estimated viscosities and thermal conductivities of gases at high
temperatures*, NASA TR R-132 — a US-government work in the public domain,
σ [Å] and ε/k [K] for ~200 species; HCB 1954's tables cite their own
sources per gas.  The campaign: transcribe with page numbers into a
reviewable table under `bin/curate/`, match to `data/standards/components/`
by CAS and then by formula — NEVER by name — write proposals to
`data/local/` as `lennardJones { sigma <v> A; epsOverK <v> K; fitBasis
viscosity; provenance { source "Svehla 1962, NASA TR R-132, Table ..."; page
N; } }`, and report coverage: matched, unmatched, and which records are
nonvolatile and must NOT receive gas-phase LJ parameters.  Promotion is
Vítor's review.  Sutherland ships only if a primary source for S per gas can
be cited; otherwise it stays out and the record says why.

Step 7 of the brief (the fetch from NTRS) is reported separately; if the
network refuses, the PDF goes under `thirdParty/` and the campaign starts
from there.

## 8  Rejected alternatives

* **Ranking the models, or a single headline spread** — the friction
  record's rejection, inherited.
* **Anchoring Fuller on its paper's worked example without the paper** —
  a number that cannot be cited is not an anchor.
* **Announcing the spray dryer's missing transport model instead of
  refusing** — every corpus case declares one, so nothing depended on the
  zero, and a drying time of zero at exit 0 is exactly the plausible wrong
  answer the doctrine exists to end.  k and D absent IS announced, because
  Nu = Sh = 2 is a model, not an absence.
* **Rebasing the membrane constants on the package** — would move eleven
  goldens for a change that is about saying, not computing.  Announce;
  honour a declared model; keep the values.
* **Inventing σ/ε/k or S to build Chapman-Enskog and Sutherland now** —
  the brief's own words: a curation campaign, not this slice.
* **A second `viscosityGas`/`lennardJones` grammar to make the guide true**
  — the guide is corrected to the engine, never the engine bent to a
  listing.

---

## 8  Chapman-Enskog from Svehla's constants (2026-09-06, task #93 step 7b)

*Engine: `src/thermo/transport/NeufeldOmega.{H,cpp}`, `ChapmanEnskog.{H,cpp}`,
`ModifiedEucken.{H,cpp}`, `Component.{H,cpp}` (the `lennardJones {}` reader),
`core/Origin.H`, `CorrelationVerify.H`, `TransportBench.cpp`.  Data:
`bin/curate/svehla1962/` (the one committed transcription) and
`bin/curate/propose_lennard_jones.py`.  Witness:
`tutorials/props/transport/transport02_chapman_enskog`.  Gate:
`check_transport_correlations` (extended), `check_source_licence` (a new
class), `check_origin_census` (a new word).*

### 8.1  Facts, verified before anything was written

* The source §7 named was fetched and put under `thirdParty/svehla/`
  (gitignored): Svehla, R. A. (1962), *Estimated viscosities and thermal
  conductivities of gases at high temperatures*, NASA TR R-132 — a US
  government work, public domain.  Table I(a) (211 rows, 206 molecules) was
  transcribed **from the page image**, every row marked `verified image`;
  the OCR text dump served only to find the pages.
* Svehla's method section was READ, not remembered.  His eq. (1), report
  page 2: η×10⁶ = 26.693 √(MT) / (σ² Ω^(2,2)*), micropoise, M in g/mol, σ in
  Å.  His eq. (2), report page 3: λ = (R/M)[15/4 + 1.32(C_p/R − 5/2)] η — the
  **modified** Eucken, with eqs. (3)/(4) splitting it into translational and
  internal parts; appendix B derives it.  His Ω values came from the
  Hirschfelder 1954 tables ("reference 1, pages 1126-1127"), his conversion
  table (Table II, report page 26) uses 1 g-cal = 4.185 J.
* **The Neufeld Ω^(1,1)\* coefficients are in no source in the tree** (grep
  for 1.06036 / 0.15610 / 1.52996: nothing).  The brief's rule — take them
  only from a source with the number in hand — therefore closes the
  Chapman-Enskog binary DIFFUSIVITY: **not built**, and `NeufeldOmega.H`
  says so and says where the coefficients belong when they are cited.
* `core/Origin.H`'s `originFromWord` is TOLERANT: an unknown word resolves
  to `unattributed` and nothing throws.  The brief's `measuredFit` would
  have been silently dropped by the engine — a declared word reading as
  "no provenance".  `check_origin_census` enumerates the words the tree
  writes and would have caught a `measuredFit` under `data/standards/`, but
  the first records carrying it live in `data/local/` and a case.

### 8.2  Decisions (D1–D9 of the brief, as executed)

* **D1 — one home for the data, derived proposals.**  The TSV, the Table
  I(b) legend and the hand-written isomer table are committed under
  `bin/curate/svehla1962/` with their `#` provenance headers.
  `propose_lennard_jones.py` derives fragments into `data/local/lennardJones/`
  (gitignored), matching by parsed elemental formula with a 0.5 % MW
  cross-check, never by name; it REFUSES an `--out` under `data/standards/`,
  is deterministic (two runs byte-identical, gate-checked) and prints its
  coverage.  Coverage on 2026-09-06: 56 fragments (41 by unique composition,
  15 with a flagged isomer pick), 50 with both constants fitted to measured
  data (codes 1–4), 1 ambiguous row (C6H12, eight records), 20 Svehla
  molecules whose only match is an excluded record (atoms/radicals with
  `role nonvolatile`, two salts, silica, the compB/compC stand-ins), 128
  rows with no record, 1 unparseable (Air).  **No block was written into
  `data/standards/`.**
* **D2 — origin per value.**  Codes 1–4 → `measuredFit`; code 20 →
  `measured`; every other code → `estimated`; the `method` string always
  carries Svehla's code and legend.  `measuredFit` is REGISTERED in
  `originFromWord` as the `regressed` rung (a constant fitted to measured
  data is exactly what that rung names) and added to the census gate's
  vocabulary.  `licence publicDomain;` is a new licence word; the only
  reader that enumerated licence words was the COSMO scrub, which is
  about `externalRestricted` and does not concern it.
* **D3 — grammar.**  `lennardJones { sigma [0 1 0 0 0] <m>; epsOverK <K> K;
  provenance { sigma {origin; method;} epsOverK {origin; method;} source
  "…"; licence publicDomain; } }`.  The component loader parses the bracket
  form exactly as case dicts do (`Dictionary::fromFile`, the same parser);
  the reader uses the CHECKED `lookupScalar(key, Dims::length)` /
  `Dims::temperature`, so a wrong dimension refuses with the mismatch.
  Verified by running, not assumed.  A PARTIAL block refuses at load.
* **D4 — the witness carries its data case-locally.**  `transport02` was
  sealed with `Chung` declared, the seven blocks appended to the mirrored
  records, `ChapmanEnskog` declared, and re-imported with
  `--adopt-local components/<g>.dat` for each — seven `adopted` records, the
  edwards02 precedent.  The public catalogue records are untouched.
* **D5 — the engine.**  `neufeld::omega22` is the ONE home of the Ω^(2,2)\*
  fit; `ChungViscosity::neufeldOmega` calls it — same expression, same
  order, every Chung value in transport01 byte-identical (checked row by
  row in its golden).  `ChapmanEnskog` (TransportModel) refuses by name
  without the block and announces both origins per component;
  `modifiedEucken` (ThermalConductivityModel) is Svehla's eq. (2).  Both
  registered explicitly, no macros.  Sutherland: not built, Svehla gives
  no S.  D_AB: not built (8.1).
* **D6 — the bench.**  Two models per gas family.  A component a model
  cannot price is LISTED (`not evaluable by ChapmanEnskog (no lennardJones
  {} block …)`) through a new non-pure `unavailableReason(component)` on
  the two gas bases — never skipped in silence.  The spread sentence keys
  on models EVALUATED (`n_evaluated_mu/k`, the most models that priced one
  component), not registered: transport01 (no blocks) still says a spread
  over one is not agreement and shows WHY; transport02 shows real spreads.
* **D7 — the gate**, §8.4.  **D8 — docs**, this section, the guide, the
  AI docs, CLAUDE.md, the schema, the generated references.

### 8.3  What the witness shows (transport02, 300 K, 1 bar)

Seven gases, both viscosities and both conductivities each, and for the
first time the two spread lines are disagreements.  Water is the widest:
Chung's non-polar truncation against a σ, ε/k pair Svehla fitted to steam
viscosities, a third apart.  Argon is the control: the plain and modified
Eucken coincide to the four figures its record's C_p polynomial returns
for 5R/2, and the polyatomic flag stays silent.  Every Chapman-Enskog
component is announced with both origins FITTED and the report page.

**The reproduction anchor, and what its residual is.**  Fed Svehla's own
M = 28.02, σ = 3.798 Å, ε/k = 71.4 K for N2, the engine returns 176.99 μP
at 300 K against his printed 177.7 (report page 90): **−0.40 %**.  Across
the seven gases at 300 K and 1000 K the fit reads 0.1–0.8 % BELOW his
table, and 1.8 % below for water at 300 K (T\* = 0.37, near the fit's lower
edge).  That is larger than Neufeld's own claim for the fit, and the reason
is not a transcription: Svehla interpolated the Hirschfelder 1954 Ω tables,
Neufeld fitted a later tabulation, and his printed values carry four
figures.  So the anchor is ARITHMETIC, its tolerance is DECLARED at 1 % in
`CorrelationVerify::tolerance` (a new field — 0 means the bench default)
and PRINTED beside the row, and the gate recomputes both the deviation and
the engine's published number so the two homes for one page agree or fail.
The modified Eucken's guard reproduces his λ for N2 at 300 K from his own
η and C_p/R through eq. (2) and his calorie to 0.05 % (his λ has three
figures), declared at 0.2 %, before the THEORY anchor (the monatomic
(15/4)Rμ/M) is returned.

### 8.4  The gate, and the sabotages

`check_transport_correlations` gained arms (l)–(q): Chapman-Enskog μ and
modified-Eucken k for the seven gases recomputed from the sealed records
with σ and ε/k parsed in the loader's grammar; the Svehla anchor recomputed
and the published deviation held to it; refusal by name on a stripped copy;
seven origin announcements; the tool's determinism, its refusal of
`data/standards/`, and the equality of the witness's blocks with the tool's
fragments (the arm that ties the one committed home to the case that runs
from it); the public-domain FORM on the sealed records; the guide arm
re-expressed — a `lennardJones` example is now REQUIRED and held to the
loader's grammar, while `Sutherland`/`viscosityGas` stay refused.  The
source arm now also holds Ω^(2,2)\* to one home.  Four by-hand sabotages,
inputs and outputs only, recorded with their observed lines in the gate's
docstring; the S3 shape recurred as expected (a record edited under the
seal moves the engine and the recount together, and the golden plus the
fragment-equality arm are what see it).

`check_source_licence` gained a public-domain class as a CONTRACT — the
Svehla report by name, the writing tool's `SOURCE_CLASS` cross-checked, a
citing record required to declare `licence publicDomain;` — scoped to the
report rather than to "NASA", because hundreds of records already cite NASA
thermochemical polynomials in their authority fields under the general
public-domain reading and carry no licence word; widening the contract to
them is a curation decision the first draft of this arm took by accident
(seven violations on records this slice never touched) and was narrowed
back.

### 8.5  What did NOT change, and what is still NOT verified

* Every Chung, Eucken, Wilke and Wassiljewa number in transport01 and the
  corpus; transport01's golden gained rows (the new models' anchors, the
  evaluated-model counts, the now-nonzero conductivity spread) and moved
  no value.
* **Nothing here is compared with a measurement Choupo holds.**  Svehla's
  σ and ε/k are HIS fits to viscosities measured before 1962; the anchor
  reproduces his COMPUTED table.  Whether Chapman-Enskog on those constants
  is right for any gas at any T is not established anywhere in this tree,
  and the bench does not say which of the two viscosities is right.
* The page-image transcription is verified once (by the transcriber); the
  gate verifies that the tool reproduces it and the witness carries it, not
  that the image was read correctly.  One smudged cell (C2H5Cl σ, read as
  4.898 at 600 dpi) is named in the transcription's coverage notes.
* Not built: Chapman-Enskog D_AB (Ω^(1,1)\* not citable), Sutherland (no S).
* The isomer picks (15) read record NAMES to choose among composition-
  identical candidates and are flagged in every fragment they produce.
* Reserved for Vítor: promoting any fragment into `data/standards/`; the
  `role nonvolatile` on gas-phase atoms and radicals that excluded them
  from matching; whether codes 2–4 and 20 deserve finer origin words.

### 8.6  Rejected alternatives

* **Typing the Ω^(1,1)\* coefficients from memory to ship D_AB** — the
  brief's own rule; a constant nobody can check is worse than an absence.
* **Loosening the bench's default tolerance to 1 % so the reproduction
  anchor passes** — every other anchor is an identity or a six-figure
  literal; the tolerance belongs to the one anchor that needs it, declared
  and printed there.
* **Writing the blocks into `data/standards/components/`** — promotion is
  a review; the witness adopts them locally instead.
* **A default σ for a record without a block** — a refusal by name is the
  only honest answer; the bench lists the gap instead.
* **Keying the spread sentence on models REGISTERED** — two on the shelf
  and one able to price the case is still one opinion.
