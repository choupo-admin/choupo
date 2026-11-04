# IF97 region 3: a Helmholtz equation behind a (p, T) door

Status: BUILT 2026-11-04 (DEV.md 4c C214 W6; the study
[`the-kernel-against-the-reference-simulator.md`](the-kernel-against-the-reference-simulator.md) §5).

## 1. What was there

`src/thermo/iapws/IF97.{H,cpp}` implemented regions 1 (compressed liquid,
Gibbs g(p,T)), 2 (superheated vapour, Gibbs) and 4 (the saturation line), and
the B23 boundary.  Its router `pT_region()` REFUSED by name every state with
623.15 K < T <= 863.15 K and p > p_B23(T) (region 3) and every state above
1073.15 K (region 5).  `verify()` held regions 1, 2, 4 and B23 to the release's
verification tables at 1e-8 relative.

Who reaches the kernel, and what each did with the refusal:

| Caller | Call | On a region-3 state, before |
|---|---|---|
| `propertyOps/SteamTables` (`steamTables` props op) | `IF97::props(p,T)` (point, isobar); `region1/2` on the line (saturation scan, capped at 623.15 K) | the op threw; the run refused |
| `thermo/pureFluid/IF97WaterFluid` (`pureFluids { water { method IF97; } }`) | `IF97::props(p,T)` for h, s, v, cp, and rho for mu/lambda; `psat`/`Tsat` | the exception propagated out of the package: any water stream above 623.15 K and p_B23 refused |
| `ThermoPackage` (sensible datum, H_stream_formation) | the pure-fluid route at p = psat(T) (liquid) and psat(T)(1 - 1e-9) (vapour) | refused above 623.15 K |
| `bin/curate/check_heavy_water.py` | reads `n4` (region 4) from the source | untouched |

No caller caught the refusal; each passed it on.  So the change is strictly
additive: a state that refused now answers, and a state that answered before
(regions 1, 2, 4) goes through unchanged code.

## 2. The source

W. Wagner et al., "The IAPWS Industrial Formulation 1997 for the
Thermodynamic Properties of Water and Steam", J. Eng. Gas Turbines Power 122
(2000) 150-182 -- read from the curator's local copy, never copied into the
tree.  Its appendix tables are SCANS (the PDF carries no text for them), so
Table A9 (the 40 region-3 coefficients n_i, I_i, J_i), Table A10 (region-3
verification values), Tables 9 and 10 (the property relations and the phi
derivatives) and Table 13 (boundary inconsistencies) were read from the page
images.  The digits were then held by the paper's own Table A10: every one of
its 18 printed values is reproduced to half a unit in its ninth significant
digit, which a single wrong coefficient digit cannot survive.  The same
paper's Tables A3, A6, A12, A29 and the B23 point (Table A1, footnote) repeat
the release's values already in `verify()`, digit for digit.

## 3. The decisions

**(a) The backward density.**  Region 3 is f(rho, T); the engine asks (p, T).
`rho3(p, T, root)` solves p(rho, T) = p, p from Table 9 (p/(rho R T) =
delta phi_delta), by a Newton step guarded by a sign-kept bracket (bisection
whenever the step leaves it).  The bracket is ONE monotone branch of the
isotherm:

* Below Tc, Eq. 25 carries a van der Waals loop.  Measured over 623.15 K <= T
  < Tc (400 isotherms): (dp/drho)_T < 0 at rho_c on every one (-4.8 Pa m3/kg
  at 623.15 K), and (dp/drho)_T changes sign exactly twice over [10, 800]
  kg/m3 (4000 densities per isotherm), so exactly one spinodal lies on each
  side of rho_c; each is found by bisection on (dp/drho)_T.  At T = Tc itself
  the derivative at rho_c is -5.4e-10 Pa m3/kg -- a rounding-level residue of
  the paper's constraint (dp/drho)_T = 0 at the critical point -- and it is
  positive everywhere by Tc + 1e-9 K, so the code takes the loop branch for
  T < Tc only and treats T >= Tc as monotone.  The LIQUID
  branch runs from the liquid spinodal to 800 kg/m3, the VAPOUR branch from
  10 kg/m3 to the vapour spinodal.  `Root::Auto` chooses by the saturation
  pressure of region 4: p >= psat(T) is liquid, p < psat(T) vapour.  On the
  line itself the liquid side is taken -- the convention region 1 already
  had.  A two-phase state is region 4, not region 3: the kernel returns a
  single-phase branch, and the dome stays the caller's (the saturation scan
  asks for both branches at psat explicitly).
