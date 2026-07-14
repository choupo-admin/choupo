# Forum — mixing rules & per-component models: the "cão e gato" grammar (2026-07-04)

**Convened by:** Vítor, on reading the plant thermoPackage: *"Faltam as regras
de mistura! Compostos diferentes podem usar modelos diferentes... Já percebi
que não há o ULTIMATE MODEL e que há uma altura em que é 'seja o que Deus
quiser' e 'quem não tem cão caça com gato'. Mas não se pode embrulhar esta
falta de conhecimento em verborreia matemática e escondê-la do utilizador!"*

## The founding principle (ratified as doctrine, named his way)

> **THE CÃO-E-GATO PRINCIPLE.**  There is no ultimate property model.  Every
> package is an assembly of workhorses, fallbacks and improvisations — and
> every one of them must be DECLARED in the dict and ANNOUNCED in the log,
> with its quality stated.  Hunting with the cat is honest engineering;
> hiding the cat is fraud.

The audit that triggered this: the gas-viscosity MIXTURE rule is **Wilke,
hardcoded in `ThermoPackage::viscosityGas`, undeclared and unannounced** —
a correct, classical rule made dishonest purely by its silence.

## The two gaps, named

1. **Mixing rules are invisible.**  The dict declares the PURE-component
   models (`viscosity { model Chung; }`) but is silent on how pures combine:
   Wilke for viscosity (hardcoded), whatever conductivity does (hardcoded),
   van-der-Waals one-fluid + kij for the cubics (declared only via kijPairs),
   and for γ-models the G^E form itself (implicit).
2. **No grammar for per-component heterogeneity.**  Water deserves IAPWS
   where we have it; a trace solute can live with corresponding states; a
   pseudo-component may only have an estimate.  The engine already half-does
   this (the pureFluid IF97 override, announced) — but there is no declared,
   general form.

## Ratified grammar (amendments A4-A6, extending A1-A3)

### A4 — every mixture-forming step DECLARES its rule
```
transport
{
    viscosity
    {
        model    Chung;          // pure-component workhorse
        mixing   Wilke;          // HOW pures combine (default Wilke, ANNOUNCED)
    }
    thermalConductivity { model Eucken;  mixing WassiljewaMason; }
    diffusivity         { model Fuller; }        // pairwise by construction
}
equationOfState
{
    model    SRK;
    mixing   vanDerWaals1f;      // declared; kij from parameters (A3-verified)
}
```
Omitted `mixing` = the classical default, ACCEPTED but ANNOUNCED in the log
("mixing: Wilke (default)") — never silent.  For activity models the G^E form
IS the mixing rule; the docs say so explicitly instead of leaving it implicit.

### A5 — per-COMPONENT model overrides, where they are LEGAL
```
viscosity
{
    model    Chung;                  // the fleet default
    water    { model IAPWS; }        // measured formulation where we have it
    sucrose  { model none; }         // nonvolatile: no gas viscosity, SAY SO
}
```
**Legality rule (the professors' line):** per-component overrides are LEGAL
for pure-component correlations and TRANSPORT properties (Gibbs-Duhem does not
constrain them) and for reference conventions (A1); they are ILLEGAL for the
equilibrium Gibbs surface (one γ-model / one EoS per phase — ratified).

### A6 — the RESOLVED-MODELS TABLE (the uncomfortable table, printed)
At assembly, the engine prints one table that hides nothing:
```
[thermo] resolved models (per component x property):
  component  Psat        Cp_ig      mu_gas          quality
  water      Antoine     poly       IAPWS R12-08    measured formulation
  sucrose    nonvolatile solidCp    n/a             --
  N2         Antoine     poly       Chung           corr.-states (~0.3% N2)
  ethanol    Antoine     poly       Chung           corr.-states (polar: ~5%)
  mixing: viscosity Wilke . conductivity <rule> . EoS n/a (idealGas)
```
Every cell that is an estimate SAYS estimate; every fallback SAYS fallback;
`n/a` is printed, never blank.  This table is the cão-e-gato principle made
visible — the student sees exactly which cat is hunting.

## Build order (after the running storm lands — no src edits until then)
1. Announce the EXISTING hardcoded rules (Wilke; the conductivity rule) — the
   smallest honesty fix, zero behaviour change.
2. `mixing` slots in the transport/eos sub-dicts (default = current, announced).
3. A5 per-component override plumbing (generalise the pureFluid route).
4. The A6 resolved-models table at package assembly.
5. Plant tutorial + docs/ai updated to the full grammar as the exemplar.

## Rejected
- Auto-selecting "the best" model per component (an ultimate-model fantasy;
  violates no-silent-crutch — selection is the author's, visible).
- Hiding mixture rules in "advanced" documentation (the dict IS the truth).
- A quality SCORE (false precision); quality is a stated WORD (measured /
  corresponding-states / estimated / fitted / n-a) with a caveat when known.
