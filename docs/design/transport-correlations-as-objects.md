# Correlations as first-class objects — the transport families

*Record of the 2026-09-05 slice (task #91).  Engine:
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

## 7  The curation campaign this names and does not start

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
