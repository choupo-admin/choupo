# Proposal — ONE file per mineral (unify the solid's homes)

Status: **PROPOSAL — not ratified, not built.** Author draft for V. Geraldes review.
Supersedes, if ratified, the 3-home split of solid data inside the 2026-07-01
electrolyte-data-architecture (the "7 homes"). Everything relational stays.

---

## 1. The problem (concrete)

A single precipitating solid — halite (NaCl) — has its data scattered across
**four** files today:

| File | Carries |
|---|---|
| `components/NaCl.dat` | identity: MW, formula, `dissociatesTo { Na 1; Cl 1; }` |
| `chemistry/mineralSolubility/halite.dat` | Ksp: `logK25 1.57; dH 3841` (a **model** van't Hoff param) |
| `chemistry/salts/halite.dat` | calorimetric anchor: `solubility 6.144; dissolutionEnthalpy 3880` (a **measured property**) |
| `phases/solid/halite.dat` | crystal: `rho_p 2165; k_v 1` |

The split by *concern* (equilibrium vs energy vs crystal) fragmented the data
about **one object**. Even the architect got two "halite" files confused (the
`3880` vs `3841` question) — that is direct evidence the fragmentation costs
intelligibility. The goal restated: **scalable AND intelligible** — open one
file, see the whole solid.

## 2. The correct principle: mineral and component are autonomous entities

A **mineral** and a **component** are DIFFERENT entities distinguished by their
*function*, never by ion count:

- a **component** is a global chemical quantity — the thing carried in feeds,
  balances, specifications, and the user interface;
- a **mineral** is a concrete solid phase — crystal structure, properties, a
  dissolution/precipitation reaction, and a solubility equilibrium.

They may share the exact same global formula and still be different entities,
because they play different roles. Consequences (the contract):

1. **any** mineral may optionally have a homonymous apparent component —
   including multi-ion minerals and hydrates (`component/dolomite` = CaMg(CO₃)₂,
   `component/gypsum` = CaSO₄·2H₂O, `component/brucite` = Mg(OH)₂ are all legal);
2. the mineral **does not depend** on that component existing;
3. the component is **not the "parent"** of the mineral;
4. both may bind to the same chemical identity / true-species composition;
5. halite and sylvite are **not conceptual exceptions** — just the simplest
   cases that already happen to have a component authored.

> Whether a correspondence exists depends on its **utility** (is the solid ever
> a feed / balance / UI quantity?), NOT on the number of ions in the formula.

Therefore the unit of the unified file is the **mineral** — an autonomous
solid-phase entity that owns *all* its solid data — precisely because it is one
entity, regardless of whether a homonymous component is also authored. (The
earlier draft justified this by claiming multi-ion minerals *cannot* be
components; that was wrong — a false thermodynamic restriction — and is retracted.)

## 3. The proposal (refined 2026-07-14 — additive, coexisting typed views)

**One authoring file per substance in the flat `data/standards/components/`; the
parser normalises it into SEVERAL typed internal entities that can be ACTIVE
SIMULTANEOUSLY.** The property package does NOT choose molecular *xor*
speciated — in an electrolyte equilibrium the solid, its aqueous ions, the
aqueous complexes, AND the apparent global quantity all coexist:

```
CaMg(CO3)2(s)  ⇌  Ca2+ + Mg2+ + 2 CO3--        (solid + ions + apparent, all live)
```

So the package ACTIVATES the applicable set of entities/relations/models; several
representations coexist and keep distinct semantic identities. From one
`components/dolomite.dat` the parser must expose at least:

- the chemical **identity** `dolomite` (+ elemental composition);
- the apparent/global **component** `dolomite` (feeds, balances, UI);
- the **solid phase** `dolomite(s)` (dissolution reaction, equilibrium, crystal);
- the **map to aqueous species** (dissociatesTo → Ca2+, Mg2+, CO3--).

Two clarifications that were wrong in earlier drafts:
- A `solidPhase` block IS a legitimate TYPE. "The role is not stored on the
  substance" means only that the file does not *pre-decide* which representation
  a concrete case uses — NOT that component / aqueous-species / solid-phase stop
  being different types.
- Phase-dependent properties (Cp, ρ, Hf) are properties of a PHASE / reference
  state, not of an abstract neutral molecule. They live INSIDE the phase block,
  never in a generic `molecular {}`. Treating dolomite as a lumped molecular
  pseudo-component is an EXPLICIT, parameterised representation — never automatic
  just because a formula exists.

### Authoring schema

```
identity
{
    name dolomite; formula "CaMg(CO3)2";
    elementalComposition { Ca 1; Mg 1; C 2; O 6; }
}
component { dissociatesTo { Ca2+ 1; Mg2+ 1; CO3-- 2; } }   // general stoichiometry, no 1+1 limit
solidPhases
{
    dolomite                                   // 1..N phases (a component may have many polymorphs)
    {
        dissolutionReaction { /* in the adopted species basis */ }
        equilibrium   { logK25 ...; dH ...; }
        thermochemistry { Hf ...; Cp ...; }    // PHASE props, here not in a molecular block
        crystal       { rho ...; /* k_v, habit */ }
    }
}
```

(The blocks below in §3-legacy show the same fields laid out flat; the schema
above is the ratified shape.)  Earlier flat sketch, for field reference:

```
recordType mineral;
schemaVersion 1;

mineral halite; formula "NaCl";

// (1) the dissolution reaction, written in Choupo master ions
reaction { masters ( { ion Na; nu 1; } { ion Cl; nu 1; } ); }

// (2) EQUILIBRIUM -- the model parameters the SpeciationSolver reads for K(T)/SI
equilibrium
{
    logK25 1.57;
    dH     3841;                 // van't Hoff MODEL slope paired with logK25 (NOT calorimetric)
    // analytic ( ... ); validC ( 0 200 );   when the source carries a T-fit
    source "USGS PHREEQC phreeqc.dat (public domain)";
}

// (3) CALORIMETRIC -- measured property the crystalliser reads for the heat duty
//     (present ONLY for solids that are actually crystallised)
calorimetric
{
    solubility          { value 6.144; unit mol/kgWater; T 298.15; }
    dissolutionEnthalpy { value 3880;  unit J/mol; basis "NaCl(s) -> Na+ + Cl-"; }
    source "Pinho & Macedo, J. Chem. Eng. Data 50 (2005) 29 (primary)";
}

// (4) SOLID PHASE -- crystal, the PBE crystalliser reads for PSD
//     (present ONLY for solids that are actually crystallised)
solid { rho_p 2165; k_v 1; habit cubic; }
```

The two enthalpies that confused us now sit **side by side, role-labelled, in one
file** — `equilibrium.dH` (model) vs `calorimetric.dissolutionEnthalpy`
(property) — impossible to mistake, nothing to reconcile.

Blocks (2)+(3)+(4) are **optional and independent**: a scaling-only mineral
(dolomite) ships just `reaction` + `equilibrium`; a crystallised salt (halite)
ships all four. This is why it scales — the file grows exactly to what is known.

## 4. What stays relational (and MUST NOT be folded in)

These are genuinely multi-substance and keep their homes — folding them into a
mineral file would re-create duplication, not remove it:

- `components/<salt>.dat` — apparent-salt identity + `dissociatesTo` (the
  *dissolved* salt, a different object from the crystal).
- `species/aqueous/<ion>.dat` — ion thermo (Na⁺ is shared by NaCl, Na₂SO₄, NaOH…).
- `parameters/electrolyte/pitzer/…` — **pair** params (Na-Cl is a *pair*, shared).
- `chemistry/aqueousSpeciation/…` — complex-formation reactions (relational).

This is exactly the CLAUDE.md three-axiom split: intrinsic-to-one-solid → its
own file; pair/ion → relational home.

## 5. Net effect on the tree

- **Removed homes:** `chemistry/mineralSolubility/`, `chemistry/salts/`,
  `phases/solid/` → folded into the existing flat `components/`.
- The solid concern collapses to **one flat directory of substance-entities**
  (`components/`), plus the genuinely-relational `species/` (ions) and
  `parameters/` (pairs). No per-kind solid directories at all.
- A new precipitating solid = **one new `components/<name>.dat`**, discovered by
  `recordType mineral`; no "which of three homes?", no new folder.
- Consistent with the settled "components stays PHYSICALLY FLAT" rule: role
  (mineral / dissolved-salt / molecular) is a property of the file's blocks and
  `recordType`, never of a subfolder.

## 6. Migration (bounded)

1. **Vertical spike first:** halite only — write `minerals/halite.dat`, migrate
   the 3 readers, prove SI + crystalliser duty byte-identical, corpus green.
2. Generate the other 65 from the current 3 homes (mechanical merge script;
   my `pitzer_minerals_to_choupo.py` already emits block (1)+(2)).
3. **Readers to update (only 3 sites):**
   - `SpeciationSolver.cpp` — read `equilibrium{}` (was `mineralSolubility/`).
   - `CrystallisationHeat.cpp` / `Crystalliser.cpp` — read `calorimetric{}` (was `salts/`).
   - `Component.cpp` / `ThermoPackageBuilder.cpp` — read `solid{}` (was `phases/solid/`).
4. Update `gen_minerals.py`, `check_minerals.py`, the case snapshots (`bin/choupo-import`).
5. Corpus 275/0 gate at every step; goldens unchanged (values identical, only file layout moves).

## 7. Open questions for ratification

- **Home path:** RESOLVED (V. Geraldes) — the flat `data/standards/components/`,
  NOT a new `minerals/` directory. A mineral is a substance-entity like any
  other; it lives with the components, tagged `recordType mineral`. (An earlier
  draft proposed a separate `minerals/` folder — retracted; it re-introduced a
  classification the flat components/ home deliberately avoids.)
- **Component ↔ mineral correspondence:** the link is an OPTIONAL, symmetric
  soft pointer between two autonomous entities (per §2) — e.g.
  `mineral halite` ↔ `component NaCl`, and equally `mineral dolomite` ↔ an
  optional `component dolomite` if one is ever authored for feeds/balances.
  Neither side is required; neither owns the other. Confirm the pointer carries
  navigation only, no data, and lives on both files (or on neither until useful).
- **`gasLiquid/` and `ionExchange/`** stay in `chemistry/` (they ARE reactions,
  not solids) — unchanged. Confirm.
- Does this reopen anything else in the 7-homes contract? (Assessment: no —
  components/species/parameters/aqueousSpeciation untouched.)

## 8. Recommendation

Proceed **spike-first**: build `minerals/halite.dat` + migrate its 3 readers,
prove byte-identical SI and crystalliser duty, THEN decide on the full 66.
No mass move until the spike convinces.

---

## 9. Post-audit synthesis (2026-07-14) — does one file feed every model?

Three read-only audits traced every consumer of a substance's data.
**Verdict: yes — the single file with additive, coexisting typed views feeds
100% of the existing thermodynamic machinery, and the unified reader already
partially exists.** The work is bounded reader alignment, not new plumbing.

### Two saturation mechanisms MUST both live in the schema
- **Ionic salt/mineral:** `solidPhases.<p>.equilibrium { logK25; dH }` (mass-action
  Ksp) + `calorimetric { dissolutionEnthalpy; solubility }`. Feeds SpeciationSolver
  (SI) + the crystalliser duty.
- **Molecular solute** (sucrose, KHT): a polynomial `c_sat(T)` curve
  (`solubilityCurve { coefficients; dHcryst }`), a DISTINCT mechanism read by
  `Component::c_sat()` + BatchCrystalliser. If the schema omits it, non-electrolyte
  crystallisers break. So a `solidPhases` block carries EITHER an ionic
  `equilibrium{}` OR a molecular `solubilityCurve{}` (a substance may have either).

### Boundaries the audit makes non-negotiable
1. `equilibrium.logK25` (mass-action K, van't Hoff) is a DIFFERENT datum from
   `calorimetric.dissolutionEnthalpy` (measured ΔH_soln). Never conflate (the halite
   3841-vs-3880 confusion).
2. **Salt solid enthalpy stays ion-derived** at build time (`Σν·hfAq − dH_soln`,
   the subtraction never stored); the ions' `hfAq` live in `species/aqueous/`
   (relational, shared — NOT in the component file). A dissociating salt carries NO
   `standardThermochemistry` (`check_ion_pins.py` exits 1 if both). A MOLECULAR solid
   (sucrose) DOES carry its solid rung in `molecular{}`. Mutually exclusive.
3. The "1 cation + 1 anion" limit is a property of the single-salt ADAPTER, not the
   data — `dissociatesTo` takes general stoichiometry; a true double salt (carnallite)
   simply routes through the multi-ion PitzerHMW path, which ignores `dissociatesTo`.
4. The multi-ion speciation world stays `species/aqueous/` + `chemistry/aqueousSpeciation/`
   network-driven; the unified salt file reaches it ONLY via the existing
   `recordType mineral` component scan.

### Final schema (ratified shape)
```
identity  { name; formula; [elementalComposition] }   // elemental only if formula unparseable
molecular { MW; Tc; Pc; omega; Tb; HvapTb; Vliq; vaporPressure{}; *HeatCapacity{};
            uniquac{r;q}; groups{unifac(...)}; [solid rung Hf_298 for MOLECULAR solids] }
component { dissociatesTo { <ion> <nu>; ... } }        // apparent->ions, general stoichiometry
solidPhases {
    <phaseName> {                                       // 1..N (polymorphs)
        dissolutionReaction { ... }
        equilibrium   { logK25; dH; [analytic] }        // ionic Ksp   } exactly
        | solubilityCurve { coefficients; dHcryst }     // molecular    } one
        calorimetric  { solubility; dissolutionEnthalpy }   // if crystallised
        crystal       { rho_p; k_v; [habit] }           // collapses today's arity-2 solid dup
    }
}
```

### Bounded implementation (NOT structural)
- Extend the two lift-tables (`Component.cpp` `lift()`, `Database.cpp` `projectLocal`)
  to know `molecular` (else `MW` "vanishes" and load throws).
- 4 reader path/name fixes to accept `solidPhases.<p>.{dissolutionReaction,equilibrium,
  calorimetric,crystal}` where builder/SpeciationSolver today read top-level
  `solid{}`/`calorimetric{}`/`equilibrium{}`/`reaction{}`.
- Parser normalises one file → {identity, apparent component, solid phase(s), aqueous map}.
- Bonus: unifying `crystal{}` RETIRES the current arity-2 duplication (NaCl solid lives
  twice: `NaCl.dat solid{}` + `phases/solid/halite.dat`).
- Migration: vertical spike (NaCl+halite) → prove SI + crystalliser duty byte-identical,
  275/0 → then the corpus. Same discipline as before, correct target this time.

---

## 10. Spike RESULT (2026-07-14) — proven byte-identical

Vertical spike implemented and validated (ratified schema + ChatGPT's 4 corrections):

- **`components/NaCl.dat`** unified: `component.speciesMap { Na 1; Cl 1; }` +
  `solidPhases { halite { dissolutionReaction; equilibrium; calorimetric; crystal } }`,
  per-datum provenance preserved. The three legacy homes
  (`chemistry/mineralSolubility/halite.dat`, `chemistry/salts/halite.dat`,
  `phases/solid/halite.dat`) DELETED — one file is now the sole source.
- **Readers** (dual: unified + legacy fallback): `Component::readFromDict`
  (lift `component.speciesMap`→`dissociatesTo`; crystal from `solidPhases.<p>.crystal`),
  `ThermoPackageBuilder` (`speciesMof` helper; solid/calorimetric from
  `solidPhases.<phase>`), `SpeciationSolver` (scan `components/*.dat` for `solidPhases{}`).
- **Byte-identical:** model4 halite SI −0.911; crystalliser05 duty; evaporator06;
  pitzer01_nacl — all golden PASS. **Full corpus 275/0.**
- **Multi-ion proof (`components/dolomite.dat`):** `speciesMap { Ca 1; Mg 1; CO3 2 }`
  (>1 cation, accepted — routes through the multi-ion path, not the 1+1 single-salt
  adapter) with a `dissolutionReaction` in the DISTINCT HCO3/H⁺ basis. Dolomite SI
  +6.546 identical before/after the move. Corpus 275/0.

Conclusion: one authoring file per substance feeds every existing thermodynamic
model byte-identically; multi-ion stoichiometry flows. Ready to migrate the rest
(the other 64 minerals + the salts) on confirmation.
