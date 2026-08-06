# How other engines embed thermodynamic theory in class structure — a learning study

> **KIND: STUDY (no decision, no code).** Commissioned by Vítor 2026-08-06:
> *"this should be done in a very structured way, because the future
> scalability depends on this … I think you can get more insight from
> openfoam.org than from dwsim, albeit analysing the two of them (and others
> like cantera) is the way to go. So I ask you first to do a learning process
> before changing the code."*
>
> Sources read from clones, not from memory: `OpenFOAM/OpenFOAM-dev`,
> `Cantera/cantera`, `DanWBR/dwsim`, all at depth 1 on 2026-08-06.
> **Nothing here is a proposal.** §7 states what the findings imply; the
> decision is a separate act.

---

## 1. The five questions

Chosen because each maps onto something Choupo either lacks or does
differently, and each is load-bearing for scalability.

| # | Question | Why it matters here |
|---|---|---|
| Q1 | What is a phase's **primitive** — μ, f, or G? | Choupo's `Phase` declares `fEffective` and `activityCoefficients`; there is no μ anywhere in `src/thermo/`. |
| Q2 | Is the **standard state** an object? | Choupo has four reference rungs, a one-knob rule and versioned convention profiles — all prose. D3 (the transfer term) is contract-only because there is nothing to attach it to. |
| Q3 | Is the **equilibrium criterion** written once? | Choupo has Gibbs minimisation in `gibbsMethod/{ElementPotential,DirectMin,ReactiveFlash}` plus the LL path in `IsothermalFlash`. |
| Q4 | How is **extensibility** achieved? | The scalability question, in Vítor's words. |
| Q5 | How is a **size distribution** represented? | Choupo's `ParticleSizeDistribution` is a bare struct of two vectors — the only physical model in the tree that is not a registered class. |

---

## 2. OpenFOAM — theory as a type composition

**Q1/Q3 — the finding that matters most.** OpenFOAM composes a thermo type
from interchangeable layers:

```
    specie  →  equationOfState  →  thermo(Cp,h)  →  species::thermo  →  transport  →  mixture
```

`equationOfState/` offers thirteen choices (`perfectGas`, `PengRobinsonGas`,
`rhoConst`, `icoTabulated`, …); `thermo/` offers the caloric ones (`janaf`,
`hConst`, `hPolynomial`, `hTabulated`, …).

Then **one** template — `species::thermo<Thermo, Type>` — derives everything
else *by the classical identities*, for every combination:

```cpp
// thermoI.H
g(p, T)  { return this->ha(p, T) - T*this->s(p, T); }          // G = H − TS

K(p, T)  { arg = -this->Y()*this->gStd(T)/(RR*T); return exp(arg); }
```

Read that second line carefully. **The equilibrium constant is not a model and
not a correlation. It is `exp(−ΔG°/RT)`, computed once, valid for every
equation of state crossed with every caloric model** — because it derives from
the fundamental relation rather than being re-implemented per model. Alongside
it the same header derives `Cpv`, `gamma`, `he`, `a` (Helmholtz), `Kp`, `Kc`,
`Kx` and `dKcdTbyKc`.

**Q2 — the standard state is a function each layer must supply.** `gStd(T)`
is declared by every caloric model (`janafThermo::gStd`, `hConstThermo::gStd`).
It is not global, not implicit, not a convention written in a comment: it is
part of the interface a thermo layer must implement, and `K()` above is the
consumer that makes it load-bearing.

**And the datum is a template parameter.** `sensibleEnthalpy` and
`absoluteEnthalpy` are *types* — "Thermodynamics mapping class to expose the
sensible enthalpy functions". Whether you work on the sensible or the
formation datum is a compile-time choice in the type, not a flag tested at
runtime. Choupo settled the same question by decree (one enthalpy base, the
elements datum, enforced by a shared `reactionHeat()`); OpenFOAM lets both
exist and makes the choice structural.

**Q4 — extensibility.** A new equation of state is a new class satisfying the
layer's contract; every derived quantity comes free, and every solver that
takes `<Thermo>` accepts it. This is the scalability property Vítor is asking
about, and it is bought by *deriving rather than re-implementing*.

---

## 3. Cantera — the standard state as a class hierarchy

Cantera answers **Q2** the most directly of the three, and it is the answer
Choupo does not have.

`include/cantera/thermo/` carries a **PDSS** family — Pressure-Dependent
Standard State — with its own factory (`PDSSFactory.h`):

```
PDSS.h            the base
PDSS_ConstVol     constant molar volume
PDSS_HKFT         Helgeson–Kirkham–Flowers–Tanger
PDSS_SSVol
PDSS_Water        IAPWS standard state for water
```

