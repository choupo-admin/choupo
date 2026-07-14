# STOP-AND-BREATHE review — the property dictionary convention (2026-07-04)

**Convened by:** Vítor ("ANDAS A APAGAR FOGOS! TEMOS DE PARAR, RESPIRAR FUNDO E
REVER A ARQUITETURA DE PROPRIEDADES!").  He is right.  This review names the
disease, maps it onto the ALREADY-RATIFIED architecture, and proposes the
implementation path.  **No code was written for this review; the half-built
`solutes` patch was reverted** (tree = last green commit, 222/0).

---

## 1. The firefighting pattern, admitted

The ammonia arc produced five consecutive patches to the same wound:

| Fire | Patch |
|---|---|
| separator ideal at 200 bar | fugacity in the Gibbs reactor |
| dissolved gas by extrapolated Psat | Henry pairs + `solvent` keyword |
| "não há sumo no overlay!" | comments quoting constants |
| silent physics | `[henry]` LOUD announcement |
| "a convenção está obscura!" | a `solutes ( )` keyword (half-built, reverted) |

Each patch was locally correct.  Together they are the SYMPTOM: **the
`thermoPackage` is a pile of flat, ad-hoc keys** (`activityModel` +
`equationOfState` + `transport` + `solvent` + per-case `role` overlays + pairs
found implicitly by filename).  To express ONE sentence — *"H₂ and N₂ dissolve
in liquid NH₃ by Henry's law"* — an author must touch **three files** and know
an unwritten choreography.  That is not a convention; it is folklore.

## 2. The diagnosis: the declarative layer is missing — and it is ALREADY DESIGNED

The **final property architecture** (ratified 2026-06-30, implementation
pending) says:

> `propertyPackage` declares → `ThermoPackageBuilder` assembles →
> `ThermoPackage` computes.  The reference basis (`ReferenceRung`) lives INSIDE
> the `propertyMethod`, declared per phase.  The old `thermoPackage` stays
> loadable as a degenerate `propertyPackage`.

Everything Vítor has been angry about maps 1:1 onto that design:

| Today's folklore | Where the ratified architecture puts it |
|---|---|
| `activityModel { model ideal; }` (what does it cover?!) | a **`propertyMethod`** whose `referenceBasis` SAYS "liquid solvent: `pureLiquidRaoult`, γ→1 as x→1" |
| `solvent NH3;` (bare word, silent activation) | the package's **solution block** — one visible declaration |
| `role solute;` case overlays ("no juice!") | **DELETED** — solutes are named in the package, next to the solvent |
| Henry pair found silently by filename | **`parameters { henryPairs {...} }`** — declared, path visible, **REFUSE if missing** (U3) |
| the KK/KI physics invisible from the case | the method's `provides`/`requires` + the `[henry]` announcement (kept) |

## 3. The Henry world IS a reference rung — one honest amendment needed

The dilute-solution structure the ammonia loop uses is precisely the
architecture's `ReferenceRung` idea:

```
recordType propertyMethod;   name henryDilute;   family solution;
referenceBasis
{
    liquid
    {
        solvent { rung pureLiquidRaoult;        convention "gamma -> 1 as x -> 1"; }
        solutes { rung infiniteDilutionHenry;   convention "gamma* -> 1 as x -> 0";
                  relation "y phi_V P = x gamma* H(T) exp[v_inf (P-Ps)/RT]"; }
    }
    vapour  { rung idealGasReference; }   // phi from the package's declared EoS
}
requires { henryPairs; }      // REFUSE loudly when a declared solute has no pair
provides { Kvalues; dissolvedGasComposition; }
```

**The one amendment to record:** the ratified U2 declares the rung **per
phase**; the dilute-solution structure needs **two rungs inside ONE liquid
phase** (solvent on Raoult, solutes on infinite-dilution).  This is not a new
idea — it is Gibbs-Duhem's own split — but the `referenceBasis` grammar must
allow per-GROUP rungs within a phase.  (The electrolyte methods already do this
implicitly: water molecular, ions on the aqueous rung.)

And the ammonia package becomes ONE readable manifest:

```
recordType propertyPackage;   name ammoniaSynthesisLoop;
components      { N2; H2; NH3; Ar; water; }
propertyMethods { vapour eos.SRK;  liquid solution.henryDilute;  transport chung; }
solution        { solvent NH3;  solutes ( H2 N2 ); }        // the ONE sentence
parameters      { henryPairs { H2-NH3  "henrysLaw/H2-NH3.dat";
                               N2-NH3  "henrysLaw/N2-NH3.dat"; } }
```

Three files of folklore → one declarative record.  The overlays die.  Nothing
is silent.  `thermoPackage` keeps working as the degenerate form (U1) — zero
forced migration of the 230 tutorials.

## 4. The proposed implementation path (for Vítor's decision)

The ratified plan prescribes a **vertical spike before any mass migration**,
and names `aqueousNaCl_pitzer` as the spike.  This review proposes **swapping
the spike order**:

1. **Spike A — `ammoniaSynthesisLoop` (gas solubility).**  SMALLER than the
   NaCl spike: no true species, no chemistry sets, no speciation — just
   `propertyPackage` + `propertyMethod` (with the per-group rung amendment) +
   `ThermoPackageBuilder` + declared `parameters`.  It proves the entire
   declarative plumbing on the system that is burning TODAY, with all
   calibration data already in hand (Wiebe/Larson, validated 1.8%).
2. **Spike B — `aqueousNaCl_pitzer`** as ratified: adds `componentApproach`,
   `apparentToTrue`, chemistry — the electrolyte half — on top of proven
   plumbing.
3. Only then: migration map for the existing dicts (degenerate-form forever is
   acceptable; migration is per-case opt-in, never forced — the fractal-units
   precedent).

**Recommendation (conviction, not a menu):** do Spike A first.  It is the
smallest end-to-end proof, it retires the exact obscurity Vítor hit, and it
de-risks Spike B.  Do NOT patch the current `thermoPackage` further — every
further flat keyword deepens the folklore the architecture exists to kill.

## 5. What stays true regardless

- Pair data in pair files (axiom 2) — the review does not move the physics.
- The KK/KI formulation, the calibrated pairs, the `[henry]` announcement —
  all survive; they become the METHOD the package selects.
- `data/standards/components/` flat, O(1) — untouched (ratified).
- The theory guide's two-worlds + KK derivation — already written, unchanged.
