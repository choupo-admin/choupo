# Newcomer review of the tutorials -- findings (2026-11-02, origin/main 663bc5510)

Posture: an engineer who has never seen Choupo, following README -> docs/start-here.md -> the cases.
Each finding: where, what a newcomer meets, why it matters.  Read-only; nothing fixed.

## A. README.md (first page anyone reads)
A1. README.md:79 `make wasm-gui` "all four binaries"; README.md:199 capability matrix "all three binaries as WebAssembly"; the header says five.  Three counts on one page.
A2. Capability matrix is stale: post-processing lists only `stirredTank`, `shellTubeHX` (there are many sizers: column, vessel, catalyst bed, relief valve, gas storage...); batch unit ops list only batchReactor/batchStill (batchDiafilter, batchElectrodialysis exist); membrane lists only spiralWoundModule (electrodialysisStack exists).  A newcomer underestimates the tool.
A3. "Flowsheet machinery: sequential-modular with Wegstein on tear streams" vs the header's "Newton-on-tears, or Wegstein".
A4. Roadmap section still describes Choupo-2608 ("Four binaries") as if current.

## B. docs/start-here.md
(see per-step notes below)

## C. Step 1 -- flash01_benzene_toluene
C1. 0/liquid and 0/vapor ship the CONVERGED answer to 9 digits (23.2391788 kmol/h ...).  The first case a student opens shows the outlet as an INPUT file; nothing in those files says "seed, overwritten by the solve".  A newcomer asks: is the answer typed in?
C2. Case README.md opens "The same feed as `adiabaticFlash01`" -- the FIRST tutorial points at a case the student has not seen.
C3. Case README "What to try" says the next case is flash06_sweep_T; start-here says step 2 is compare_activity_etoh_water.  Two different "next".
C4. Case README carries editorial history aimed at maintainers ("This line used to send you to the Props tab...", "This README first said ... the case's own golden said otherwise").  Confusing for a student.
C5. controlDict comment "(v0.41+)" -- a version scheme the project no longer uses; the comment lists three reports, the block declares five (utilities, spreadsheet unexplained).
C6. 10 of the 21 tutorial `CLAUDE.md` files ship an unfilled template (`Goal: <what this case is for>`), e.g. steady/distillation/column01_benzene_toluene/CLAUDE.md -- a placeholder in a shipped case.

## D. Steps 2-5
D1. flash02 README contradicts itself: lesson 4 says the feed "declares only T and P" and is resolved at its own state; "What to try" says switching to ideal makes Q_kW non-zero "because the feed's declared vapour fraction is no longer the answer".  If the feed is resolved under the same model as the drum, Q stays 0.  (TO RUN.)
D2. column01 README: "The same equimolar benzene/toluene feed" -- the student just ran flash01, which is 40/60.  Also "Compare with shortcut01", a case not on the path.
D3. column03 header "payoff of the v0.48 solver" and column01 controlDict "(v0.41+)": dead version labels.
D4. column03 README lesson 5 and header: long maintainer history ("Until 2026-10-05 ... DEV.md D1") in student-facing text.
D5. column03 "T_top ~ 351.4 K (the azeotropic temperature)" -- x_D = 0.80 is below the azeotrope; the top is near, not at, the azeotropic T.
D6. Step 9 (acetonePlant/CLAUDE.md) carries a results table dated 2026-08-13 (C1 condenser = reboiler = 0.849 MW); the CMO duties changed later (C169/C174).  (TO RUN: does the table still hold?)
D7. Step 6 (cstr01) writes `operation { V_R 0.005; }` with NO unit, while step 3's README teaches that a bare scalar is read as raw SI and once cost a silent wrong answer.  The path teaches "units are mandatory" and then shows a bare volume.
D8. Step 6 README: esterification "exothermic, Q_kW = -1.88" with extent 0.0730 mol/s -> about -26 kJ/mol.  Liquid-phase formation enthalpies give about -3.5 kJ/mol for ethanol + acetic acid -> ethyl acetate + water.  (TO RUN: where the duty comes from.)