* At and above Tc the isotherm is monotone over [10, 800] kg/m3 (measured:
  (dp/drho)_T > 0 up to >= 824 kg/m3 at every T to 863.15 K) and has one root.
* The bracket ends are MEASURED, not assumed: p(10 kg/m3) < 4.2 MPa, below every
  region-3 pressure (p_B23 >= 16.53 MPa); p(800 kg/m3) > 140.5 MPa, above the
  100 MPa ceiling; the polynomial turns over only above ~820 kg/m3, outside
  region 3, never searched.
* A target outside the branch's pressure span REFUSES by name, naming the
  branch, the span and the density interval -- never a nearest root.

**(b) The boundaries.**  Wagner et al. (2000), Section 5.5.3: Eq. 25 covers
623.15 K <= T <= T_B23(p), p_B23(T) <= p <= 100 MPa.  The router:

* T <= 623.15 K: regions 1/2 as before (the 1/3 boundary is the 623.15 K
  isotherm, region 1's side);
* 623.15 K < T <= 863.15 K and p > p_B23(T): region 3 (p == p_B23 stays
  region 2, the router's existing convention);
* the 3/4 boundary is the saturation line inside region 3, handled by the
  branch choice above;
* T > 1073.15 K with p <= 50 MPa: region 5, REFUSED by name -- it is not
  implemented.  Nothing outside region 3's published box is evaluated with
  Eq. 25.

**(c) The properties** are Table 9's relations on Table 10's derivatives,
written in `region3()` as the paper writes them (each line cites its
relation): p, u, s, h, cv, cp, w; v = 1/rho.

**(d) The dispatch.**  `pT_region` returns 3; `props(p,T)` calls
`region3(rho3(p,T), T)`.  `Props` gained `p` (the input on regions 1/2, Eq.
25's pressure on region 3).  The `steamTables` op gained `point { rho ...;
T ...; }` -- region 3 only, the variable its equation is written in, REFUSED
unless the pressure it gives routes back to region 3 on the same branch -- so
the paper's (T, rho) table can be evaluated as printed; a region-3 point
publishes `p_MPa` and `rho`.  The saturation scan now runs to Tc (regions 1/2
on the line up to 623.15 K -- byte-identical -- and region 3's two branches
at psat above it, the paper's Section 5.5.4 prescription for v' and v'').

## 4. The boundary consistency, measured

At 50 points on each boundary, against the paper's Table 13 maxima and the
permitted ("Prague") values of its Section 4.3:

| Boundary | dv % | dh kJ/kg | dcp % | ds J/(kg K) | dg kJ/kg | dw % |
|---|---|---|---|---|---|---|
| 1/3 here | 0.0035 | 0.0307 | 0.1948 | 0.0422 | 0.0049 | 0.282 |
| 1/3 paper | 0.004 | 0.031 | 0.195 | 0.042 | 0.005 | 0.299 |
| 2/3 here | 0.0180 | 0.1333 | 0.3506 | 0.1766 | 0.0047 | 0.403 |
| 2/3 paper | 0.018 | 0.134 | 0.353 | 0.177 | 0.005 | 0.403 |
| permitted | 0.05 | 0.2 | 1 | 0.2 | 0.2 | 1 |

The kernel reproduces not just the band but the inconsistency the authors
measured.  `check_if97_regions` holds both.

## 5. What this does not do

* Region 5 (above 1073.15 K) -- refused, as before.
* The region-3 backward equations v(p,T) of the 2003 IAPWS supplementary
  release -- not used; the density is iterated on Eq. 25 itself, so there is
  no second equation to be consistent with.
* Metastable states -- the branch choice never returns one.
* IF97 against IAPWS-95: the formulation's own deviation near the critical
  point is large (cp to -53 % near 648 K and 22.3 MPa, the paper's Fig. 16b);
  this slice reproduces IF97, it does not improve on it.

Gate: `bin/curate/check_if97_regions.py`.  Witness:
`tutorials/props/steam/steam03_if97_region3`.
