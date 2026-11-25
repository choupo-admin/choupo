# Random packings -- which, which law first, and what can be claimed (C513)

*Design record, 2026-11-25, general on branch `worktree-agent-ab8cb0b88768e75ed`.
Phase 1 of C513.  Every table value and equation below was read on the PAGE
IMAGES of the primary (the text layer of these scans garbles equations), page
cited, twice.*

## 1. State of the tree
`data/standards/assets` holds two structured packings (SulzerBX, MontzB1-250).
The engine has two STRUCTURED laws (`PackingRBF`, `PackingDelft`) and no random
one: a `record` with `arrangement random` is refused
(`PackingRecord.cpp:405`), `packing { model ...; }` accepts RochaBravoFair and
Delft only (`RateBasedSegment.cpp:227`, `DistillationColumn.cpp:5589`).

## 2. Which law first: Billet & Schultes 1999 (Trans IChemE 77A, 498-504)
One paper gives, for ONE set of per-packing constants, the loading point
(Eqs 31-35), flooding point (36-40), holdup (41-44, 12-13), pressure drop
(23-30), the gas and liquid film coefficients and the interfacial area (6-9,
14-16): exactly what the rate-based segment asks of a packing (`k_G, k_L, a_e,
h_L, dP, flooded`).  Onda, Takeuchi & Okumoto 1968 (J. Chem. Eng. Japan 1, 56)
gives films and wetted area only (Eq 1 a_w/a_t, Eq 2 k_L, Eq 3 k_G; needs a_t,
the nominal size d_p and the critical surface tension of the packing
material) -- no holdup, no pressure drop, so it cannot drive a bed alone, and
pairing it with another paper's hydraulics would be a law nobody published.
Bravo & Fair 1982 (IECR PDD 21, 162, Eq 23: a*/a_p = 0.498 (Ca_L Re_G)^0.392)
is a correction ON TOP of Onda's films, for distillation.  Order: **B-S now**;
Onda + Bravo-Fair next, as a second selectable law and as the independent
cross-check of B-S on the same state.  Not done in this slice.

## 3. Record fields
Under `arrangement random|structured`, B-S reads `specificArea` a (m2/m3) and
`voidFraction` eps (both in the record already) and six constants of the
packing under the correlation, `correlations { BilletSchultes { CS CFl Ch CP0
CL CV } }` (Table 2a/2b, pp. 501-502; C_S loading, C_Fl flooding, C_h hydraulic
area, C_P,0 dry pressure drop, C_L liquid film, C_V gas film).  The column
adds its diameter (wall factor K, Eq 24).  A blank cell of Table 2 is a
constant the authors did not publish: the record omits it and the law refuses
by name the one it lacks.  Onda would add `nominalSize` and
`criticalSurfaceTension` (61 / 75 / 33 mN/m ceramic / steel / polyethylene as
Bravo & Fair p. 163 quote them; not read in Onda itself yet).

## 4. Packings entered (Table 2a, p. 501; every row complete)
Pall ring metal 50 mm, metal 25 mm, plastic 50 mm, plastic 25 mm; Raschig ring
ceramic 25 mm.  NOT entered, and why: **Raschig ring ceramic 50 mm** (C_h and
C_P,0 blank), **Berl saddle ceramic 25 / 13 mm** (C_S, C_Fl, C_P,0 blank: no
loading, flooding or dP), **metal Raschig rings, Intalox saddles, IMTP**: the
paper has no row for them.  Pall rings carry the metal/plastic split the user
asked for; the ceramic Raschig 25 mm is the only classical ring that is
complete.

## 5. Validity window (Table 1, p. 499), announced, not refused
Mass transfer: F_V 0.003-2.77 Pa^0.5; u_L 0.256-118 m3/m2/h; rho_L 361-1237;
nu_L 0.14-1.66e-6 m2/s; sigma 0.7-74 mN/m; D_L 0.29-6.5e-9; rho_V 0.07-97;
nu_V 0.14-126e-6; D_V 0.29-87.4e-6 m2/s.  Hydraulics: Table 1 columns.  A state
outside is printed with the number and the limit it left.  Also stated by the
paper and carried: the surface tension is floored at 0.03 N/m in Eqs 9 and 15
(p. 500); the system is assumed neutral or positive (the Marangoni correction,
Eqs 17-20, for negative systems is NOT implemented and the run says so).

## 6. In-sample
All six constants are FITTED by the authors to their Bochum database (over 3500
points, 50 systems, 70 packings, p. 498): everything in that database is
in-sample, including every packing entered.  Stated accuracy (Table 3, p. 503,
average relative deviation, on their data): loading/flooding 5 %, holdup 6.7 %,
dP 9.1 %, absorption/desorption MT 12.4 %, rectification MT 14.1 %.

## 7. Measurement plan -- and the honest answer
No published data set on a RANDOM packing that the constants were not made
from is in hand: the Bochum database is not tabulated; Bravo & Fair's FRI runs
appear only as plots (Figs 1-17); Gorak, Pelkonen, Schulz, Mori and Fair 2000
are STRUCTURED packings.  What can be claimed:
1. the code reproduces the paper's equations: a hand point computed in a
   separate Python program (not the engine) from the same equations, held to
   1e-9 (unit test);
2. every branch of the law is exercised by that hand point: Re_L below and above 5 (Eq 42/43), flow
   parameter below and above 0.4 (Eqs 34-35, 39-40), below loading, between loading and flooding, and
   flooded (11 states, 142 values); sabotaged by hand, three typos in the law are caught;
3. the cross-law check, information only: B-S k_L, k_G, a_e against Onda +
   Bravo-Fair once that law lands (slice 2);
4. NOT claimed: agreement with any measurement.  The witness case
   (cyclohexane / n-heptane total reflux on 25 mm metal Pall rings) carries a
   golden (what the engine prints) and no `anchor` row; its header says so.
The first measured random-packing set that arrives (an FRI HETP table, a
Billet data sheet) becomes the anchor and is held out of any constant.

## 8. Doubtful digits (every one)
Eq 44's water viscosity and density, and Eq 15's sigma_W, name "water" with no
temperature: taken as 20 C (1.002 mPa s, 998.2 kg/m3, 72.8 mN/m), declared.
Whether Eqs 6-8 take the real holdup (41) or the channel holdup (11): the text
(p. 504) says the real one replaces it; implemented so.  The exponent 13 of
Eqs 12 and 14 is read as printed (13, not 1/3).  The two-column scan of Table
2a is clear at 200 dpi; no digit of it is doubtful.  **The 0.03 N/m floor on sigma (p. 500) binds on
EVERY organic liquid** (hydrocarbons 0.015-0.025 N/m): Eq 9 then sees 0.03 whatever the liquid's
value.  It is implemented as printed and announced in every run; if the authors meant it only for the
high-pressure data that motivated it, the interfacial area of an organic liquid is underpredicted.
That reading is not settled by the paper.
