# Adsorption units: an independent double check (tree 5f51313a21, read only, no build)

Paths are relative to the tree root. `FB` = `src/unitOperations/batch/FixedBedAdsorber.cpp`.

## WRONG

1. **The loadings are read without dimensions, so a unit suffix moves them 1000x without any warning.** The canonical amount is kmol, so `"mol/kg"` parses to 1e-3 (`src/core/Units.cpp:179`). These reads pass no `Dims`:
   - `initialLoading` in the fixed bed (FB:517) and in the batch adsorber (`BatchAdsorber.cpp:287`);
   - `q_max` (`IsothermModel.cpp:163`) and `H_298` (`:126`).

   The values are then used as mol/kg. Writing `CO2 1.5 mol/kg;` (which is how the case comments suggest writing it, `batch09/0/internalStates/adsorber:25`) would silently give 0.0015. It is latent: every record and case today writes bare numbers.
   - Fix: read them with `Dims::molality`, multiply by 1000, and refuse a bare value or document the bare value as mol/kg.
   - `b_298` and `tRef` share the pattern. `1/bar` is not a registered unit, so a `b_298` with a suffix fails to parse rather than going wrong silently.
2. **The ion exchanger header documents a grammar the engine refuses.** `IonExchanger.H:50` shows `CEC 2.0 eq/L;` in `operation`. `IonExchanger.cpp:114-120` refuses `CEC` there and requires `resinDose`. The console also prints the capacity as eq/kg of water (`:325`), not eq/L. A student who copies the header gets a refusal.

## SUSPECT

3. **The `Dax` key is on the superficial (bed-volume) basis, `Dax = eps*D_L`, and nothing near the key says so.** The governing equation (`FixedBedAdsorber.H:34-37`, FB:1703/1924/1935) puts it on the bed basis, and the code then derives D_L = Dax/eps (FB:908). `Pe = uL/Dax = vL/D_L` (FB:3214) is consistent.
   - Literature D_L (Edwards-Richardson, and the usual reading of Wakao-Funazkri) is interstitial.
   - If that D_L is pasted under `Dax`, the dispersion is overstated by 1/eps (2.5x at eps 0.4).
   - `docs/ai/unit-ops.md:3304` only says "D_L = Dax/eps".
4. **In thermal mode the Ergun viscosity is taken at the declared T, not the cell's T.**
   - `thermo_->viscosityGas(T_, yMix)` (FB:1455), and the memo key also uses `T_` (FB:1447).
   - During the 400 K hot purge (batch21/23/24) the He viscosity is about 20 % low, and so is the viscous Ergun term. The pressure drop is small in these witnesses (63 Pa), but the rule is wrong.
   - Fix: use the face mean T.
5. **The announced thermal-wave velocity leaves out the heat capacity of the adsorbed phase.**
   - `u_th = u c cp / (eps c cp + rho_b cp_s)` (FB:882). The thermal rows (FB:1312-1331) and the `DT_ad` announcement (FB:891-893) both carry `rho_b q Cp_ig` since C258.
   - The heat wave travels through the LOADED bed. In batch20 that term is ~68 kJ/(m3 K) against 589 kJ/(m3 K), so the announced u_th is ~11 % high.
   - The gas term also uses cp where cv belongs; this is negligible.
6. **`t_stoichiometric` (FB:873) assumes a clean bed.** It is `(L/u)(eps + rho_b q*/c_in)`. A case that declares an initial loading or an initial adsorbate in the gas gets a wrong "expect the front here" claim. It should be `(L/u)[eps (c_in - c_0) + rho_b (q* - q_0)]/c_in`. No witness reaches this today.
7. **Three upwind or Ergun goldens do not pin the C375 numerical-dispersion KPIs.** `batch14` (upwind), `batch15` (upwind, ratio 5.0, nCells 1251) and `batch16` publish `D_numerical`, `numerical_dispersion_ratio` and `nCells_numerical_ratio_0p1`, and none is pinned. This breaks the "published means pinned" rule.
8. **The kLDF provenance strings do not reproduce their own numbers.**
   - batch13/18/19 say "2 mm beads; Glueckauf k = 15 De/rp^2 gives the order". With rp = 1 mm and De = 5.9e-10 m2/s that gives 8.9e-3 1/s, not the 0.05 declared (5.6x).
   - batch09 ("1.6 mm") implies rp = 0.42 mm.
   - Also, `15 De/rp^2` is the q-basis LDF only when De is a solid-phase (micropore) diffusivity. For a macropore De it must be divided by the dimensionless isotherm slope.
