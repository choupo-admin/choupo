# Forum — γ-φ (Raoult) vs φ-φ (EOS-EOS) for the flash (2026-07-04)

**Convened by:** Vítor ("convoca o forum porque estou confuso!").
**Trigger:** the ammonia separator uses `activityModel { model ideal; }` +
Psat/Raoult while the reactor uses SRK fugacity — an inconsistency at 200 bar.

## The confusion, named: there are TWO worlds for a VLE K-value

A flash needs the K-value K_i = y_i/x_i. There are two consistent ways to get it,
and they answer to different physics:

### World 1 — γ-φ (activity-coefficient / "chemical" approach)
```
   K_i = γ_i · Psat_i(T) · [φ_i^sat · Poynting] / (φ_i^V · P)
   low P:  φ→1, Poynting→1   ->   K_i ≈ γ_i · Psat_i / P   (modified Raoult)
```
- The LIQUID non-ideality lives in **γ_i** (from an activity model: NRTL,
  UNIQUAC, eNRTL, Wilson, or **ideal → γ=1 = plain Raoult**).
- Needs a **Psat_i(T)** for every component -> the component must be
  sub-critical (have a real vapour pressure).
- **Right for:** low-to-moderate pressure, condensable species, strongly
  non-ideal LIQUIDS — polar mixtures, azeotropes, electrolytes. The star is γ.
- **This is what Choupo's flash does today** (γ=1 with `activityModel ideal`).

### World 2 — φ-φ (equation-of-state / EOS-EOS approach)
```
   K_i = φ_i^L(T,P,x) / φ_i^V(T,P,y)     both roots of the SAME cubic EOS
```
- One EOS (SRK / Peng-Robinson) gives BOTH the vapour and the liquid fugacity
  coefficient, from its vapour and liquid volume roots. **No Psat, no γ.**
- Handles **supercritical components naturally** — N2, H2 above their Tc have no
  Psat, but the EOS liquid root still gives their (low) solubility.
- **Right for:** high pressure, light-gas / gas-processing, hydrocarbons,
  anything with supercritical components. The star is the vapour φ.

## The diagnosis for the ammonia separator

At **200 bar, 250 K**: N2 (Tc 126 K) and H2 (Tc 33 K) are SUPERCRITICAL — they
have NO physical Psat. The current flash fakes one by **extrapolating their
Antoine curve above Tc**, then runs Raoult (γ=1). NH3 condenses on its real
Psat; the dissolved N2/H2 come from that extrapolated-Psat Raoult split, which
is thermodynamically hollow. **This is squarely a World-2 (φ-φ) problem being
solved with World-1 (γ-φ) tools.** And it is INCONSISTENT with the reactor next
door, which already computes SRK fugacity.

(Correction on the record: an earlier claim blamed "SRK over-dissolving H2" for
the liquid impurity — wrong; the flash never calls the EOS. The dissolved gas is
the extrapolated-Antoine Raoult artefact.)

## Voices

- **Thermodynamicist:** for a gas-processing condensation with supercritical
  components, φ-φ is not a refinement — it is the CORRECT world. Raoult with an
  above-Tc extrapolated Psat has no physical basis. eNRTL/NRTL would be the
  wrong fix (those are liquid-γ models for World 1); the fix is the EOS liquid
  root.
