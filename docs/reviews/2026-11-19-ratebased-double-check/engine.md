# Rate-based packed segment -- independent engine review (tree d0d2d1c1e5)

Scope read: `RateBasedSegment.{H,cpp}`, `PackingRBF.{H,cpp}`, `PackingDelft.{H,cpp}`,
`PackingRecord.{H,cpp}` (range checks), the dispatch in `DistillationColumn.cpp:1358,5879-5884`,
`core/Units.cpp`, `core/Dictionary.cpp:440-478`, the four `ratebased0*` cases and goldens, the
`packing0*` goldens, design record `c329-ratebased-first-delivery.md` sec. 11-12,
`c329-ratebased-at-general-reflux.md` sec. 4, Theory Guide `sec:rateBasedSegment`.
No native build exists in the tree (`build/` and the `choupoSolve` symlink are absent), so no case
was run; all numbers below are read from the goldens or recomputed by hand.
`TrayEfficiency.H` is NOT on the rate-based path (only `solveRateBased` -> PackingRBF/PackingDelft).
No Billet-Schultes or Onda correlation exists in `src/` (record sec. 11: B&S has no constants for this packing).

## WRONG

None found on any path the corpus exercises.

## SUSPECT

1. **`corrugationAngle` written with its unit is converted twice (latent, silent, factor 57).**
   `RateBasedSegment.cpp:244` (and the transfer-unit bed, `DistillationColumn.cpp:5599`) read
   `lookupScalar("corrugationAngle") * pi/180`.  But `deg` is a registered unit
   (`core/Units.cpp:362`, factor pi/180) and the parser applies it at read time
   (`core/Dictionary.cpp:466-468`).  So `corrugationAngle 60 deg;` becomes 1.047 -> 0.0183 rad
   (1.05 deg).  The only guard is `inRange` 0 < v < 90 (`PackingRecord.cpp:105`, applied at :190,
   :456, :661), which 1.047 passes.  Consequence: sin(theta) ~ 0.018 enters every RBF/Delft
   equation (dP, h_L, U_ge, U_Le, k_G, k_L) at exit 0.  All shipped cases/records write a bare
   number (`60;`, `45;`), so no golden is affected; any author who writes the unit gets garbage.
   Fix: read with a unit check (refuse a bare number or accept `deg` only and drop the *pi/180).
2. **Delft judged against Rocha-Bravo-Fair's flooding constant.**  `c.flood = r.dP / pg.dPflood`
   (`RateBasedSegment.cpp:476`) and the mean-drop refusal (`:771-779`) use `pg.dPflood` = 1025 Pa/m
   (`PackingRBF.H:94`, RBF 1993 p. 649) also when `model Delft`.  The comment admits it (:767-770);
   but KPI `dP_over_dPflood_max` on ratebased03/04 is a ratio to another model's criterion. Also
   the flood message at `:462-464` names "Rocha-Bravo-Fair holdup" unconditionally (unreachable
   for Delft, which never sets `flooded`, `PackingDelft.H` header).
3. **Heat/mass analogy on the Delft vapour film.**  `hGc = kG rho cp (alpha/D)^(2/3)`
   (`:494`) is Chilton-Colburn, exact for a `Sc^(1/3)` correlation (RBF Eq 5, `PackingRBF.cpp:127`)
   but Delft's k_G is `sqrt(k_lam^2 + k_turb^2)` with a Gnielinski-type turbulent term
   (`PackingDelft.cpp:121-126`), not a Sc^(1/3) power law.  An approximation, printed as
   "vapour Chilton-Colburn" (`:955-956`) without saying so for Delft.  Moves only T_I and the flux
   ratio (energy closure is blind to gamma, as `cv.blindTo` correctly states, `:828-833`).
4. **Same packing, two surface descriptions.**  RBF cases declare Montz A3-500M `surface gauze`
   (ratebased01/02 flowsheetDict), the Delft cases say `holeFraction 0; // unperforated (Schulz
   section 2)` and use Delft's sheet-metal effective-area law.  Not an engine defect (Schulz
   compared with Delft too), but the case comment reads as a property of a gauze it is not.

## OK -- verified

**Model (`RateBasedSegment.H:35-77`, residual `.cpp:554-636`).**  Two-film, binary, Fickian
(effective-diffusivity) films with the bootstrap closed by the interface energy balance -- matches
`c329-ratebased-at-general-reflux.md` sec. 4.2 exactly.  Films: `w1 = beta_V(yI - ybar) +
(yI+ybar)/2 w_t` and `w1 = beta_L(xbar - xI) + (xI+xbar)/2 w_t` (`:603-604`): low-flux film
theory with the convective term on the film-mean composition, no high-flux (Stefan) correction --
stated, and the printed rate factor is 6-9e-4 on all four goldens, so negligible.  Signs of the
three energy rows (`:608-618`) are right: vapour gains `e_V = gamma_V(T_I - T_V) + sum w_i H_i^V(T_I)`,
liquid loses `e_L = gamma_L(T_L - T_I) + sum w_i Hbar_i^L(T_I)`, `e_V = e_L`.  Liquid partial molar
enthalpies by `H1 = h + x2 dh/dx1` (`:356-377`) are correct for a binary.  Fenske HETP on bed-only
stages (`:798-799`) is right for total reflux (x_D odds = alpha^N x_N odds); the golden's
x_belowBed 0.2364 = y*(0.20) at alpha 1.24 confirms the reboiler is the extra stage.  Richardson
/3 for a second-order box scheme (`:826`) and the segment-count remedy sqrt-scaling (`:904`) are
consistent.

