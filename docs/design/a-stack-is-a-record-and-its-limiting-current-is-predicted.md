# A stack is a record, and its limiting current is predicted

*2026-09-16.  Two things in one slice, because they are the same thing said
twice: a number that was DECLARED and could not be checked becomes a number
the engine DERIVES and prints.  The crossflow velocity of an electrodialysis
stack was one, and the counter-ion transport number behind its limiting
current was the other.  Built on `54a3934f6` (the membrane-module slice of
the day before, whose contract this one follows key for key).*

The model is

> V. Geraldes, M.D. Afonso, **"Limiting current density in the
> electrodialysis of multi-ionic solutions"**, *J. Membr. Sci.* **360**
> (2010) 499–508, doi:10.1016/j.memsci.2010.05.054.

---

## 1. What was declared before, and why both were wrong

### The velocity had two homes

```
operation { N_cellpairs 100;  current 8.0;  xi 0.9;
            membraneArea 0.2 m2;  channelThickness 0.5 mm;
            channelLength 0.4 m;  linearVelocity 0.05 m/s;   // <-- this
            E_electrodes 1.5;  membrane CMX_AMX; }
```

The unit already receives the diluate flow, on its inlet stream.  A crossflow
velocity is that flow divided by the cross-section of the channels running
side by side — a **consequence**, not an input.  So an author could declare a
velocity that contradicted the flow, nothing noticed, and the contradiction
was not harmless: the velocity sets the Reynolds number, the Reynolds number
sets the Sherwood number, and the Sherwood number sets the mass-transfer
coefficient and therefore the limiting current.  A typo in a velocity moved an
answer, silently, at exit 0.

### The transport number was a parameter the user had to supply

```
i_lim = z F k c_dil / (t_cu - t_co),     t_co = 1 - t_cu
```

`t_cu` came off the membrane record — CMX_AMX's 0.98, measured in 0.5 M NaCl
at 25 °C.  Two objections, and the second is the interesting one.  The formula
is written for **one salt**, and real feeds are not.  And the transport number
is not really data at all: under limiting conditions it follows from the ions
themselves.

---

## 2. What the model removes

Geraldes & Afonso linearise the Nernst–Planck equations in the diluate film
on the assumption of nearly linear concentration profiles — which is a good
assumption *near the limiting current*, which is where it is used — close
them with electroneutrality, take the co-ion transport numbers as null, and
get the limiting transport numbers **explicitly**:

```
Eq. 12 (CEM)   t_j,lim = z_j D_j C_j,b  / SUM_cations z_j D_j C_j,b
Eq. 13 (AEM)   t_j,lim = |z_j| D_j C_j,b / SUM_anions |z_j| D_j C_j,b
Eq. 15         i_lim = F (k_c,eff/D_eff) * SUM_j C_j,b / SUM_j t_j,lim/(z_j D_j)
```

evaluated once per membrane; the applicable value is the **lowest absolute
value** of the two, and the engine says which membrane set it.

**This removes a parameter.**  The inputs are the ionic diffusivities at
infinite dilution — catalogue data the engine already carries for the
conductivity — and the bulk composition of the stream.  Nothing is fitted.
The only equipment datum left is the Sherwood correlation, and *that* is why
the stack must be a record: a correlation fitted to one spacer is not a law.

### The identity that let the salt decomposition go away

Eq. (A13) gives the effective diffusivity of the multi-ionic solution, and the
paper derives it over **n salts**, cation `k` paired with anion `n+k`, each
with an equivalent fraction `x_k`.  That is a problem for an engine, because a
salt decomposition **is not unique from a list of ions**: Na, Mg, Cl, SO4 is
NaCl + MgSO4, or Na2SO4 + MgCl2, or any blend of the two; and the paper's own
MgCl2 + MgSO4 case pairs one cation twice.

Written out, the weights collapse.  `x_k` is simultaneously the equivalent
fraction of cation `k` and of anion `n+k`, so

```
           SUM_i X+_i D_i * SUM_j X-_j (z_i + |z_j|) D_j
D_eff  =   --------------------------------------------- ,   X+- = |z| C / C_S
           SUM_i X+_i z_i D_i + SUM_j X-_j |z_j| D_j
```

