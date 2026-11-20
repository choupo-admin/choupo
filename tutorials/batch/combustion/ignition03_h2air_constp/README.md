# ignition03_h2air_constp — the same ignition at CONSTANT PRESSURE

`ignition01_h2o2` closes the charge in a rigid vessel.  This case lets the
same charge (1100 K, 5 bar, H₂ : O₂ : N₂ = 2 : 1 : 4, trace-H seed, the same
Ó Conaire mechanism and thermo) expand against a fixed pressure — the
adiabatic constant-pressure cell that OpenFOAM's chemistry solver integrates.

```
runCase tutorials/batch/combustion/ignition03_h2air_constp
```

## The balance (`energy gasConstantP;`)

Closed, adiabatic, ideal gas, P fixed: the first law is dH = 0, so

    dT/dt = − Σᵢ hᵢ(T) ṅᵢ / Σᵢ nᵢ Cpᵢ(T),        V = (Σ nᵢ) R T / P

with hᵢ the ideal-gas molar enthalpy on the formation datum (the datum
`gasConstantV` takes uᵢ = hᵢ − RT from) and Cpᵢ the ideal-gas heat capacity.
**V is not an input**: it is derived from (n, T, P) at every state, so the
holdup declares no `V` (declaring one that disagrees with n R T / P is refused
by name), and every reader of the vessel — the time directories'
`internalStates/bomb`, the rate-of-production report — sees the V of its own
state.  The rates use cᵢ = nᵢ / V with that V.  Theory Guide,
`sec:batch-gas-constp`.

## What it shows against `ignition01_h2o2` (measured, 0.1 µs grid, 20 µs)

| | constant V | constant P |
|---|---|---|
| τ_ign (max dT/dt) | 7.1 µs | 7.6 µs |
| peak dT/dt | 2.26e9 K/s | 9.6e8 K/s |
| T at 20 µs | 3076 K | 2805 K (2828 K at 200 µs) |

At constant V the heat release goes into a gas that cannot expand and the
pressure climbs; at constant P the same heat also does the expansion work
P dV and is spread over the larger Cp = Cv + R, so the temperature rises less
and the burned gas is cooler.  The cooler path lowers the rate constants, so
the runaway is later and slower.

## Hand check

At 200 µs the run ends at n = 4.39248e-5 kmol, T = 2828.182 K, P = 5 bar:
V = n R T / P = 4.39248e-5 × 1000 × 8.314463 × 2828.182 / 5e5 = 2.06577e-3 m³,
which is the `V` written in `0.0002/internalStates/bomb` (2.065769e-3).  The
vessel has grown from 1.0 L to 2.07 L at fixed pressure.

## Witness

The same balance on the real LLNL H₂ mechanism (O'Connaire 2004, local copy),
stoichiometric H₂/air, 1100 K, 1 atm, against Cantera's
`IdealGasConstPressureReactor`, agrees on τ, T_final (to the mK), V_final and the
final mole fractions — `docs/reviews/2026-11-19-chemkin-real-mechanism/REPORT.md`
section 8.

## Limits

- `jacobian analytic` is refused for this basis by name (open debt: cₖ = nₖ/V
  moves with every nⱼ and with T); the finite-difference Jacobian is used.
- The campaign energy ledger names a gap for any adiabatic vessel (this one
  included): dH = 0 holds by construction, but it is not ledgered yet.
- The KPI golden pins the burned state; the delay is printed, not pinned.
