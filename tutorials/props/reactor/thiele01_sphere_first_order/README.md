# thiele01_sphere_first_order — the single catalyst pellet

Solves the intraparticle boundary-value problem for one porous catalyst pellet,
publishes the concentration field, the effectiveness factor and the Thiele
modulus, and **checks every one of them against the closed form**.

```
runCase tutorials/props/reactor/thiele01_sphere_first_order
```

---

## What it computes

With `xi` the normalised coordinate from the pellet centre (0) to its external
surface (1) and `u = c/c_s`:

```
u'' + (s/xi) u' = phi_char^2 u ,     u'(0) = 0 ,   u(1) = 1
```

`s` is the shape factor — 0 slab, 1 cylinder, 2 sphere — and

```
phi_char = R sqrt(k / D_eff)          (on the characteristic dimension)
phi      = Lambda sqrt(k / D_eff)     (generalised; Lambda = V_p/S_p = R/3)
```

Both moduli are published because both conventions are in circulation and they
differ by a factor of three for a sphere. The engine's own announcement in
`src/unitOperations/reactor/CatalystPellet.H` uses the **generalised** one.

The equation is discretised with second-order central differences and handed to
the existing `solver::newtonND` (finite-difference Jacobian, LU with partial
pivoting) — no new dependency, no new solver, every step readable in
`src/unitOperations/reactor/pellet/PelletDiffusion.cpp`.

## Outputs

| file | columns |
|---|---|
| `pelletConcentrationField.csv` | `geometry, phi, phi_char, xi, c_over_cs, c_over_cs_closedForm, absDeviation` |
| `pelletEtaPhi.csv` | `geometry, phi, phi_char, eta, eta_closedForm, relDeviation, eta_flux` |
| `pelletGridRefinement.csv` | `geometry, phi, nodes, h, eta, eta_closedForm, relDeviation` |

`xi` is one column, not two aliases: it is `r/R` for a sphere or a cylinder and
`x/L` for a slab.

## The oracle, and the numbers achieved

First-order isothermal is the rare case that has a closed form in all three
geometries, so the numerical answer is not merely produced — it is checked:

| claim | tolerance | achieved |
|---|---|---|
| field, node by node, against `sinh(phi xi)/(xi sinh phi)` (401 nodes, `phi_char` = 3.0483) | 1e-4 | **1.448e-06** (max absolute) |
| `eta`, volume integral vs closed form | 1e-4 | **1.345e-06** relative |
| `eta`, surface flux vs the volume integral | reported | **1.786e-05** relative |
| the whole `eta(phi)` family, 3 geometries × 21 points, 201 nodes | 5e-3 | **9.069e-04** worst |
| observed order of convergence (201 → 401 nodes) | 2 | **2.0002** |

`eta = 0.665742411271` against the closed form `0.665741515869`;
`c(centre)/c_s = 0.289874` against `0.289873`; Weisz–Prater `eta·phi² = 0.68735`.

The Newton takes **one iteration** to `||F|| = 3.4e-15`. That is not luck and it
is worth seeing: for a first-order reaction the discretised residual is exactly
*linear* in `u`, so a Newton with an accurate Jacobian lands on the answer in a
single step. If that ever becomes two, the residual has stopped being linear —
which is why `newton_iterations` is a pinned golden row.

Per geometry, the worst sweep deviation is at the top of the range (`phi` = 10)
and scales the way the truncation-error analysis says it must, `(phi_char·h)²/24`:

| geometry | `phi_char` at `phi` = 10 | predicted | measured |
|---|---|---|---|
| slab | 10 | 1.04e-04 | 1.042e-04 |
| cylinder | 20 | 4.17e-04 | 4.071e-04 |
| sphere | 30 | 9.38e-04 | 9.069e-04 |

Three geometries, one law, no fitting — the error is *understood*, not merely
tolerated.

`eta` is computed **twice by two independent functionals of the same field** —
the volume integral of `u`, and the concentration gradient at the surface. They
are different mathematics over the same numbers, so their agreement says
something the closed-form comparison alone does not.

`bin/curate/check_thiele_pellet.py` recomputes the closed forms **in Python**
and compares against these files; it never reads the engine's own analytical
column back as though it were an independent statement.

## Provenance of every number in this case

| quantity | value | where it comes from |
|---|---|---|
| pellet geometry | sphere, R = 1.5 mm | **teaching surrogate**, `constant/assets/aluminaSphere3mm.dat` |
| `rho_particle` | 1300 kg/m³ | **teaching surrogate** |
| `rho_bulk` | 780 kg/m³ | **teaching surrogate** |
| `epsilon_p` | 0.45 | **teaching surrogate** — uncited |
| `tau` | 3.0 | **teaching surrogate** — uncited |
| `k` | 40 1/s (volumetric) | **teaching value**, chosen so `phi` lands near 1 |
| `T`, `P` | 573.15 K, 1 atm | chosen operating point |
| MW, `diffusionVolume` of CO and N₂ | catalogue | `data/standards/components/{CO,N2}.dat`, cited there |
| `D_molecular` | derived | Fuller's correlation, from the two `diffusionVolume` entries and the molar masses |
| `D_eff` | derived | `(epsilon_p/tau)·D_molecular`, announced with the rule that produced it — **stored nowhere** |

## What is NOT validated here

**Nothing physical.** No number in this case is compared with a measurement, and
the pellet says so about itself in a field the engine parses and announces
(`provenance.identity.origin teachingSurrogate;`).

* `epsilon_p` and `tau` are **uncited**. Tortuosity is conventionally reported
  anywhere between 2 and 7, and that spread alone moves `eta` by a factor of
  three. Do not quote this pellet.
* `k = 40 1/s` is not a measured rate constant for any reaction on any alumina.
* The **agreement between the numerical solution and the closed form** is what
  is verified, and that claim is independent of every value above: change the
  porosity and the modulus moves, and the numerical field still has to match the
  analytical field at the new modulus.

## What is not modelled

* **The non-isothermal pellet.** Coupled to Arrhenius it develops up to three
  interior steady states for one `phi`, and `eta` can exceed 1. A Newton returns
  whichever root the initial guess was nearest — a plausible number arrived at
  silently — so it needs continuation and must be reported as a *set*. Named,
  not approximated.
* **Orders other than first.** No closed form, hence no oracle.
* **Knudsen diffusion.** `D_eff` is derived from the *bulk* molecular
  diffusivity; in pores comparable with the mean free path that overstates the
  transport, and the run announces it.
* **The external film.** `c_s` is taken as the bulk concentration.
* **A pellet size distribution.** One pellet, one dimension.

## What no reactor does with this yet

`cstr`, `pfr`, `batchReactor` and `dynamicCSTR` still evaluate their rates at
bulk conditions, i.e. they still take `eta = 1`, and they still announce that
(`check_pellet_announcement`). This case computes `eta`; **nothing multiplies a
rate by it.** Wiring it in is a separate slice with its own goldens.

## Theory

`docs/theoryGuide.tex`, section `\label{ch:thiele}` — the pellet balance, the
modulus as a ratio of rates, the three closed forms, the volume-to-surface
length that nearly erases the shape, the two asymptotes (and why the apparent
activation energy halves), and the Weisz–Prater observable criterion.