## E. Corpus-wide sweeps (counts, not opinions)
E1. 43 case dicts/READMEs carry dead `v0.xx` version labels.
E2. 7 case READMEs carry dated maintainer history ("Until 2026-...", "used to say").
E3. All 40 `tier tutorial;` cases have a README; about 480 of the ~600 case folders have none and rely on dict headers.
E4. Case NUMBERS collide: flash01 (steady/flash/flash01_benzene_toluene AND props/molecular/flash01_operating_line), flash09, flash10, flash21, batch13, ctrl17, gibbs06, process02, stripper01 (two folders, absorption/ and distillation/).  A newcomer told "open flash09" or "stripper01" finds two.
E5. docs/tutorials-catalogue.md row column09: "the tray stack is sized and NOT costed, because Choupo ships no tray cost correlation" -- trays have been costed since 2026-10-05 (CLAUDE.md C38).  An absence that outlived its fix.
E6. docs/tutorials-catalogue.md is headed "Audience: dev" but start-here sends newcomers to it; row flash02 says "NRTL with Wegstein outer loop", its README says Rachford-Rice in one unknown.

## F. Running the path (build 663bc5510, every step exit 0, each under 0.2 s)
F1. `runCase`'s terminal "summary" is `tail -14` of the log (bin/runCase:357), not a summary.  flash01: no V/F, no stream table, no balance verdict -- only caveats.  ammonia01: the list is cut mid-way (its heading is gone), no recycle verdict, no answer.  start-here.md promises "whether the balances closed"; it is not there.
F2. flash01 log: "Iterations: 5 (CUMULATIVE ...)" under a table showing iterates 0-3; the README asks the student to "count them".  The two counts disagree on screen.
F3. flash01: start-here says the 380.25 K toluene notice is the solver "probing the phase boundary"; the log says it is the T-x-y diagram's own diagnostic scan, "NOT your operating point".  The log is right; start-here explains it differently.
F4. Caveat text carries internal codes ("I4 -- extrapolation is a legitimate choice") a newcomer cannot decode.
F5. column01 README: condenser -1283 kW / reboiler 647 kW / 28.31 + 1.86 EUR/h.  The run and the golden: -1315.29 / 679.51 / 29.35 + 1.89.  README numbers predate the condenser fix (C169/C174).
F6. column03 README: reboiler 956.24 / condenser -952.97 kW and "first law closing at 0 kW".  Run and golden: 1000.15 / -996.89 (and Q_reboiler_ownEnvelope 1017.60 published beside it).  Stale for the same reason.
F7. flash02 "What to try" (NRTL -> ideal) tested on a copy, editing `model NRTL;` to `model ideal;` as a student would: V/F goes 0.798 -> 0 (subcooled liquid) and Q_kW STAYS 0.  The README predicts Q_kW becomes non-zero.  False prediction.
F8. In that same edit the NRTL `binaryParameters` block was left in place and the run said NOTHING about it -- a declared parameter set silently unread under `model ideal`.  (Engine silence, not only a README issue.)
F9. **Wrong number at exit 0, step 6 (cstr01).**  Q_kW = -1.879 for extent 0.07304 mol/s = -25.7 kJ/mol.  Liquid ethanol + acetic acid -> ethyl acetate + water is about -2 to -4 kJ/mol.  Reconstructed by hand: every liquid enthalpy is the ideal-gas datum minus a Watson Hvap; for aceticAcid the datum is the MONOMER gas (-432.25 kJ/mol) and `HvapTb 24390` is the heat of vaporisation to the real, DIMERISED vapour.  Liquid acetic acid comes out about 24 kJ/mol too high (-460.5 against -484.3 kJ/mol), and the whole error lands in the reaction heat: -25.5 kJ/mol by hand, -25.7 printed.  The other three species are within 1 kJ/mol.  Likely reaches other cases that price liquid acetic acid (aceticAcid01/02, esterification); not measured here.  Not fixed; a data/arity decision.
F10. ammonia01: before the 700 K Gibbs converter (single gas phase) the log raises Antoine "ABOVE its critical temperature" for N2, H2, NH3 at 700 K and Henry extrapolations 395 K above range.  A newcomer cannot tell whether the answer depends on them; nothing says which calculation asked.  Also the separator's own 250 K is 38 K below the H2-NH3 Henry fit.
F11. Step 5 and 6 "What to try" behave as promised: column03 under WangHenke exits 2 with max|dx| 0.534 after 200 passes; cstr01 at V_R 0.010 gives Da 2.2186, X 0.6893 = Da/(1+Da).  (Good.)
F12. Step 9 acetonePlant: runs in 49 s, exit 0; the streams of its CLAUDE.md table still hold (27.46 kmol/h, 0.9727, recycle 0.4991/0.1395), but the recycle now takes 4 Wegstein iterations (table: 3) and the column duties moved: C1 condenser -0.986 MW / reboiler 0.986 MW (table 0.849 / 0.849; "-18.7 %" and "-30.3 %" against Luyben are now -5.6 % and -19.0 %), C2 -0.119 / 0.127 MW (table 0.116 / 0.124).  The page a newcomer is sent to on the last step quotes errors that are no longer the errors.
F13. acetonePlant stream table prints `H2=-0.0000` in waterProduct (value -2.9e-34): a negative-zero composition on screen.