- **Numerics:** the flash already solves the Rachford-Rice / Gibbs split; the
  only change is the K-value evaluator — swap Psat/Raoult for K = φ^L/φ^V, with
  an inner loop because φ depends on composition (successive substitution, the
  SAME shape as the reactor's fugacity loop we just built). SRK already exposes
  the vapour root; it needs the LIQUID root (the small real root) + its φ^L.
- **Pedagogy:** the student should SEE the two worlds and WHEN each applies —
  that is the lesson, not a hidden switch. A cubic EOS drawn as one curve with a
  vapour and a liquid root, giving both φ's, is the picture.
- **Credo-keeper (no silent crutch):** the flash must ANNOUNCE which world it is
  in ("VLE by SRK φ-φ" vs "VLE by modified Raoult, γ=ideal"). And it must not
  silently extrapolate a Psat above Tc — that is exactly the hidden magic the
  credo forbids.
- **Backwards-compat:** most flash tutorials are low-P γ-φ (ethanol-water,
  benzene-toluene) and MUST stay byte-identical. So the choice of world has to
  be driven by the DECLARED thermo, not forced on everyone.

## Ratified decision

- **Add a φ-φ (EOS-EOS) K-value path to IsothermalFlash**, selected
  automatically when the package declares a real cubic EOS (SRK / PengRobinson)
  — the SAME "real EoS -> real thermo" trigger we adopted for the Gibbs reactor.
  `equationOfState { model idealGas; }` (or an activity model) keeps the
  existing Psat/Raoult (γ-φ) path, byte-identical.
- The φ-φ path: K_i = φ_i^L/φ_i^V from the cubic's two roots, inner successive-
  substitution on composition (mirrors the reactor's fugacity loop). No Psat
  needed -> supercritical N2/H2 handled honestly.
- **The flash announces its world** (φ-φ vs γ-φ) at verbosity, and NEVER
  extrapolates a Psat above Tc in the φ-φ path.
- This makes the whole 200-bar loop consistent: SRK everywhere (reactor AND
  separator), the ammonia product purity/dissolved-gas becomes real.

## Rejected

- Forcing φ-φ on all flashes (breaks the low-P γ-φ tutorials; wrong world for
  polar/electrolyte liquids).
- "Fixing" the separator with a liquid activity model (NRTL/eNRTL) — wrong
  world; the problem is supercritical vapour φ, not liquid γ.
- Keeping the above-Tc Psat extrapolation silent (credo violation).

## Build order (pending Vítor's go)

1. SRK/PR: expose the LIQUID root φ^L (they have the vapour root already).
2. IsothermalFlash: a φ-φ K-evaluator + the successive-substitution wrapper,
   selected when `!eos().isIdeal()`; announce the world.
3. Validate: a low-P γ-φ tutorial stays byte-identical; the ammonia separator
   flips to φ-φ and the dissolved-gas becomes physical.

---

# MIT thermodynamics faculty panel (2026-07-04)

Vítor asked for a panel of MIT-tradition chemical-engineering thermodynamicists
to pressure-test the "just add φ-φ" verdict.  Archetypal voices (expertise, not
named individuals).  They AGREED with the framework but sharpened it hard.

## Prof. A — molecular / statistical thermodynamics
"Fugacity is the right currency, yes. But be honest about the tool: SRK and
Peng-Robinson are CUBIC EOS built for NON-POLAR molecules. Ammonia is strongly
POLAR and hydrogen-bonds (associates). A cubic with van der Waals one-fluid
mixing rules will get the NH3 liquid fugacity WRONG unless you feed it binary
interaction parameters, and even then the liquid density and the association are
crude. φ-φ is the correct FRAMEWORK; a plain cubic is a MEDIOCRE realisation of
it for this mixture. The rigorous tool is an association EOS (SAFT / CPA). Don't
oversell 'SRK everywhere' as 'now it's exact.'"

## Prof. B — applied phase equilibria
"For the DISSOLVED light gases — N2, H2 in liquid NH3 — the textbook-correct and
often MORE accurate route is asymmetric: HENRY'S LAW for the supercritical
solutes (K_i = H_i(T,P)/(φ_i^V P) with a Poynting correction) and Raoult/γ for
the condensing solvent NH3. That is exactly the 'World 1.5' industry uses for
gas solubility. A symmetric cubic can do it, but Henry's law is the honest,
data-light path when you lack kij. Choupo already has a Henry's-law pair
catalogue — use it."

## Prof. C — electrolyte / mixed-solvent
"Agreed the fix is NOT a liquid activity model here (no electrolytes, no strong
liquid γ). But note the boundary: the moment a case has an aqueous or polar
condensed phase with real liquid non-ideality, you are back in World 1 and the
EOS is wrong. So the selection must be by the CHEMISTRY, not a blanket 'SRK
declared → φ-φ'. Tie the world to what the phase IS."

## Prof. D — EOS development / molecular simulation
"Two numerical traps in an EOS flash you must handle or you'll ship nonsense:
(1) the TRIVIAL-ROOT problem — both phases converge to the same composition/root
at high P near the critical region; you need a stability test (Michelsen TPD) to
seed and to reject it. (2) the liquid-root selection — pick the SMALL real root,
and guard the case where the cubic has one real root (supercritical). Choupo has
Michelsen's StabilityTest already — wire it in."

## Prof. E — process systems / computation
"The K = φ^L/φ^V loop is successive substitution and it CRAWLS or diverges near
the critical point. Wrap it in an accelerated (Wegstein/GDEM) or a proper
Newton-on-lnK, and cap it. And — pedagogy — PRINT the fugacity coefficients the
student would otherwise never see: φ_NH3^L, φ_H2^L, the K's. The glass box is the
whole point."

## Panel consensus — the SHARPENED decision

1. **φ-φ is the right framework for the high-pressure vapour** and the correct
   home for supercritical N2/H2 — ADOPT it (as the initial forum said).
2. **But a plain cubic on polar NH3 is only APPROXIMATE** — ship it with kij
   support and ANNOUNCE the limitation ("cubic EOS, polar liquid: indicative;
   provide kij or expect ~10-20% on solubility"). Do NOT claim rigour we don't
   have. A SAFT/CPA association EOS is the real-rigour roadmap, not this PR.
3. **Offer HENRY'S LAW as the honest, data-light alternative** for the dissolved
   gases — asymmetric γ-φ using Choupo's existing Henry pair catalogue. For the
   ammonia separator this may beat a kij-less cubic.
4. **Select the world by the PHASE/chemistry, not a blanket EOS flag** —
   a polar/aqueous liquid stays World 1.
5. **Numerics:** seed + screen with Michelsen StabilityTest (already in Choupo),
   guard the trivial root and the single-root case, accelerate the SS loop.
6. **Glass box:** the flash announces its world AND prints the φ's / Henry
   constants it used.

## Revised build order

1. SRK/PR: liquid-root φ^L + kij mixing-rule support (kij default 0, announced).
2. IsothermalFlash: a φ-φ K-evaluator, seeded/screened by StabilityTest,
   accelerated SS, trivial-root guard; announce the world + print φ's.
3. A parallel **Henry's-law** path for supercritical solutes (asymmetric γ-φ),
   from the existing Henry catalogue — offered where the solvent is condensable
   and the solutes are supercritical.
4. Validate: low-P γ-φ tutorial byte-identical; ammonia separator via φ-φ (with
   an honest accuracy caveat) AND via Henry, compared.

Bottom line the panel wants on the record: **"real EoS → real thermo" was the
right instinct, but the honest headline is "a consistent φ-φ framework with a
cubic that is approximate for polar NH3, plus a Henry's-law alternative" — NOT
"now the separator is exact."**