The base declares a full thermodynamic surface for the standard state itself —
`enthalpy_mole`, `entropy_mole`, **`gibbs_mole`**, `cp_mole`, `cv_mole`,
`molarVolume`, `dVdT`, `dVdP`, `density`, plus the dimensionless twins
(`gibbs_RT`, `cp_R`, …).

Two consequences worth stating plainly:

1. **The standard state is a thermodynamic object, not a number.** It has its
   own fundamental relation and its own T,P dependence. Choupo treats a
   reference rung as a *policy* selected by the formulation; Cantera treats it
   as a *model* with an interface and a factory.
2. **`PDSS_HKFT` is the aqueous-electrolyte standard state at elevated T and
   P.** That is precisely Choupo's "aqueous-infinite-dilution rung" — existing
   as a class, in a codebase that also carries ideal-gas and pure-solid states
   in the same hierarchy. The shape demonstrably scales to the domain Vítor
   works in.

---

## 4. DWSIM — the counter-example, already recorded

Read on 2026-08-05 and written up in
[`where-a-finding-record-lives.md`](where-a-finding-record-lives.md).

`DWSIM.Interfaces` has **zero** project references — a pure contracts
assembly at the bottom, which is the pattern. But `DWSIM.FlowsheetSolver`
references `DWSIM.Inspector`, whose same assembly holds `Window.vb`
(`Imports System.Windows.Forms`) and references `DWSIM.Controls.DockPanel`.
**The flowsheet solver has a compile-time path to a docking-panel GUI
toolkit**, because a diagnostics subsystem was allowed to own its own
presentation.

For *this* study DWSIM's thermo contributes less: its `PropertyPackage` is a
broad base class per package (NRTL, Peng-Robinson, …) rather than a
composition of physical layers, so a new model means a new package rather than
a new layer. That is closer to Choupo's present shape than to OpenFOAM's.
Vítor's instinct that OpenFOAM has more to teach here is correct, and the
reason is specific: **OpenFOAM composes, DWSIM and Choupo subclass.**

---

## 5. Q5 — size distributions, and the thing nobody expected

`src/OpenFOAM/distributions/` is a runtime-selectable family:

```
RosinRammler   normal   multiNormal   exponential   uniform
fixedValue     multiFixedValue        standardNormal
tabulatedCumulative    tabulatedDensity
unintegrable   (base for distributions with no closed-form integral)
```

The base contract is `sample()`, `min()`, `max()`, `mean()`, `CDF(x)`,
`plotPDF(x)`, with a run-time selection table.

**Three structural lessons, in ascending order of importance.**

1. **Tabular is a SUBCLASS, not the representation.**
   `tabulatedCumulative` and `tabulatedDensity` sit beside `RosinRammler` and
   `normal` as peers. Choupo has this inverted: the tabular form *is*
   `ParticleSizeDistribution`, and a continuous law has nowhere to live, so a
   case author must discretise it by hand — putting the model in the input
   file instead of in a class.

2. **`unintegrable` is a shared base for the numerics**, so a distribution
   whose CDF has no closed form does not re-implement the integration. That is
   the one-home rule applied to derived quantities of a distribution.

3. **THE DISTRIBUTION CARRIES ITS OWN MOMENT BASIS.** The base holds two
   exponents:

   ```cpp
   const label Q_;          // the moment order the distribution is DECLARED in
   const label sampleQ_;    // the moment order the CONSUMER wants
   inline label q() const { return sampleQ_ - Q_; }   // the conversion
   ```

   with the header explaining: *"whether the samples should have an equal
   number (sampleQ=0), volume (sampleQ=3), area (sampleQ=2)"*.

   A distribution therefore knows which basis it is expressed in and converts
   to the basis asked for. That is the classical d₁₀ / d₃₂ / d₄₃ bookkeeping —
   number versus surface versus volume weighting — made structural instead of
   left to each consumer.

---

## 6. The unifying finding

The two things Vítor named — thermodynamic theory in the class structure, and
particle size distributions — **are the same architectural problem**:

> **A quantity is expressed in one basis, a consumer needs it in another, and
> the conversion must be an object rather than an assumption.**

* Thermo: a potential referenced to the aqueous-infinite-dilution rung, needed
  against the pure-liquid Raoult rung. Cantera makes the reference a class
  (`PDSS`); OpenFOAM makes it an interface function (`gStd`) with the datum as
  a type.
* Particles: a distribution declared number-based, needed volume-weighted.
  OpenFOAM makes the conversion an exponent the base owns (`q = sampleQ − Q`).

**OpenFOAM solves it twice, the same way, in two unrelated domains.** That is
the strongest evidence in this study that the shape is right rather than
merely idiomatic.