over the **ions**, with each equivalent fraction taken on the total of its own
sign.  This is identical to (A13) wherever a decomposition exists that
reproduces those ion fractions, and it needs none.  `check_ed_stack` arm (e)
recomputes the paper's salt-indexed form in Python from the engine's own
per-ion values and holds the two together, so the identity is asserted rather
than believed.

A single salt recovers the Nernst–Hartley `D_S = (z1+|z2|) D1 D2 / (z1 D1 +
|z2| D2)`, and Eq. 15 then reduces **exactly** to the classical Eq. 16.  The
engine computes both on a single-salt feed and prints them side by side:

```
single salt: Eq. 16 gives 643.0407 A/m2 against Eq. 15's 643.0407 A/m2 -- the reduction, seen
```

A route claimed to reduce to another should be seen doing it.

---

## 3. Vítor's two rulings, verbatim

Both are written into the record's own header and into `EDStack.H`.

> **The active area is the CELL-PAIR area; a stack of 50 m² has 50 m² of
> anionic membrane AND 50 m² of cationic membrane.**

So `activeArea` is the cell-pair active area of the whole stack, and it is the
**only** area stored.  The engine derives and announces the other three:

```
      declared activeArea      0.140000 m2  (the whole stack, per cell pair summed)
      -> per cell pair         0.020000 m2   (activeArea / 7 cell pairs)
      -> per membrane KIND     0.140000 m2   (that much CEM and that much AEM)
      -> total membrane area   0.280000 m2   (2 x activeArea)
```

A record that stores `areaPerCellPair`, `areaPerMembrane`,
`totalMembraneArea`, `membraneArea` or `linearVelocity` is **refused**: the
tree never stores a derivative, and this one costs a factor of two in current
density if it drifts.

> **The pass belongs to the EQUIPMENT, not the operation.**

`hydraulicPasses` is on the record.  A case that declares it beside `stack` is
refused by name, exactly like the inline geometry.

---

## 4. The velocity, derived

```
      channels in parallel     7.0000   = 7 cell pairs / 1 hydraulic pass
      Q_diluate                4.86111e-05 m3/s   (175.00 L/h)
      u = Q/(n W h)            0.079112 m/s  SUPERFICIAL (empty channel section 6.14460e-04 m2)
      u/porosity               0.087902 m/s  interstitial (spacer porosity 0.900)
      flow path length         0.1750 m   = channelLength x passes
```