## G. The other 22 `tier tutorial;` cases (all exit 0; 19 under 0.3 s; flash19 6 s, stripper01 3 s, extract02 6 s)
README bold numbers checked against each run's published values (script, tolerance = the printed digits):
G1. column18_partial_condenser README table: partial condenser -870 kW / reboiler 673 kW; total-condenser column -1291 / 655.  Run: -888.55 / 691.21 (and column01 gives -1315.29 / 679.51).  Stale (C169/C174).
G2. extract02_declared_interior README: "34" sweeps from the unit's own seed; run: 35.
G3. Everything else matched within its printed digits (adiabaticFlash01, batch01, process02 costs and the rest were checked by hand where the script could not parse the number).

## H. listCases, the catalogue a newcomer browses (503 rows)
H1. bin/listCases takes the DESCRIPTION column from the first comment line of system/flowsheetDict, not from `controlDict.description` (which the catalogue and CLAUDE.md call the case's one-line label).  Result: 11 rows read just "units" (e.g. flash19, flash21, analysis01/02, batch16-18) although their controlDict carries a full description; 48 rows show only the case's own name.
H2. Descriptions written for maintainers: "the EXACT-solution gate (G1a of the A2 spec)", "THE A5 WITNESS", "A6 item 4", "gate G6" -- 12 rows of spec codes a student cannot decode.
H3. Deliberately failing cases (batch12_adsorber_refused_P "must FAIL", tsa02_refused_capacity, ...) sit in the same list as working examples with no marker column; a newcomer who runs one sees a failure.

## I. A sample outside the path (15 cases: unsteady, ctrl, membranes, electrolytes, ED, crystalliser, dryer, economics, evaporator, power, adsorber) -- all exit 0
I1. membrane01_RO_NaCl_seawater, "the canonical first-membrane case": its header promises recovery ~18 %, rejection ~99.5 %, flux 20-25 LMH.  Run: recovery 15.8 %, rejection 99.79 %, J_w 1.327e-5 m/s = 47.8 LMH.  The header contradicts itself (18 % of ~10 m3/h through 35 m2 is ~51 LMH, not 20-25) and the result.  Same header writes `area 35.0;`, `length 1.0;`, `k_film 5.0e-5;` with no units.
I2. evaporator01_brine: economy and V/F print the same number to 12 digits (0.8204) because the case declares a steam flow of exactly 100 kmol/h = the feed flow; consistent, but a newcomer will think one KPI is a copy of the other.  A sentence in the header would remove the doubt.

## J. The site (www.choupo.org/app, headless Chromium, 2026-11-02)
J1. THREE different "start here" orders: docs/start-here.md (9 cases: flash01 -> compare_activity -> flash02 -> column01 -> column03 -> cstr01 -> composite01 -> ammonia01 -> acetonePlant); the landing page's "NEW HERE? START WITH ONE OF THESE" (adiabaticFlash01 -> flash01 -> process01 -> estimate_acetone); and the Browse folder "start here: the first path" (the 40 tier-tutorial cases in family order, with flash19's four phases 6th and column13's sour-water stage identity 9th).
J2. **MASS: "not published" on every case run on the site** (flash01, cstr01, ammonia01), while the engine publishes 100.000 % closure.  Cause read in the code: src/result/ResultEmitter.cpp:1229 emits `globalMassBoundary` ONLY when a utility circuit is declared, and its comment says a reader that does not find it should read the massBalance report's TOTAL scope; gui/src/case/runSummary.ts:65 reads only `globalMassBoundary` and falls to null.  The GUI breaks the emitter's stated contract on almost every case.  Same on main (not only the deploy).
J3. flash01's ENERGY cell reads "residual -2.274e-13 kW (no scale for a %)": round-off shown to a beginner as a residual.
J4. A landing card opens the case in a NEW TAB and leaves the landing page as it was; a first-time user (and a test script) reads it as "nothing happened".
J5. Every page load logs a 404 for /__thermoml/index.json in the browser console.
J6. The site runs cstr01 to the same Q = -1.9 kW (finding F9 reaches the browser too).

## K. A newcomer's mistakes (four edits on a copy of flash01)
K1. `P 1.0;` (unit forgotten): a clear WARNING ("1.0000 Pa -- a hard vacuum.  Did you mean `P 1.0000 bar;`?") -- but the run exits 0 with V/F = 1, and the warning is NOT in the end-of-run caveat block, so `runCase`'s terminal (tail -14) never shows it.
K2. `Temp 370.0 K` (key misspelt): announced well in the log ("1 key written and never read ... the reader looked for: T alphaRich betaRich phaseSet") and the run continues on the feed's T; again not in the caveat block, so invisible on the terminal; exit 0 with an answer identical to the correct case.
K3. `benzen` in 0/feed: exit 2 "ThermoPackage: component 'benzen' not loaded" -- no file name, no line, no "did you mean benzene", although the key audit above already knows how to suggest a name.
K4. `type isothermalFlsh;`: exit 2 with the full list of registered types (good; no nearest-name suggestion).
(Compare F8: a whole NRTL `binaryParameters` block left under `model ideal` is not reported by that same unread-key audit.)

## Priorities (the architect's rule: a wrong number at exit 0 first)
1. F9 -- cstr01 (start-here step 6) reports an esterification heat about 7x too large; root cause is acetic acid's liquid enthalpy (monomer gas datum minus a dimer-vapour Hvap).  Data decision, reaches several cases.
2. J2 -- the GUI's MASS cell says "not published" on almost every case (GUI reads only an object the engine emits only when utility circuits are declared).
3. F1 / K1 / K2 -- runCase's terminal summary is a tail of the log: no answer, no balance verdict, and the two most common newcomer mistakes never reach it.
4. J1 -- three different "start here" paths (doc, landing page, browse folder).
5. Stale numbers in tutorial READMEs/CLAUDE.md after the condenser fix: column01, column03, column18, acetonePlant (F5, F6, G1, F12), extract02 (G2); false "What to try" in flash02 (F7); membrane01's self-contradicting header (I1).
6. Housekeeping: README binary counts (A1), stale capability matrix (A2), listCases descriptions (H1-H3), duplicate case numbers (E4), template CLAUDE.md placeholders (C6), seeds holding the answer in the first case (C1), maintainer history and dead version labels in student text (C4, D3, D4, E1, E2), tutorials-catalogue stale tray-cost absence (E5).

Nothing in this review was fixed; every number above was measured on origin/main 663bc5510 (native build) or on the live site the same morning.
