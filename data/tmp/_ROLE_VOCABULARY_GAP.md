# `_ROLE_VOCABULARY_GAP.md` — a proposal for Vítor, not an implementation

**Written 2026-07-24 by `agent:henry` (phase 4). No C++, no component file and
no standard was touched.** Private tier (`data/tmp/`, gitignored).

---

# 1. The problem in one sentence

Four staged compounds that are **real volatile liquids** are declared
`role nonvolatile` — not because anyone believes they are involatile, but
because `nonvolatile` is the only role in Choupo's four-word vocabulary that a
component **without an Antoine set is allowed to have**, and the engine turns
that declaration into the hard physical claim `K = 0`, silently.

The corpus already knows this. Fourteen of the 52 staged files carrying
`role nonvolatile` annotate it, in prose, as a "**CASE role** … not a claim
about the physics". `NDMA.candidate.dat` goes further and carries a structured
`roleReview { status flagged; ... }` block whose `finding` reads:

> *"the declared role 'nonvolatile' CONTRADICTS the compound's own reported
> normal boiling point of about 152 C … 'nonvolatile' here encodes the intended
> USE (a trace aqueous contaminant in an NF/RO case), not the physics."*

That is a **vocabulary gap being papered over in comments** — the exact failure
mode `RECORD_SPEC.md` exists to prevent ("zero usable science may live only in a
comment"), and a direct collision with the *no silent crutch* doctrine: a
declaration that changes the physics must announce itself, not hide.

---

# 2. What the engine actually does with `role`

Read from `src/thermo/Component.{H,cpp}` and `src/thermo/ThermoPackage.cpp`
(read-only; nothing was modified).

**The vocabulary is a closed four-word enum.** `Component::readFromDict`:

```
if (role_ != "volatile" && role_ != "solute"
 && role_ != "nonvolatile" && role_ != "radical")
    throw ... "role '" + role_ + "' is not one of"
              " volatile / solute / nonvolatile / radical";
```

**Two of the four demand a vapour-pressure block, at construction time:**

```
const bool needsVP = (role_ == "volatile" || role_ == "solute");
if (needsVP && !d->found("vaporPressure"))
    throw ... "no 'vaporPressure' block. ... fit it (choupoProps
              vaporPressureFit) or supply a corresponding-states model
              before using the component.";
```

**And the other two are a hard, silent physical claim.** Both K-value paths in
`ThermoPackage.cpp` (the γ-φ path and the electrolyte path) open with:

```
if (role == "nonvolatile" || role == "radical")
{ K[i] = 0.0; continue; }
```

with the comment *"Nonvolatile solutes (NaCl, glucose,...) never enter the
vapour: K = 0 identically."* There is **no warning, no log line, no
verbosity-gated announcement.** `Component::isNonvolatile()` is additionally
consumed by the dissolved-vs-crystalline reference-rung logic
(`ThermoPackage.cpp` ~line 793), so the label reaches beyond VLE.

The role semantics, from `Component.H`:

| role | K-value machinery | needs `vaporPressure {}` |
|---|---|---|
| `volatile` (default) | `K = γ·Psat / (φ·P)` | **yes** |
| `solute` | `K = H(T)/P` when a Henry pair `(this, solvent)` exists; **else falls back to the volatile path** | **yes** |
| `nonvolatile` | `K = 0` identically | no |
| `radical` | `K = 0` for flash; allowed in gas-phase Gibbs | no |

### The sharpest form of the gap

`role solute` **already** computes `K = H(T)/P` and never touches `Psat` when a
Henry pair exists — yet the constructor still refuses to load the component
without a `vaporPressure {}` block. **The load-time validation is stricter than
the physics needs**, because it runs inside `Component`, which cannot see the
package's solvent or the Henry registry. That is why the two PFAS compounds
cannot take the role that fits them even now that this phase has created
`parameters/henry/PFOA-water` and `parameters/henry/PFBA-water`.

---

# 3. The affected compounds

| compound | declared | physical reality | what the engine would do | staged Antoine? | staged Henry? |
|---|---|---|---|---|---|
| **PFBA** | `role nonvolatile` | **liquid at 298 K.** `Tfus 255.65 K`, `Tb 394.15 K`; the file itself declares `stateAt298 liquid` and files its density as a *liquid* density | `K = 0` — a substance boiling at 121 °C is held entirely in the liquid, silently | no (one measured point, 5866 Pa @ 329.15 K; a Clausius-Clapeyron fit was deliberately refused) | **yes** (new, `flagged`) |
| **PFOA** | `role nonvolatile` | solid at 298 K but `Tb 461.15 K`; a measured (extrapolated) vapour-pressure point exists | `K = 0` | no (one point, 2.27 Pa @ 293.15 K) | **yes** (new, `flagged`) |
| **furfurylAlcohol** | `role nonvolatile` | a **volatile liquid**, `Tb 443 K` (170 °C); the file says so in its own comment: *"Without it `role volatile` cannot be honoured, which is why the role is `nonvolatile`"* | `K = 0` | no (Tc/Pc/ω on subscription TRC) | no |
| **NDMA** | `role nonvolatile` | `Tb ≈ 425 K` (~152 °C), a liquid; carries a `roleReview` block declaring the contradiction | `K = 0` | no (no thermochemistry at all) | no |

**Borderline, listed for completeness, not proposed for change:**

* **HMF** — `role nonvolatile` is *defensible*: it decomposes near its boiling
  point and has no clean normal bp. But it melts at 308.5 K, so it too is a
  liquid at process temperature, and its `// CASE role` comment shows the author
  had the same discomfort.
* **Eleven further files** carry `role nonvolatile; // aqueous solute; decomposes
  rather than boils` and one `// polymerises rather than boils`. Those are
  **honest** uses: a substance that decomposes before boiling really does have
  `K ≈ 0`. The vocabulary works for them. It is the *four above* where the same
  word is asserting something false.

### The gap bites in the opposite direction too

`limonene.candidate.dat` declares the **honest** role —
`role volatile; // requires a vaporPressure block, which this component does not
have` — and is therefore, by the rule quoted in §2, **a file the engine would
refuse to load**. Today the corpus's only two options are *lie quietly*
(`nonvolatile`) or *be honest and unloadable* (`volatile`). Every one of the 52
`nonvolatile` declarations in `data/tmp/components/` is downstream of that
choice.

---

# 4. Three concrete options

## Option A — no new word: move the validation to where the Henry registry is visible

Relax `needsVP` for `role solute`: a solute may load **without** a
`vaporPressure {}` block, and the check moves from `Component::readFromDict` to
package assembly (`ThermoPackageBuilder` / `ThermoPackage`), where the solvent
and `HenrysLawRegistry` are known. A `solute` with neither an Antoine set nor a
Henry pair is a **loud refusal at build time**, never a fallback.

**Consequences**

* Vocabulary unchanged — four words, no migration, no new branch in any `role`
  switch.
* PFBA and PFOA can become `role solute` immediately, backed by the two Henry
  records this phase created. Their K-value becomes `H(T)/P` — physically the
  right law for a trace aqueous solute, and the one the membrane cases want.
* **Does not help furfurylAlcohol or NDMA**: no Henry constant is staged for
  either, so they stay stuck on the same lie.
* The `solute` → volatile *fallback* becomes dangerous and must be deleted in
  the same change: today a `solute` with no Henry pair silently takes the Raoult
  path. Silently substituting one law for another is precisely the crutch the
  project forbids.
* Error messages move from component-load to package-build. Slightly later, but
  still before any number is computed.

**Verdict:** necessary, cheap, correct — and **insufficient on its own**. It
fixes two compounds and leaves the silent `K = 0` hazard fully intact.

## Option B — add a fifth role: the volatile whose correlation we lack

A new word, e.g. **`role volatileUndeclared`** (alternatives:
`volatileNoPsat`, `volatilePending` — naming is Vítor's call). Semantics:

> *This substance IS volatile. Choupo has no vapour-pressure correlation for
> it. Any calculation that needs its K-value must refuse, loudly, at the point
> of use.*

**Consequences**

* The component **loads** without a `vaporPressure {}` block, so a case that
  only touches the liquid side — NF/RO rejection, aqueous diffusion,
  speciation, partition: *exactly what all four compounds were staged for* —
  runs normally.
* Any flash, distillation, stripping or Gibbs call that reaches for its K-value
  **throws** with a remedy-bearing message ("component X is declared volatile
  but carries no vapour-pressure model — supply an Antoine set, a
  corresponding-states model, or a Henry pair"), in the same style as the
  existing `needsVP` message. **The failure moves from a silent wrong answer to
  a loud refusal** — the single most valuable change here.
* `limonene` becomes declarable and loadable without lying.
* Cost: one enum value, one branch in each of the two K-value paths, one branch
  in the `isNonvolatile()` consumers, plus the pedagogical cost of a fifth word
  in a vocabulary whose four words are currently crisp.
* Risk: the new word is *comfortable*. It could become the default parking spot
  for "we did not curate the Antoine set", exactly as `nonvolatile` is today.
  Mitigation: make it require a declared, cited `Tb` (or another volatility
  datum) so it cannot be asserted about a substance nobody has looked at.

**Verdict:** the minimum honest fix. It converts the defect from *wrong
silently* to *refuses loudly*, which is the project's stated standard.

## Option C — split the axis: `role` is a modelling choice, volatility is a fact

Stop overloading one keyword with two different things. Keep `role` as the
**VLE-machinery selector** (a case-scoped modelling decision) and add an
orthogonal, **declarative** component block stating the physics:

```
volatility
{
    class               volatile;      // volatile | nonvolatile | decomposes
    normalBoilingPoint  394.15 K;
    provenance { citation "..."; status candidate; }
}
```

The engine then **cross-checks**: a case declaring `role nonvolatile` for a
component whose `volatility.class` is `volatile` gets a loud, verbosity-1
announcement — *"component PFBA is modelled as nonvolatile (K = 0) although it
is declared volatile with Tb = 394.15 K; this is a case-scoped simplification"*
— and the run continues. The simplification stays legal, and it stops being
silent.

**Consequences**

* This is **the split the corpus already invented in prose**: "CASE role … not
  a claim about the physics" is written into 14 files, and `NDMA` even has a
  structured `roleReview {}` block for it. Option C makes that machine-readable
  instead of editorial.
* It gives `Tb` somewhere to *matter*. Today several staged files carry a
  boiling point that influences nothing.
* It fits the existing arity/provenance discipline exactly: `volatility` is
  arity-1 intrinsic, carries its own citation and `status`, and lives in the
  component where it belongs.
* Largest change: a new component block, a new consistency gate, a new
  announcement, and every staged file (and eventually every standard component)
  gains a field. `role` keeps its four words and its meaning becomes *narrower
  and clearer*, not wider.
* It does **not**, on its own, let a volatile-without-Antoine component be
  computed — it only makes the simplification honest. It therefore composes
  with A and B rather than replacing them.

**Verdict:** the right end state. Biggest change, and the only one that
survives the next hundred components.

---

# 5. Recommendation

**B now, C next, A folded into B.**

* **B** is the smallest change that stops the engine returning a silently wrong
  answer, and it is the only option that unblocks all four compounds *and*
  `limonene` at once.
* **A** should ship inside the same change: with `parameters/henry/` now
  populated, `role solute` is the physically correct role for PFOA and PFBA,
  and the constructor's over-strict `needsVP` check is the only thing standing
  in the way. Delete the `solute` → Raoult fallback while you are there.
* **C** is the ontology fix and should be scheduled deliberately, not bolted
  on. It is what makes "CASE role" a declaration instead of a comment.

**Do not** fit a Clausius-Clapeyron correlation through `Tb` plus the single
staged vapour-pressure point to make the current vocabulary work — the phase-3
cleanup explicitly refused to do that for PFBA, and it was right: that
manufactures a correlation to satisfy a validation rule, which is a crutch
wearing a lab coat.

**Nothing here is implemented, and nothing should be until Vítor rules on the
word.** The choice of the fifth role's *name* in particular is a vocabulary
decision, and vocabulary in this project is Vítor's.