**Superficial, and the record says so.**  The brief's draft formula divided by
the spacer porosity, which gives the *interstitial* velocity; the paper does
not.  Section 3.3 lists 145, 175 and 230 L/h against superficial velocities
0.066, 0.080 and 0.11 m/s, and the first two reproduce to both their digits
from the stated geometry with no porosity factor (0.0655 and 0.0791).  So the
correlation was fitted on the superficial velocity — and rather than leave
that to a reader's memory, the record **declares** it (`velocityBasis
superficial;`, accepted words `superficial | interstitial`) and the engine
prints both values.  A correlation fitted on the interstitial velocity exists
in the literature; the key is therefore a real setting and not doctrine in the
wrong place.

---

## 5. The record

`data/standards/assets/EUR2C-7P18.dat`, `kind edStack`, read by
`EDStackRegistry` with the same two tiers as every other asset registry
(standards, then each case's `constant/assets/`).  It carries the membrane
pair, the cell pairs, the active area, the channel and spacer, the passes, the
`massTransfer {}` correlation and `limits {}`.

**The estimates follow the `kind membraneModule` contract exactly** — `{
origin estimated; reviewStatus unverified; notes "how to verify it"; }`,
refused without the note, announced on every run that reads one, and reaching
the end-of-run caveat block.  One thing is new: a provenance block may name a
**sub-dict** of the record and describe the values inside it, because two of
this stack's four estimates live in `limits {}` and `massTransfer {}`.  The
announced key is then dotted (`limits.T_max`), so a reader sees the value
spelled as the record spells it.

The four, and why each is one:

| value | why it is an estimate |
|---|---|
| `spacerPorosity 0.90` | the paper states the spacer *thickness* and no porosity |
| `massTransfer.c 0.33` | the paper **postulates** the Schmidt exponent 1/3 (§3.4) rather than fitting it; `a` and `b` ARE fitted |
| `limits.i_max 200` | the paper states no stack ceiling; 200 A/m² is where its Table 1 quotes the membrane resistances and it brackets the highest limiting current it measured (198 A/m²) |
| `limits.T_max 313.15` | it ran at 20 ± 1 °C and states no ceiling; 40 °C is the figure usually quoted for standard-grade Neosepta |

`dP_max`, `flow_max` and the pH band are **absent**, not zero: the Eurodia
data sheet is not in hand, and an absent limit is not checked.

### 5b. The second record: an industrial unit, from its operator

`data/standards/assets/EurodiaED-100P-50.dat` is the same kind of record with
a different kind of source.  It is a 100-cell-pair, 50 m² industrial Eurodia
unit **Vítor Geraldes has operated**, and its facts are *his own recollection*
— not a data sheet and not a publication.  They are recorded as what they are:
`origin measured; reviewStatus unverified;`, each with a note saying how to
verify it, `source` naming him, and all of them announced on every run.  He
stated 100 cell pairs, 50 m² of cell-pair area, a spacer height of *"aprox"*
0.7 mm (his word, in the note), a zig-zag spacer, **two** hydraulic passes and
a design diluate flow of 3000 L/h.  This is the unit the `activeArea` ruling
was stated about: 50 m² of anionic membrane **and** 50 m² of cationic, 0.500 m²
per cell pair.

Three of its decisions are the interesting part, and each closed a question
the first record never posed.

**The membrane pair is not named, and the refusal points the other way.**  He
did not say which membranes the unit carried.  A stack *frame* takes any
ion-exchange pair — exactly as the SEPA CF laboratory cell takes any coupon
(2026-09-15) — so `membranes` became **optional**: a record whose source names
the pair carries it and a case that also declares one is refused; a record
whose source names none leaves it out and a case that declares none is
refused.  **The record decides which way the refusal points**, and neither
side guesses a pair on the owner's behalf.

**Exactly one of the channel width and the channel length is stored.**  He
gave neither.  The width is the estimate — `channelWidth 0.298 m`,
back-calculated from a superficial velocity of 0.080 m/s at the design flow
through 50 parallel channels of 0.7 mm, 0.080 being the middle of the band his
own bench stack ran at, with a note saying it must be verified by measuring a
membrane sheet.  The **length is not stored at all**: it is
`activeArea/(cellPairs × channelWidth)` = 1.680 m, derived where it is used
and printed as derived, with the flow path 3.360 m over the two passes.
*Storing a back-calculated length beside a back-calculated width would be two
homes for one guess, and the second would read like a declaration.*  So
`channelLength` became optional on the reader too — EUR2C-7P18 still declares
one, because its paper states the width, the length **and** the effective area
as three separate facts, and the engine cross-checks the declared length
against the derivation and announces a disagreement above 5 %.  Where the
length is derived that cross-check is vacuous by construction, so the run does
not print it.

**There is no `limits {}` block, and that is a decision.**  The only number in
that family anyone stated is the **design** diluate flow — and a design point
is not a ceiling.  Filing 3000 L/h as `flow_max` promotes it to one silently,
and it did: the comparison landed a floating-point hair above the limit and
the run accused the stack of exceeding its rating while doing exactly what it
was designed to do.  The block is gone and the header says why.

### 5c. Why the bench stack's correlation may be used on the industrial one

This is the check that matters, because a Sherwood correlation is
equipment-and-spacer data and borrowing one is exactly the move this slice
otherwise argues against.  `Sh = 0.29 Re^0.5 Sc^0.33` was fitted on
EUR2C-7P18 over **Re 50–86**.  Run over the same 0.066–0.110 m/s superficial
band that bench stack was operated at, on pure water at 20 °C:

| | channel height | Re band |
|---|---|---|
| EurodiaED-100P-50 | 0.70 mm | 46 → 77 |
| EUR2C-7P18 | 0.77 mm | 51 → 84 |

The two bands very nearly coincide, **because Re is built on the channel
height and the two spacer thicknesses very nearly coincide**.  So the fit is
*applied inside the band it was taken over*, not extrapolated beyond it.  That
is the whole of the justification and the record's header states it with both
bands.

Two things ride with it.  The band is now **equipment data on the record**
(`massTransfer { validity { Re ( 50 86 ); } }`, an impossible interval
refused at read time, like every other validity window in this tree), and the
engine **announces** a run that leaves it — `[extrapolation]`, on
`AdvisoryLog`, never a refusal, the posture of the extrapolated Antoine and
the sub-band Davies.  And the permission is about the **Reynolds number
only**: this spacer is zig-zag and the bench stack's was a mesh, no
correlation here selects on the spacer type, and both the record's header and
its `spacerType` provenance note say so.  `ed05_industrial_stack` sits at
Re 62.9, inside the band.

Two facts in the record deliberately do **not** derive from each other.  The
paper states the channel dimensions (0.114 × 0.175 = 0.019950 m² of spacer
footprint) *and* the effective mass-transfer area per membrane (0.020 m²).
They differ by 0.25 % and are different quantities; the engine prints the
footprint beside the declared area and announces a disagreement above 5 %.

**The membrane grade is named and not papered over.**  The paper's stack
carried Neosepta AMX-SB and CMX-SB; the catalogue's `CMX_AMX` is the standard
grade.  That difference does not reach the predicted limiting current at all —
the model reads no membrane property — but it does reach the ohmic drop and
the Nernst back-EMF.  The record's header says so.

---

## 6. The default, and why it is not the one the brief named

The brief said the predictive route should be the default "when the ions
resolve".  It is not, and the reason is structural rather than a preference:
**GeraldesAfonso2010 needs a mass-transfer correlation fitted to the stack's
own spacer, and only a `kind edStack` record carries one.**  So the default is

* `GeraldesAfonso2010` when the case names a stack record **and** both signs of
  ion are present **and** every ion resolves a curated diffusivity;
* `CowanBrown` otherwise, **announcing which of those three was missing**.

This also keeps `ed01` and `ed02` byte-identical, which they are: their
goldens did not move, and their legacy route now announces itself twice — once
for the velocity the engine could not check against the flow, once for the
fallback with its reason.  A case may still ask for either route explicitly;
asking for the predictive one where it cannot be evaluated refuses by name,
and an unknown word refuses through `registryRefusal::message` with the
accepted list.

**The factory sentence is buried** (the 2026-08-31 rule).
`ElectrodialysisStack.H` used to say *"there is exactly ONE limiting-current
correlation in v1 … so they are INLINE … not a factory-for-one"*.  There are
two now, so the dispatch moved to
`src/unitOperations/electrochem/LimitingCurrent.{H,cpp}` with the enumeration
beside the branches that read it, and that file's header says what it replaced
and why.

### The declared value is announced beside the computed one, never overridden

The `dH_rxn` posture of CLAUDE.md §5.  The membrane record still declares
`t_cu = 0.98`; the model reads none of it, and the run says exactly that:

```
  the membrane record DECLARES t_cu = 0.980 (CEM, 0.5 M NaCl); this model READS NONE of it
  -- it takes the co-ion numbers as null and computes the counter-ion ones above.
  Neither value overrides the other; both are printed.