9. **The shortcut swing units evaluate regeneration at the feed composition.**
   - PSA takes `q_low` at y_F at P_low (`PSA.cpp:191`). The tail gas at the end of blowdown is richer in the heavy species, so Dq is optimistic. This is documented as the shortcut.
   - TSA takes `q_regen` at the feed partial pressures (`TSATwinBed.cpp` loading at Tregen). This is conservative against a clean purge.
   - In both, the regeneration-gas stream leaves at T_ads.
10. **Physics that is absent and should be stated as such:**
    - Intraparticle (macropore) gas is never held up: `eps` is interparticle only (FB:212), so the total voidage is under-counted.
    - There is no axial thermal conduction (λ_ax). The A5 design says "defaults to 0 (declared)", but no key exists to declare otherwise (`docs/design/fixed-bed-thermal-a5.md` §2, FB:1830-1846).
    - k_LDF does not depend on T.

## OK, verified

- **Gas balance.** `eps dc/dt = [F_{j-1/2} - F_{j+1/2}]/dz - rho_b dq/dt` (FB:1909-1910, 1928-1929). It uses superficial u and the catalogued bulk density; q is in mol/kg and `rho_b dq/dt` is in mol/(m3 bed s), with no (1-eps) factor. The scheme is telescopic.
- **Boundaries.** The Danckwerts inlet is the imposed total flux u c_in (FB:1680, 1923, 1935). The outlet face is advective only (zero gradient). Outlet backflow comes from a reservoir at c_in·P_out/P (FB:1724).
- **Ergun** (FB:1412-1470). It uses superficial u, `Φs·dp`, ρ = Σ c MW/1000 in kg/m3, and the cancellation-free root 2g/(a+√(a²+4bg)). Recomputed for batch16 (μ 1.99e-5, dp 2 mm, eps 0.4, He): 213.19 Pa/m, so 106.60 Pa over L. The golden is 106.654, the extra coming from the gas expanding (u ∝ 1/P). Half-cell spacing at the first cell gives 0.533 Pa, matching 1e5 - 99999.467.
- **LDF and isotherms.**
  - `dq/dt = k(q* - q)`; k is read with `Dims::inverseTime`.
  - Langmuir and Henry use van't Hoff `b = b_298 exp(-dH/R(1/T - 1/tRef))`, with dH < 0 so b falls as T rises (`IsothermModel.cpp:170-188`). The bar basis is converted by ×1e-5 (`:105-110`).
  - The extended-Langmuir mixture form is in `Adsorbent.cpp:118-144`; Henry species stay outside the shared site denominator.
  - Only `henry` and `langmuir` exist. There is no Toth, Sips, dual-site or IAST, and the competitive form with unequal q_max is the known thermodynamically inconsistent approximation.