Choupo currently solves *neither* structurally. Both are handled in prose and
in per-consumer code: the four reference rungs and the one-knob rule for
thermo; nothing at all for the moment basis, since no moment is computed
anywhere. The `d32` in `SprayDryer` is an atomisation correlation — a droplet
*generation* result, not a moment of a distribution — which is a name
collision waiting to mislead a student in a codebase that otherwise bans them.

**And it explains a stuck debt.** D3, the standard-state transfer term, has
been contract-only with implementation unauthorised. It is not blocked on
physics. It is blocked because "convert this potential from rung A to rung B"
has no object to be a method of. Cantera shows what that object looks like.

---

## 7. What this implies — stated, not decided

No decision is taken here, and no code changes on the strength of this
document.

**The size-distribution finding is the smaller and clearer of the two.** It is
additive, it matches a doctrine Choupo already applies to every other physical
model (abstract base + explicit factory + dict selection), the tabular form
survives as one subclass so nothing migrates, and it would give the corpus
moments — d₃₂, d₅₀ — that are currently computed nowhere.

**The thermodynamic finding is larger and needs care.** A μ-first rewrite of
`Phase` is not indicated: fugacity is better-conditioned numerically and every
model in the tree speaks it, and OpenFOAM itself keeps `f` while making the
*standard state* explicit. The narrow version worth weighing is Cantera's:
give the reference rung an interface, so μ° stops being a convention written in
prose and D3 becomes implementable.

**What this study deliberately does not do** is estimate effort, propose a
migration order, or recommend a shape. Vítor asked for a learning process
before changes; this is that, and the next act is his.


---

## 8. Addendum, measured 2026-08-06: the thesis, reproduced by accident

§6 argued that Choupo's missing abstraction is the standard state. While
looking for the smallest honest spike, I produced the error it invites — by
hand, in three lines of arithmetic — which is better evidence than the
argument.

**The test.** OpenFOAM derives `K = exp(−Y·gStd(T)/(R·T))`. Choupo instead
STORES equilibrium constants: `chemistry/water-dissociation.dat` carries
`logK25 -14; dH 56400;`. Since 42 species carry `hfAq` and 39 carry `sAq`,
ΔG° = ΔH° − TΔS° should reproduce that stored logK — and if it does, the
stored value is a second home for something derivable.

**Done with the record's own numbers, it gives logK25 = −12.4986 against the
stored −14** — 10.7 % in log space, a factor of ~32 in K — **and dH = 11836
J/mol against 56400, 79 % apart.**

**The cause is not a bug in Choupo. It is the missing abstraction, exactly.**
`water.dat` declares

```
standardThermochemistry
{
    dHf_298   -241826.0;        // J/mol  -- ideal-gas reference
    s_298     188.834;          // J/(mol·K)  -- third-law absolute
}
```

Those are the **ideal-gas** values. The aqueous reaction needs **liquid**
water (−285830 J/mol, 69.95 J/mol/K), and with those the same arithmetic
gives **logK25 = −13.998 against a stored −14** — agreement to 1.4 × 10⁻⁴.

So the record is right, the stored constant is right, and the derivation is
right. What is missing is any machine-readable statement of **which reference
state the datum belongs to**. The block says "ideal-gas reference" in a
COMMENT — the parser discards it — and carries no `phase` field. That is the
same defect class already closed twice this week for `reviewStatus` (a tier in
a banner) and `Trange` (a window parsed and never read): *a field the engine
cannot see is a comment.*

**Three consequences, and they are the argument for the next slice:**

1. **A reaction ΔG° cannot be assembled across the two conventions** —
   ideal-gas `standardThermochemistry` and aqueous-infinite-dilution
   `hfAq`/`sAq` — without a conversion nobody has written. That conversion is
   D3's transfer term, and this is why D3 has stayed contract-only.
2. **The stored `logK25` is NOT redundant today** — it cannot be derived,
   because the derivation crosses a rung. It would become derivable the moment
   the rung were declared, and then the K_b treatment applies: derive, keep the
   declared value as a validating anchor, announce the comparison.
3. **`dH` is 79 % from a naive derivation and 1.0 % from a correct one.** The
   1.0 % is a real curation question; the 79 % is what a student gets for using
   the datum the record hands them without knowing which state it is on.

**The smallest honest first step is therefore NOT `gStd` yet.** It is to make
the reference state of `standardThermochemistry` a DECLARED, parsed field
rather than a comment, and to refuse mixing rungs rather than compute across
them silently. `gStd` as an interface function follows naturally once a datum
knows what it is referenced to — but declaring the state is the prerequisite,
and it is the part that stops a wrong number being produced today.

Recorded as a measurement, not a proposal: no code has changed on the strength
of this.