```

---

## 7. The witnesses, and two findings

`ed03_stack_record` is ed01's chemistry through the record: the derived
velocity, the area arithmetic, the four announced estimates, and Eq. 15 seen
reducing to Eq. 16.

`ed05_industrial_stack` is §5b's record at its design flow: the case naming
the membrane pair, the derived channel length, two hydraulic passes, and 50 %
demineralisation solved for by `targetDemin` — against ed03's 2.7 % on seven
cell pairs in one pass.

`ed04_limiting_current_multiionic` is the paper's own MgCl2 + MgSO4 series —
six units, one per row of its Table 4, at its own flows and 20 °C, with the
diluate declared at the **average** cation concentration the paper's own
prediction uses.

| unit | flow | Re (paper) | Re (derived) | i_lim measured | i_lim engine | deviation |
|---|---|---|---|---|---|---|
| ED1 | 145 L/h | 50 | 50.42 | 34.3 | 37.60 | +9.6 % |
| ED2 | 175 L/h | 61 | 60.85 | 37.6 | 41.53 | +10.4 % |
| ED3 | 230 L/h | 86 | **79.98** | 42.9 | 48.16 | +12.3 % |
| ED4 | 145 L/h | 50 | 50.42 | 71.2 | 74.96 | +5.3 % |
| ED5 | 175 L/h | 61 | 60.85 | 81.9 | 82.79 | +1.1 % |
| ED6 | 230 L/h | 86 | **79.98** | 93.5 | 95.92 | +2.6 % |

Average |deviation| **6.9 %**, against the **9 %** the paper reports for this
system (§4.3).  The `i_lim_cem` golden rows are `anchor` rows against the
measured column with a band of **13 %** — the larger of the two average
relative deviations the paper itself reports, *its* number and not one chosen
here; `i_lim` is pinned separately and tightly as an ordinary regression row.

**FINDING 1: the paper's own Reynolds number at its highest flow does not
follow from its own flow rate.**  §3.3 lists 145, 175 and 230 L/h against
0.066, 0.080 and 0.11 m/s and Re 50, 61 and 86.  The first two close exactly
on the stated geometry with all seven diluate channels in parallel; the third
does not — the same division gives 0.1040 m/s, and 86/61 = 1.41 is not
230/175 = 1.31 either.  **Nothing was adjusted.**  The engine derives the
velocity from the flow, because the flow is the measurable, so ED3 and ED6 run
at Re 79.98 and their predicted i_lim is 3.7 % lower than it would be at the
paper's printed Re.  Recorded, not tuned.

**FINDING 2: the predictions are biased HIGH on this system by about 7 %,
where the paper's own are biased LOW by 13 % on the single-salt MgCl2 rows of
the same table.**  With a mass-transfer correlation of 7 % average error
behind it, neither is surprising, and it is worth a student's attention that
the *sign* of the bias depends on the system.

The Stokes–Einstein correction is the other thing worth stating.  The curated
ion diffusivities are referenced at 25 °C and the paper's Table 3 is at 20 °C.
The engine corrects them with `D(T) = D0 (T/298.15) (mu(298.15)/mu(T))` from
the case's **declared** liquid-viscosity model — the same correction the paper
used to build that table — and lands within 0.7 % of it on every ion.  With no
viscosity model declared there is no correction and the run says so.  The gate
holds the engine's `D_eff` to the paper's Table 3 value within 1 %.

---

## 8. Traps paid for

**A guard whose only case satisfies it is a guard nothing tests.**  The
velocity derivation divides by `cellPairs / hydraulicPasses`, and
EUR2C-7P18 has ONE pass — so a sabotage that dropped the pass division
SURVIVED every shipped witness, because the two numbers are then the same.
The gate builds a 7-pass twin with a case-local copy of the record, and the
sabotage dies at once.  This is the diafiltration lesson of 2026-08-25, met
again, in a different file.

**A sabotage that changes no arithmetic proves nothing.**  Taking the anion
equivalent fraction on the *cation* total looked like a good sabotage of
`effectiveDiffusivity` and is a no-op: an electroneutral solution has the two
totals exactly equal.  Recorded as a fact about the code (the divisor is
interchangeable on any feed the unit accepts) rather than as a hole in the
gate; a second sabotage that really moves the arithmetic is the one that
demonstrates arm (e).

**A gate must report, not crash.**  The sabotage that did land made `D_eff`
come out zero on a NaCl feed, the KPI serialised as `null`, and the gate died
with a `TypeError` instead of naming a failure.  Two fixes rode with it: the
engine now refuses a non-positive or non-finite Eq. A13 result by name, and
the gate reports a missing KPI as a named failure.

**A failure whose two printed numbers look identical teaches nothing.**  The
A13 identity was first asserted at 1e-12 and reported a mismatch between two
numbers that printed the same, because the result JSON carries 12 significant
figures and the engine's own `D_eff` therefore arrives already rounded at
~8e-13 relative.  The threshold is 1e-10 — still eight orders tighter than any
formula error — and the message prints the relative gap.  *A tolerance tighter
than the channel the number came through is measuring the serialiser.*

---

## 9. NOT in this slice, named rather than implied

> **BUILT 2026-09-16, the same day, and this section is corrected rather than
> deleted.**  The three items below said "the next slice"; that slice is
> `docs/design/the-limiting-current-that-falls-while-you-watch.md`, and the
> prediction made in the third paragraph — that a plant runs successive stages
> at decreasing current density, and that this model would predict the fall —
> is measured there: 338.88 → 21.69 A/m2 over four stages, a factor of 15.6.
> What follows is what this slice did NOT do, left as it was written, with the
> outcome marked.

**Batch electrodialysis.**  ~~A bench stack of seven cell pairs in one pass
removes a few per cent of the diluate's sodium, which is exactly what ed03
shows and exactly why a real bench run **recirculates** the diluate through a
tank for minutes.  A `choupoBatch` unit doing that — a stack in a
recirculation loop, with the tank inventory as the state — is the next slice.
Nothing here is tested over time.~~  **DONE:** `batchElectrodialysis` holds
BOTH tanks (the concentrate is what the Nernst term is a function of), asks
`edCell::predictiveLimitingCurrent` once per instant, and shows i_lim FALLING
643.04 → 88.26 A/m2 until i crosses it.

**The network witnesses.**  ~~Stacks in series as stages, and feed-and-bleed as
a recycle, are the next slice too.~~  **DONE:** `ed06_stages_in_series` and
`ed07_feed_and_bleed`.

**AND THE ARCHITECTURE NEEDS NO ELECTRICAL TOPOLOGY FOR THEM**, which is worth
writing down because it is the kind of thing that gets built by reflex.  An
electrical **stage** is a set of cell pairs served by ONE electrode pair fed by
its own rectifier.  Stages in series therefore each carry their own current and
their own voltage — there is no shared electrical node to model — so a stack
with several electrical stages inside it is simply **several units in series**,
which the flowsheet already expresses, each with its own `current` and its own
energy wire.  Nothing needs a new topology object.

The pedagogy that falls out of it is worth the witness when it is built: a real
plant runs successive stages at **decreasing current density**, because the
limiting current falls as the diluate depletes — and this slice's model now
*predicts* that fall, from the composition of each stage's own diluate.
**Measured in `ed06_stages_in_series` (2026-09-16):** four stages asked for the
same fractional demineralisation solve 26.80 / 10.72 / 4.29 / 1.72 A against
limiting currents of 338.88 / 135.55 / 54.22 / 21.69 A/m2 — the current falls
by exactly the factor the limiting current does, so the margin `i/i_lim` is
0.158 at every stage, and stage 1's own density applied at stage 4 would be
2.47 times its limit.  The prediction written in this paragraph was made before
the case existed and is the reason it was built.

**A zig-zag spacer correlation.**  `EurodiaED-100P-50` borrows the mesh stack's
fit, justified on the Reynolds band alone (§5c).  Fitting a correlation to a
zig-zag spacer needs limiting-current measurements on that stack, which nobody
has taken here, and no correlation in this tree selects on the spacer type
anyway — `spacerType` is declared, announced, and selects nothing.

**Also not done.**  The `leveque` branch of a record's `massTransfer` block and
the `interstitial` velocity basis are implemented and reached by no record and
no case.  `dP_max`, `flow_max` and the pH band are read and never exercised.
The single-salt MgCl2 and NaCl rows of Table 4 are run by no case — they would
need a second and third witness and add nothing the six here do not show.
Curating the AMX-SB / CMX-SB grades beside the standard `CMX_AMX` is a
curation act nobody has performed.  And nothing checks that the estimates are
*good* estimates: nobody here has weighed a EUR2C spacer coupon.

---

## 10. Gate

`bin/curate/check_ed_stack.py`, wired into `bin/runTests` beside
`check_membrane_modules`.  Seven arms: the two records against a second
transcription of the paper; the derived velocity recomputed from each case's
own declared flow (plus the 7-pass twin); five refusals; Eq. 15 reducing to
Eq. 16; `D_eff` and the limiting transport numbers recomputed in Python three
ways; ed04's six anchors against Table 4, printed with their deviations; and
the announcements on all three witnesses including ed01's two legacy lines and
a 320 K twin that prints its `[limit]` line and still exits 0.  Twelve by-hand
sabotages are listed in its docstring with their results, including the two
that did not do what was predicted.