- **Numerical dispersion and stability bound.**
  - D_num = v dz/2 with v = u/eps (FB:1515-1526), compared against D_L = Dax/eps. The bases are consistent.
  - nCells > 5 Pe (FB:1528).
  - The Gershgorin bound is 2u_i/dz for upwind and 6u_i/dz for van Leer; the derivative bound of 3 was checked. The LDF term is k(1 + rho_b q*'/eps), and q*' = dq/dp·RT is in m3/kg (FB:1568-1590).
- **Energy.**
  - The rows are conservative in U_j: gas `n(hs - RT)`, adsorbed `hs + dH`, solid `cp_s(T - T0)`, with face enthalpies carried by the same species fluxes (FB:1312-1331, 1824-1880).
  - The wall term `h·4/dBed·(T - T_w)` is in W/m3 and its integral is a state row (FB:612-626, 1862).
  - The ledger units check: J/mol × kmol = kJ (FB:2532); isothermal duty `-RTΔn_gas` (FB:2575); `mixingCupT_` uses 1000·kmol (FB:1390).
- **Mass conservation is published**: `mass_closure_<i>`, `carrier_fabricated_mol`, and the campaign `mass_closure_rel` (FB:3330-3336).
- **Batch adsorber.** `p = nRT/V`; q and n_gas follow from n_tot by construction; the isosteric heat is the Henry-limit van't Hoff value (`BatchAdsorber.cpp:599-614`); `Q_ads` is mol × J/mol / 1000 = kJ.
- **PSA and TSA units.** PSA: mol/kg × kg/mol × kmol/s (`PSA.cpp:205`). TSA: `zF·1000·tCycle` in mol, Q in kW (`TSATwinBed.cpp`).

### Goldens recomputed by hand

| Case | Quantity | Hand value | Golden |
|---|---|---|---|
| batch13 | q* = 5·1.35/2.35 | 2.872340 | 2.87234 |
| batch13 | c_in = 0.15e5/(R·298) | 6.05398 | (input to R_f) |
| batch13 | R_f | 304.0512 | 304.051 |
| batch13 | t_st | 3040.51 s | 3040.51 |
| batch13 | Pe | 250 | 250 |
| batch13 | E_ads = -45000 × 9.19149 mol | -413.617 kJ | -413.617 |
| batch13 | carrier make-up | 9.19149 mol | 9.19149 |
| batch13 | make-up ratio = 9.19149/84.76 | 0.1084 | 0.1084 |
| batch15 | Pe | 250 | 250 |
| batch15 | D_num = 0.125·0.02/2 = 1.25e-3; ratio 5; nCells | 1251 | (unpinned, item 7) |
| batch29 | k' = 500·0.4e-5·R·298.15/0.4 | 12.39479 | 12.3948 |
| batch29 | t_R = 4(1 + k') | 53.5791 | 53.5791 |
| batch29 | closed-closed variance + 2k't0/k + 4/12 | 33.1231 | 33.1231 |
| batch29 | variance with Pe_eff = 111.1 | 61.4571 | 61.4571 |
| batch29 | upwind outlet variance from the run | 61.600 | within 0.23 % of the 61.4571 anchor |
| batch20 | ΔT_ad = 129255/(920 + 106.6 + 0.586) | ≈ 125.8 K | 125.81 |
| batch20 | u_th | 7.95e-5 m/s | 7.958e-5 |
| batch09 | P = 0.029162 mol × RT/0.01 m3 | 7229 Pa | 7229 |
| batch09 | q* | 1.97084 | 1.97084 |
| batch09 | Q | -88.688 kJ | -88.688 |
| tsa01 | q_ads | 0.41284 | 0.41284 |
| tsa01 | q_regen (b = 0.09376) | 0.004684 | 0.004688 |
| tsa01 | utilisation | 0.6806 | 0.6806 |
| tsa01 | Q | 1.045 kW | 1.045 |
| psa01 | Dq_CO2 | 1.7425 | 1.7428 |

In the batch29 variance, the LDF term 2k't0/k_LDF was derived from the Laplace transform.

## 6. Mass transfer and dispersion: present vs declared, and where correlations plug in

**What exists today:**
- `Dax`: one scalar for every species, DECLARED (FB:216), on the bed basis.
- `k_LDF`: one value per species, DECLARED, and the only basis accepted is `solidFilm` (FB:340-344).
- No film coefficient k_f, no pore or Knudsen diffusion, no particle porosity, and no λ_ax or wall heat-capacity correlation.
- Computed quantities: Ergun's u (hard-coded, not an object), D_num, Pe, R_f, t_st, u_th and ΔT_ad.

**Plug points:**
- **(a) Dax.**
  - Replace `Dax_` by a per-species `DaxI_` filled at initialise (after FB:268, where `dParticle_` and `sphericity_` are known).
  - Feed it into `rhs_` (FB:1703, 1841, 1924, 1935-1947), `gershgorin_` (FB:1572), `numericalDispersion_` and `nCellsForTenth_` (FB:908, 1528), and the Pe KPI (FB:3214).
  - The inputs already exist:
    - μ: `thermo_->viscosityGas` (as at FB:1455);
    - ρ: Σ c MW (FB:1428);
    - D_m: `ThermoPackage::diffusivityGas(T, P, i, j)` (`ThermoPackage.H:735`, Fuller or Chapman-Enskog), which is binary only, so a carrier-pair or Wilke rule is needed;
    - Re, Sc: `thermo/Dimensionless.H` (`reynolds`, `schmidt`).
  - The correlation result should CARRY ITS BASIS (interstitial D_L), and the engine sets `Dax = eps·D_L`. Velocity: use the feed u, and announce it, because Ergun's u varies along the bed.
- **(b) Film k_f** (Wakao-Funazkri Sh = 2 + 1.1 Sc^1/3 Re^0.6) and **Glueckauf in series.**
  - Add a new `kLDF.basis resistancesInSeries` at FB:333-396:
    `1/k = (r_p ρ_p q*'/(3 k_f)) + (r_p² ρ_p q*'/(15 ε_p D_p)) + r_c²/(15 D_c)`.
  - It needs:
    - ρ_p = ρ_b/(1-eps), which is already derived and printed;
    - a NEW asset datum ε_p (and a tortuosity);
    - D_c/r_c² as sample data;
    - q*' as the chord slope q*(c_in)/c_in, or the local slope evaluated in `rhs_` beside the LDF source at FB:1661-1668.
  - Each resistance should be printed term by term, in the Gershgorin style.
- **(c) λ_ax** would be one more term in E_f (FB:1830-1846).

**Correlation families to copy:**
- **`FrictionFactorCorrelation`** (`hydraulics/friction/FrictionFactorCorrelation.H:118`) is the most complete model to copy.
  - It has `type()`, `validityWindow()`, `citation()` and `evaluate(FrictionContext{Re, relRough})`, which returns `{f, inValidity, validityNote, regime}`.
  - `verify()` returns `VerifyResult{dev, f_choupo, f_published, anchor}`.
  - It uses the explicit factory `registerType`/`New`/`availableTypes`/`registerBuiltins`, and it is benched by `frictionBench`.
- **`HeatTransferCorrelation`** (`heatTransfer/htc/HeatTransferCorrelation.H:95`) has `Context{u, d_h, lambda, mu, rho, cp, heating}` and `Result{Re, Pr, Nu, h, inValidity, validityNote}`, plus `validityWindow`, `readParameters` and `verify`. It has **no `citation()`**.
- **`MassTransferModel`** (`membrane/massTransfer/MassTransferModel.H`) is the existing Sherwood family. It has `Context{u, d_h, D, mu, rho}`, `kFilm()` and `readParameters`, but **no window, citation or verify**.
- **The transport models** use `CorrelationVerify` (`thermo/transport/CorrelationVerify.H:69`): `{dev, value_choupo, value_published, anchor, kind theory|arithmetic, tolerance}`. The `kind` field is the honest way to label an anchor that only checks the transcription.

**Recommendation:** a packed-bed family with `Context{u_superficial, eps, d_p, rho, mu, D_m}`, three slots (axialDispersion, filmMassTransfer, and Ergun moved in), and `validityWindow` + `citation` + `verify→CorrelationVerify`. Make the output basis part of the result type, so that item 3 cannot recur.