**Correlations, transcribed and checked against my recollection of the primaries.**
RBF 1993: dry drop A = 0.177 rho_g/(S eps^2 sin^2), B = 88.774 mu_g/(S^2 eps sin) (`PackingRBF.cpp:92-94`);
F_t = 29.12 (We Fr)^0.15 S^0.359 /(Re^0.2 eps^0.6 (1-0.93cos g) sin^0.3) (`:87-88`); h_L (`:104-105`);
g_eff (`:102`); K2 = 0.614 + 71.35 S (`:95`); cos g = 0.9 below 0.055 N/m, the aqueous branch refused
(`:77-81`).  RBF 1996: Sh = 0.054 Re^0.8 Sc^0.33 on (U_ge+U_Le) (`:127-128`), k_L with C_E = 0.9
(`:129`), gauze a_e/a_p = 1 - 1.203 Fr^0.111 (`:130`).  Delft (Fair et al. 2000 Tables 2/4):
delta, d_hG, phi, l_Gpe, xi_GL (Colebrook form), zeta_GL, zeta_GG (0.722 cos^3.14), psi (minus
reading stated), xi_bulk 1.76 cos^1.63, xi_wall, F_G,lp and the 3.8 loading factor, a_e/a_p =
(1-Omega)/(1 + 2.143e-6/u_Ls^1.5), Sh_lam 0.664, Sh_turb with xi_GL phi/8, k_L with 0.9 d_hG
(`PackingDelft.cpp:75-128`) -- all as I recall them.  Units of u_Ls inside xi_wall (Eq 45):
SI m/s assumed, cannot verify from memory.  All constants are SI forms; inputs are SI
(`PackingRBF.H:97-104`; package returns J/mol, kg/m3, Pa s, N/m, m2/s, W/(m K) --
`ThermoPackage.H:378,700-760,875`; MW kg/kmol, `Component.H:101`).

**Units audit, traced.**  V_reb = F A_T sqrt(rho_V)/MW -> kmol/s (`:421`).  U_Gs, U_Ls =
(kmol/s)(kg/kmol)/(kg/m3 m2) -> m/s (`:441-442`).  c = rho/MW kmol/m3; beta = c k a_e A_T dz/V_ref
dimensionless (`:467-469`), and H_G = dz v/beta_V reduces exactly to U_Gs/(k_G a_e) of the
correlation (`:852`).  rho cp = c*1000*cp[J/mol K] -> J/(m3 K) (`:493`); h_G, h_L W/(m2 K);
gamma = h a_e A_T dz/(V_ref*1000) J/(mol K), consistent with w (per V_ref) x H (J/mol) (`:497-498`).
Energy rows / lamRef dimensionless.  Q = (kmol/s)(J/mol) = kW (`:834-838`, tolerance `:1087` same).
Labels: mbar = Pa*1e-2 (`:981`, `:1023`), m3/(m2 h) = m/s*3600 (`:473`), bar = Pa*1e-5,
F-factor (m/s)(kg/m3)^0.5, Na_ in kmol/(m3 s) of bed (`:872`).  `V_boilup` (kmol/s) and profile
`P` (Pa) carry no unit in their key -- cosmetic.

**Golden plausibility (hand recomputation, ratebased01 at F 1.6, 0.103 bar, 347 K).**
rho_V = 0.379 kg/m3 -> V = 1.6*0.616*1.169/106.17 = 0.01085 kmol/s (golden 0.010850); Q_cond
~ 0.01085 x 40 kJ/mol = 438 kW (golden 437.9); u_L 4.3 m3/(m2 h) (Schulz Table 1: 4.18 at F 1.5);
a_e/a_p = 1 - 1.203(u_L^2/Sg)^0.111 = 0.646 (golden 0.6461); Delft h_L = delta a_p = 0.0375
(golden 0.0371) and a_e/a_p 0.958 (golden 0.9581); P_bottom = 0.1 + 2.2*1.385 mbar = 0.10305 bar.
HETP 0.13-0.18 m and dP 0.7-1.6 mbar/m are plausible for a 500 m2/m3 gauze under vacuum (the
0.2-0.6 m band applies to ~250 m2/m3 sheet metal).  Flux ratio 0.97-1.01 and V_top/V_bot 1.009
are consistent with the xylenes' latent-heat ratio (~0.98).

**Validation statements.**  README "HETP differs from the transfer-unit bed by a few tenths of a
per cent at most": goldens vs packing01-04 give +0.20, +0.16, +0.06, +0.03 % -- TRUE.  "Carries
the same errors against the measurement": at the goldens' own bed-mean F, interpolating the
digitised Fig. 2b (first-delivery sec. 11-12): RBF 0.10 bar -12 %, RBF 0.02 bar -16 %, Delft
0.10 bar -4 %, Delft 0.02 bar -2 % -- inside the record's tabulated error bands.  The Theory
Guide's per-case table (flux ratios, T_I-T_V, V ratio) is at F 1.5 and does not match the goldens'
F 1.6/1.8 row by row; the Guide says so explicitly, so it is not a contradiction, but it cannot be
checked without a build.  Discretisation estimates 2e-5..7e-5 of HETP (goldens) are far below the
1 % refusal.
