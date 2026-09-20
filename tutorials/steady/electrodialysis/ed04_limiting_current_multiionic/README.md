# ed04 — the limiting current, PREDICTED, against a measurement

An **external-reference case**: every number in it comes from one primary
source, end to end, and the case says which.

> V. Geraldes, M.D. Afonso, *"Limiting current density in the electrodialysis
> of multi-ionic solutions"*, **J. Membr. Sci. 360 (2010) 499–508**,
> doi:10.1016/j.memsci.2010.05.054.

## What changed, and why it matters

The limiting current density used to be computed from a **declared**
counter-ion transport number — a parameter the student supplied, on a
membrane record, measured in a different solution at a different temperature.
It is now **predicted**.  The Nernst–Planck equations in the diluate film,
linearised on nearly-linear profiles and closed by electroneutrality, give the
limiting transport numbers explicitly from the ion diffusivities and the bulk
composition (Eqs. 12/13) and the limiting current in closed form (Eq. 15).

**This removes a parameter.**  Nothing in the prediction is fitted to this
system; the only equipment datum is the stack's own Sherwood correlation,
which lives on the stack record where it belongs.

## The six units are the six MgCl₂ + MgSO₄ rows of Table 4

| unit | flow | Re (paper) | Re (derived here) | C₁,average (equiv./m³) | i_lim measured | i_lim engine | deviation |
|---|---|---|---|---|---|---|---|
| ED1 | 145 L/h | 50 | 50.42 | 9.38 | 34.3 | 37.60 | +9.6 % |
| ED2 | 175 L/h | 61 | 60.85 | 9.43 | 37.6 | 41.53 | +10.4 % |
| ED3 | 230 L/h | 86 | **79.98** | 9.54 | 42.9 | 48.16 | +12.3 % |
| ED4 | 145 L/h | 50 | 50.42 | 18.7 | 71.2 | 74.96 | +5.3 % |
| ED5 | 175 L/h | 61 | 60.85 | 18.8 | 81.9 | 82.79 | +1.1 % |
| ED6 | 230 L/h | 86 | **79.98** | 19.0 | 93.5 | 95.92 | +2.6 % |

Average |deviation| **6.9 %**, against the **9 %** the paper reports for this
system (section 4.3).  The `i_lim_cem` golden rows are **anchors** against the
measured column with a band of 13 % — the larger of the two average relative
deviations the paper itself reports, *its* number and not one chosen here.
`i_lim` is pinned separately and tightly as an ordinary regression row.

## Two findings, recorded and not tuned

**1. The paper's own Reynolds number at its highest flow does not follow from
its own flow rate.**  Section 3.3 lists 145, 175 and 230 L/h against
superficial velocities 0.066, 0.080 and 0.11 m/s and Reynolds numbers 50, 61
and 86.  The first two close exactly on the stated geometry with all seven
diluate channels in parallel (0.0655 and 0.0791 m/s); the third does not —
the same division gives 0.1040 m/s, and 86/61 = 1.41 is not 230/175 = 1.31
either.  The engine derives the velocity **from the flow**, so ED3 and ED6 run
at Re 79.98 rather than 86, which lowers their predicted i_lim by 3.7 %
relative to a run at the paper's printed Re.  Nothing was adjusted to close
the gap: the case declares the flow, which is the measurable.

**2. The predictions are biased HIGH on this system, by about 7 % on
average.**  They were biased LOW by about 13 % on the single-salt MgCl₂
solutions of the same table (which is the paper's own reported figure for
that system).  A prediction with a mass-transfer correlation of 7 % average
error behind it is not expected to do better.

## The provenance of every number

* **Stack** — `stack EUR2C-7P18;`, the paper's own bench unit as a `kind
  edStack` record (section 3.1: seven cells, 0.020 m² per membrane, channels
  0.175 × 0.114 m, 7.7 × 10⁻⁴ m net-like spacer; section 3.4: Sh = 0.29
  Re⁰·⁵ Sc⁰·³³).  Its four non-source values are marked estimates and the run
  announces each one.
* **Solution** — equimolar-in-equivalents MgCl₂ + MgSO₄ at the paper's "5 + 5"
  and "10 + 10 equiv./m³" (Tables 2 and 4), declared at the **average** cation
  concentration of each row, because that is the basis the paper's own
  prediction uses (the footnote to Table 4).
* **Temperature** — 293.15 K (section 3.3).  The curated ion diffusivities are
  referenced at 25 °C; the engine corrects them to 20 °C through
  Stokes–Einstein on the declared liquid-viscosity model, which is how the
  paper's own Table 3 was built.  With no viscosity model declared there is no
  correction and the run says so.
* **Current** — 0.2 A (10 A/m²) everywhere, far below every limiting current
  here.  This case *measures* i_lim; it does not approach it.
* **Concentrate** — the same solution as the diluate, which is the paper's own
  arrangement (section 3.3: both streams recycled to one 6 L tank), so the
  Nernst back-EMF is zero by construction.

## What a student should read off the log

```
  D_eff    = 9.13997e-10 m2/s   (Eq. A13, from the ion equivalent fractions -- no salt decomposition)
  k_c,eff  = 2.46146e-05 m/s   (Sh = 20.7367 = 0.2900 Re^0.5000 Sc^0.3300, the stack record's OWN fit)
  delta    = D_eff/k_c,eff = 3.7132e-05 m   (Eq. 1, the film)
  limiting transport numbers (Eqs. 12/13; co-ions NULL by the model's own assumption):
        Mg   CEM t_lim 1.00000   AEM t_lim 0.00000
        Cl   CEM t_lim 0.00000   AEM t_lim 0.65696
       SO4   CEM t_lim 0.00000   AEM t_lim 0.34304
  i_lim (Eq. 15) CEM 37.60 A/m2,  AEM -54.85 A/m2  -> the LOWEST absolute value applies
```

Mg²⁺ is the **only** cation, so it carries the whole current through the
cation-exchange membrane and its limiting transport number is exactly 1.  It
also has the lowest |z|D of any ion here, which is why the cation-exchange
membrane — not the anion-exchange one — sets the limiting current, exactly as
the paper argues before its Eq. 24.  Change the anion ratio and the AEM's two
transport numbers move while the CEM's stays at 1.
