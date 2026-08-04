# Adsorption Contract v1 — the physical contract common to A1-A6

**Status:** decision record (forum #116/#118).  Freezes states, bases, signs,
multicomponent equilibrium, ownership of the energy, kinetic scope, units,
validity/provenance and the interfaces between the isotherm, the batch vessel,
the bed and the cycle sequencer — BEFORE any implementation beyond A1.  An
adversarial review closes the document.  Changing this contract requires a new
forum entry; implementations cite the section they honour.

---

## 1. States and bases

### 1.1 Loading (the solid's state)

* **Canonical quantity:** `q_i` = mol of adsorbate i per kg of ADSORBENT
  (regenerated, dry) — `mol/kg`.  The engine's internal SI.
* `loadingBasis` is MANDATORY on every equilibrium record; the accepted forms,
  converted AT LOAD TIME (never on the hot path):
  `molPerKgAdsorbent` (canonical) · `mmolPerG` (x1) · `cm3stpPerG`
  (/ 22,413.6 cm3STP/mol, IUPAC 273.15 K / 1 atm — the factor is written into
  the converter) · `kgPerKgAdsorbent` (/ M_i).
* The solid's EXTENSIVE state is always `m_ads . q_i` [mol]; `m_ads` is the
  EQUIPMENT's adsorbent mass (the case), never the catalogue's.

### 1.2 Driving force (the gas state as the isotherm sees it)

* **Canonical:** partial pressure `p_i` [Pa].  `pressureBasis` is mandatory on
  the record: `partialPressurePa` (canonical) · `partialPressureBar` (x1e5) ·
  `concentrationMolM3` (p = cRT in the conversion, an ideal gas DECLARED).
* Fugacity is an EXTENSION POINT (§7): the API signature takes (T, p_i) and a
  future `fugacityAdapter` may pre-transform p_i -> f_i BEFORE the isotherm; the
  isotherm itself never knows the gas model.

### 1.3 Densities — the rho_p vs rho_bulk trap

* The catalogue (the adsorbent's identity) carries **rho_bulk** [kg/m3 of packed
  bed] — that is what the 3 current `.dat` files hold.
* BED INVARIANT: solid inventory per bed volume = `rho_bulk . q_i`
  [mol/m3_bed].  The 1-D source term uses `rho_bulk` directly; one NEVER writes
  `(1 - eps) . rho_p` with eps and rho_p from different sources (double counting
  the porosity — the classic error).
* `eps` (interparticle void) belongs to the EQUIPMENT (the case; it sets the gas
  hold-up and the interstitial velocity u = u_s/eps).  If a case declares eps
  and the catalogue rho_bulk, they are compatible by construction: rho_p is
  never needed in A1-A3.  (rho_p enters only at A4+ for the particle's thermal
  inertia — a future optional `rho_particle` field, an extension point.)

## 2. Signs and temperature

* **dH_ads < 0 = exothermic** (the current `.dat` convention, kept).
* van't Hoff: `b(T) = b_ref . exp( -dH_ads/R . (1/T - 1/T_ref) )` with `tRef`
  MANDATORY on the record (298 K today).  With dH_ads < 0, b decreases with T —
  a sanity check in the gate.
* The WHOLE API carries T explicitly (even in isothermal phases) — a
  non-isothermal A4 changes NO signature, only who supplies T.
* Energy (A4, reserved — do NOT implement): the heat released per unit time is
  `Qdot_ads = -Sum_i dH_ads,i . m_ads . dq_i/dt` >= 0 for exothermic adsorption;
  OWNER: the UNIT's energy balance (batch/bed), never the isotherm.  In the
  campaign ledger it enters as the reserved kind `adsorption` (new, beside
  reaction/latent/...), with validity requiring dH_ads present on ALL active
  pairs — otherwise a NAMED gap (the energyLedgerGap pattern, as always).

## 3. Multicomponent equilibrium

* **A1-A3 use EXTENDED Langmuir** (competitive):
  `q_i = q_max,i . b_i(T) . p_i / (1 + Sum_j b_j(T) . p_j)` — this is the PSA's
  current physics, preserved byte for byte.
* PEDAGOGICAL HONESTY (written in the manuals and in the records' headers):
  extended Langmuir is thermodynamically consistent only if all the q_max are
  equal; with unequal q_max it is a useful and self-inconsistent TEACHING model
  (it violates the adsorbed phase's Gibbs-Duhem).  The honest extension is IAST
  — extension point §7, NEVER a silent default.
* A two-layer ARCHITECTURE makes that possible:
  - `IsothermModel` — PURE, per pair (adsorbent x species): `q(T,p)`,
    `dq_dp(T,p)`, `qsat(T)`, `henryLimit(T)`;
  - `MixingRule` — takes the pure models + (T, vector p) and returns the vector
    q: `extendedLangmuir` (now) · `iast` (future).  The PSA, the batch vessel
    and the bed ALWAYS talk to the MixingRule, never to an isolated pure model
    (even single-component: a MixingRule over 1 species).
  - *v1 realisation (audited 2026-07-12):* the MixingRule IS the method
    `Adsorbent::loading(species, p_map, T)` — extended Langmuir at a single
    locus; IAST enters by dispatch in that method (`mixingRule` in the dict),
    without touching batch/bed/PSA.  A separate class is born only when the
    second rule exists (arity-1: no speculative abstraction).

## 4. Kinetics and transport — who owns what

* The isotherm is EQUILIBRIUM: the catalogue
  (`parameters/adsorption/equilibria/`), pair-dependent (axiom 2 of the data
  doctrine).
* LDF `dq_i/dt = k_i . (q*_i - q_i)` is EQUIPMENT: `k_i` [1/s] lumps film +
  macropore + crystal diffusion of THAT particle in THAT bed -> it lives in the
  CASE (axiom 3), with mandatory scope/provenance; a `k_i` missing for an active
  species is a NAMED REFUSAL, never a default.
* Axial dispersion `Dax` [m2/s]: equipment (the case), declared; correlations
  (Chung-Wen and the like) are future curation AIDS, never hidden defaults.
* Pressure drop (Ergun, A4+): reserved; u and P are DECLARED constants in A3 (to
  isolate transport) — A3's dict is born with `flow { u ...; P ...; }` so that
  A4 swaps the block for a model without touching anything else.

## 5. Units and validity

* Internal canonical SI: Pa, K, mol, kg, s, J.  Records declare units in the
  parser's 3 forms (named/bracket/raw) and the loader converts with dimensional
  verification — unit invariance is a GATE (the same case in bar and in Pa ->
  bit-identical after conversion).
* Every equilibrium record carries `validity { Trange (...); pRange (...); }`
  where the source gives it; evaluation outside the validity ANNOUNCES (a
  structured advisory, the PitzerActivity pattern), never staying silent and
  never refusing (the professor extrapolates on purpose — but knows he did).
* Per-record provenance is mandatory (origin/method with the primary citation);
  the gate refuses a record without it.

## 6. A1/A2/A3 interfaces (the frozen minimal API)

```cpp
// A1 -- src/thermo/adsorbent/
class IsothermModel {                    // EXPLICIT factory (the Choupo pattern)
    virtual double q     (double T, double p) const = 0;  // mol/kg, Pa
    virtual double dq_dp (double T, double p) const = 0;
    virtual double qsat  (double T) const = 0;
    virtual double henryLimit (double T) const = 0;       // lim p->0 q/p
};
class MixingRule {                       // extendedLangmuir | (iast, future)
    // pure: no state between calls; it takes the models in the constructor
    virtual std::vector<double> loadings (double T,
                       const std::vector<double>& p_partial) const = 0;
};
// Adsorbent = identity (name/type/rho_bulk) + access to the per-species
// IsothermModel loaded from parameters/adsorption/equilibria/<name>/.

// A2 -- batchAdsorber (choupoBatch): state {n_gas_i, q_i}; T, V_gas, m_ads
// declared; dq_i/dt = k_i (q*_i - q_i); dn_gas_i/dt = -m_ads dq_i/dt;
// p_i = n_gas_i R T / V_gas.  Conservation n_gas_i + m_ads q_i = const
// verified to machine eps at every accepted step.

// A3 -- fixedBedAdsorber (choupoBatch): conservative FV, cell j:
// eps V_j dc_ij/dt = F_conv(j-1/2) - F_conv(j+1/2) + F_disp(...)
//                    - rho_bulk V_j dq_ij/dt        [mol/s]
// dq_ij/dt = k_i (q*(T, p_ij) - q_ij);  Danckwerts inlet/outlet.
```

* The cycle sequencer (A5) talks to the BED through boundary conditions and
  events (step transitions), reusing choupoBatch's recipe layer — NEVER through
  internal access to the isotherm's state.  The CSS criterion is reserved,
  defined in A5 (the norm of the cycle-to-cycle profile difference under a
  declared tolerance).

## 7. Verified extension points (A4-A6 are not blocked)

| Extension | What A1-A3 already prepares | What is missing (and where it enters) |
|---|---|---|
| A4 energy | T throughout the API; dH_ads on the record; kind `adsorption` reserved in the ledger | the bed/batch T balance; the solid's Cp (a new field on the identity) |
| A4 Ergun | the isolated `flow{}` block in A3's dict | d_p, sphericity on the identity (optional); a P-u solver |
| A5 PSA/VSA | choupoBatch's recipe/events; the bed as a reusable unit | the sequencer + CSS |
| A6 TSA | van't Hoff is already T-dependent; the API carries T | a T ramp (already exists in ctrl/batch as setParameter) |
| IAST | the MixingRule layer | spreading-pressure integrals (a new MixingRule) |
| Fugacity | the isotherm is blind to the gas model | a p -> f adapter before the MixingRule |

## 8. Adversarial review (counter-examples attempted)

1. *"rho_bulk . q double-counts the porosity"* — no: rho_bulk is kg of solid per
   m3 of BED; multiplying by q [mol/kg] gives mol/m3_bed with eps nowhere.  The
   error only appears if someone writes (1 - eps) rho_bulk — forbidden by §1.3.
2. *"Extended Langmuir with unequal q_max violates consistency, and we are going
   to fix that by hiding it"* — rejected: it stands DECLARED as a teaching
   model; IAST is the explicit extension.  The gate does NOT demand equal q_max
   (that would break the current data); the manual teaches why.
3. *"LDF with a q* from a multicomponent MixingRule has no analytic solution ->
   A2's analytic gates die"* — false: the analytic gate freezes q*
   (single-component, fixed k) where the solution exp(-kt) is exact; the
   multicomponent case is validated by inventory at the final equilibrium (a
   scalar equation) plus conservation, not by an analytic trajectory.
4. *"Danckwerts at the outlet with pure upwind is redundant"* — true for pure
   convection, but the dispersion term requires an explicit dc/dz|L = 0; the last
   cell's stencil differs and MUST be in A3's spec (Agent D).
5. *"van't Hoff's b(T) with tRef implicitly 298"* — forbidden: tRef is mandatory
   on the record; the pin b(tRef) = b_ref is a gate.
6. *"Converting cm3STP/g with 22,414 vs 22,413.6 vs 22,711 (NIST STP)"* — a real
   1.3 % error source: the converter fixes IUPAC 273.15 K / 1 atm =
   22,413.6 cm3/mol and WRITES the factor used into the conversion log; a
   dataset declaring another STP convention declares it on the record.

*Author: Claude (autonomous loop), 2026-07-12, under #116/#118.  Human review:
Vitor (pending).  Implementations: A1 = migration + factory (Agent A, audited
against §1/§3/§5/§6); A2/A3 = the Agent C/D specs, frozen against §6.*

---

## 9. Decision records A4-A6 (architecture + anchors; NEVER a partial implementation)

**A4-energy** — the bed/batch gain the T balance with ONE declared lump per
phase (gas + solid in local thermal equilibrium; the gas/solid split is a later
extension, never a silent default).  Thermal source per cell:
`rho_b . Sum_i(-dH_ads,i) . dq_i/dt` [W/m3]; it requires `cpSolid` on the
adsorbent's identity (a NEW, curated field) — missing, the T balance REFUSES by
name.  Ledger: kind `adsorption`, E = Sum_i(-dH_ads,i) . D(m_ads . q_i) per
segment — an exact state difference (Hess), never a quadrature.  ANCHOR: the
adiabatic heating of a closed batch09, DT = Sum(-dH) . Dq . m_ads / (Sum n . cp)
solved by simultaneous inventory + energy (a 1-D root, the exact number to be
computed in the spec).

**A4-Ergun** — A3's `flow{u;P;}` block is REPLACED (not extended) by
`flow{model ergun; d_p ...; }` with u(z) from total continuity (constant Sum c
is no longer imposed — the fabricated carrier DIES here, and the gate is
`carrier_fabricated_mol < 1e-12` on the re-run batch13 anchor).
d_p / sphericity = the adsorbent's identity (optional, curated).

**A5-PSA/VSA** — the sequencer is the EXISTING recipe layer (choupoBatch's
time-triggered actions), NEVER a new driver: the steps
(pressurise / adsorb / blowdown / purge) are events that swap the bed's BCs; the
bed does not know which step it is in.  CSS: the L-infinity norm of the
difference between start-of-cycle (c, q) profiles on consecutive cycles, with
the tolerance DECLARED in the case; the driver announces cycle by cycle and
REFUSES to report averages before CSS.  ANCHOR: a 2-bed Skarstrom H2/CH4 with
recovery/purity against the equilibrium psa01 (the twin-bed steady case is the
ideal LIMIT — the difference is the lesson).

**A6-TSA** — the T ramp is the recipe's `setParameter` (already exists); van't
Hoff gives q*(T) with no new code in the isotherm.  ANCHOR: a TSA batch, CO2/13X
298 -> 398 K, working capacity Dq against the algebra of the steady tsaTwinBed
(118.5).

*Mandatory sequence: tsaTwinBed steady (118.5) -> A4-energy -> A4-Ergun -> A5 ->
A6.  Each one whole or not at all (#116).*
