# `aceticAcid01_gibbsReactor` — acetic acid from CO + methanol, one Gibbs reactor

A basic tutorial: ONE `gibbsReactor`, six species, a 10 K approach to
equilibrium.  It answers a single question — *what does thermodynamics alone
allow when CO and methanol meet at 460 K and 30 bar?* — and says nothing about
how fast, or with what catalyst, it gets there.

```bash
source etc/bashrc
runCase tutorials/plant/aceticAcid01_gibbsReactor
```

## 1. The chemistry, and what the reactor is (not) told

```
CO + CH3OH            ->  CH3COOH                 carbonylation (the product)
2 CH3OH              <->  CH3OCH3 + H2O           dimethyl ether
CH3OH + CH3COOH      <->  CH3COOCH3 + H2O         methyl acetate
```

The flowsheet never states these reactions.  `system/flowsheetDict` lists the
six species with their atoms (C, H, O) and the reactor minimises the Gibbs
energy under the atom balances, so every pathway the six species allow is open
at once.  Species left out are pathways closed by decision: no CO2, H2, CH4,
formaldehyde or iodides.

| | |
|---|---|
| feed | 100 kmol/h methanol + 110 kmol/h CO (10 % excess CO), one vapour stream at 460 K, 30 bar |
| reactor | 460 K (187 C), 30 bar, `temperatureApproach 10` |
| outlets | `gas` (CO-rich) and `liquid` (acetic acid) |

The feed is declared `phase gas;` at the reactor temperature on purpose: a
stream at 300 K with CO and methanol together has no honest single phase, and
the energy report refuses to price it (found while writing this case).

## 2. The result

| | |
|---|---|
| methanol converted | ~100 % (y_MeOH = 4e-8 in the gas) |
| acetic acid | 97.5 kmol/h liquid + 2.5 kmol/h in the gas ~ 99.98 kmol/h per 100 fed |
| gas outlet | 12.5 kmol/h: CO 80.1 %, acetic acid 19.8 %, methyl acetate and water 0.075 % each |
| dimethyl ether | ~2e-8 mole fraction — nil |
| reactor duty | **-3927 kW** (the reactor must be COOLED: reaction heat plus condensing the acid) |

**The lesson is that the by-products vanish.**  Carbonylation is so
favourable (K ~ 2e5 bar^-1 at 470 K, from the formation data) that methanol is
used up; methyl acetate and water exist only as the trace left in equilibrium
with it, and DME is smaller still.  In the real plant they are *intermediates*
whose level is set by kinetics and by the catalyst system, not by this
equilibrium.  A Gibbs reactor gives the ceiling, not the selectivity.

Hand check (order of magnitude, ideal gas, 470 K): dG(carbonylation) ~ -48
kJ/mol gives y_MeOH ~ 1e-8 to 1e-7 with p_CO ~ 24 bar and p_AcOH ~ 6 bar; the
engine's 4e-8 agrees.  Methyl acetate then follows from K ~ 60 for the
esterification, giving ~7e-4, which also agrees.

## 3. What the 10 K approach does here — and does not

`temperatureApproach 10` is a MAGNITUDE.  The engine reads the thermicity of
this feed's transformation (exothermic, dH = -66 437 kJ per kmol of feed),
assigns the sign, and evaluates the reaction equilibrium at **T + 10 K =
470 K**, announcing it.  Compared with `temperatureApproach 0`:

| | approach 0 | approach 10 |
|---|---|---|
| y acetic acid (gas) | 0.19785 | 0.19785 |
| y methyl acetate | 5.7e-4 | 7.5e-4 |
| y methanol | 2.0e-8 | 4.0e-8 |

The main product does not move.  The approach shifts only the traces, by
30-100 %.  The engine's own documentation says why: a parameter built for
reversible reactions has little to act on when K is this large.  Try the
experiment — it is one line.  Do not read the 10 K as a calibrated number for
this chemistry: it is empirical, global, and no plant datum behind it exists
in this case.

## 4. What this case does NOT claim

* **No catalyst and no rate.**  The industrial route (Monsanto/Cativa) runs in
  the liquid phase at 150-200 C and 30-60 bar over Rh or Ir with an iodide
  promoter.  The reactor here knows none of it.
* **Ideal gas and ideal liquid.**  `constant/thermoPhysPropDict` declares
  Raoult + ideal gas.  Acetic acid dimerises strongly in the vapour and the
  acid/water/methanol liquid is far from ideal; both are ignored.  The split
  between `gas` and `liquid` is therefore indicative.
* **Vapour pressures are extrapolated.**  460 K lies outside the Antoine range
  of methanol, acetic acid, methyl acetate and water (11 announcements per
  run), and CO and DME are above their critical temperatures, where no
  saturation curve exists.  CO behaves as a non-condensable.
* **Dimethyl ether data are unverified.**  The standard record is marked
  `reviewStatus interim` and its formation enthalpy is a Joback estimate
  (-216.8 kJ/mol, band ~9 kJ/mol); the literature value is nearer -184 kJ/mol
  (quoted from memory, NOT checked against a source here).  It does not change
  this case's answer — DME is nil at either value — but it would in any case
  where methanol survives.  The record was not touched.
* **Cross-check.**  `model reactiveFlash;` in the reactor gives the same
  result as the default `elementPotential` to 12 digits (checked once, in a
  scratch copy).

## 5. Things to try

1. `temperatureApproach 0` and `30` (the patent range quoted in
   `ammoniaReactor03_equilibriumApproach` is 0-30 K).
2. Reactor at 400 K or 500 K (feed unchanged): the acid stays the product but
   the liquid/gas split moves (liquid 99.5 kmol/h at 400 K, 91.9 at 500 K).
3. Feed 50 % excess CO: the gas outlet grows, the acid does not.
4. Replace the reactor by `conversionReactor` with the declared conversion and
   diff the two flowsheets (the ammonia ladder does exactly this).
