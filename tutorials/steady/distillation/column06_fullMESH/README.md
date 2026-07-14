# Full-MESH distillation (Naphtali–Sandholm) — the rigorous energy balance

The same benzene/toluene column as `column02_simultaneous`, but solved by the
**full MESH** (`model fullMESH`) instead of the bubble-point/CMO reduction.

## What the full-MESH adds over the CMO `simultaneous` method

The `simultaneous` method is a **bubble-point-reduced** MESH: it assumes
**constant molal overflow** (CMO — equimolal latent heats), so the internal
vapour/liquid flows `V_j`, `L_j` are fixed by a mass march and only the
compositions `x_j` and stage temperatures `T_j` are solved.

The **full MESH** (Naphtali–Sandholm) promotes `V_j` and `L_j` to **unknowns**
and adds, per stage, the **total-mass balance** and the **energy balance** — so
the flows follow the *real* latent heats instead of assuming them equal. The
extra per-stage energy equation is the **enthalpy residual** the CMO never
carried:
```
  L_{j-1} h_L(x_{j-1},T_{j-1}) + V_{j+1} h_V(y_{j+1},T_{j+1}) + F_j h_F
      − L_j h_L(x_j,T_j) − V_j h_V(y_j,T_j)  =  0      (interior stage)
```
Total condenser: `V_0 = 0`, `L_0 = R·D`; reboiler: `L_{N−1} = B`; their energy
balances give `Q_cond` / `Q_reb` as results.

## The CMO bootstraps the full-MESH (the robustness trick)

The full-MESH is **seeded from the converged CMO profile** — the cheap model
launches the rigorous one. Here it converges in **~4 Newton iterations** from
that seed (it would be far harder from a cold start).

## Result — and why it is close to (but not equal to) the CMO

| | CMO (`simultaneous`) | full-MESH |
|---|---|---|
| x_D (benzene) | 0.981 | **0.979** |
| T_top / T_bottom (K) | 354.2 / 382.9 | **354.3 / 382.8** |

Benzene (Δh_vap ≈ 30.8 kJ/mol) and toluene (≈ 33.2 kJ/mol) have **similar**
latent heats, so CMO is a good approximation and the two answers nearly
coincide — the ~0.002 / ~0.1 K gap **IS** the energy-balance correction the
full-MESH makes and the CMO drops. On a **wide-boiling** column (a depropaniser)
the gap is much larger; that is where the full-MESH earns its cost.

## Scope (honest)

This is the energy-consistent MESH for **non-reactive** columns. Reactive
distillation still runs on the CMO bubble-point (`column05`); the reactive
full-MESH is the next rung. Rigorous numerical validation against a published
wide-boiling profile (Wang & Henke 1966 depropaniser) is pending the reference.
