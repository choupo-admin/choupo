# Review of the C200 kernel brief (2026-11-02)

Subject: `docs/ai/kernel.md` on `origin/backup/c200-handoff` (656822b90), 14 269 bytes (about 3.6 k tokens,
inside the 6-8 k target).  Method: every engine claim checked against the C++ it describes, then THREE cases
written from the kernel ALONE and run on origin/main (native build), plus its two thermodynamic routes.

## What holds (measured)
- Unit keys read from the C++: heater takes only `Q` and refuses `Tout` by name (Heater.cpp:70-79); pump
  `eta` + `P_out`/`dP`/`W_shaft`; compressor `eta` + `P_out`/`W_shaft`; turbine `eta` + `W_shaft`, no `P_out`;
  splitter `fractions`; isothermalFlash T and P default to the feed's (IsothermalFlash.cpp:2049-2052); pipe
  refuses an all-vapour inlet (Pipe.cpp:146-171); absorber/stripper read `stages`; phaseChanger's six
  specification keys exist.
- All 22 component names in section 6 exist in data/standards/components/; the nine NRTL pairs listed are
  exactly the nine files in data/standards/parameters/NRTL/.
- Case k1 (ideal; mixer + phaseChanger `outletT 97 degC` + flash + splitter + valve, tear `recycle`,
  `componentMassFlows` in kg/h): init0 exit 0, solve exit 0, mass 100.000 %, energy residual 3e-10 kW.
- Case k2 (phiPhi SRK block exactly as written in the kernel; compressor `P_out 30 bar`, heatExchanger
  `area 50 m2; U 300 W/m2/K; flow counter;`, phaseChanger `outletT -30 degC`, flash, valve; `molarFlow` +
  `moleFractions`): exit 0, mass 100.000 %, energy residual -0.0003 kW.
- Case k3 (pump `dP 1 bar`, phaseChanger, distillationColumn with `distillateRecovery { component; fraction; }`):
  exit 0, x_D 0.9986.
- `activityModel { model NRTL; }` resolves the catalogue pair (ethanol-water flash reproduces flash02:
  V/F 0.79756, K_ethanol 2.2274); `{ model UNIFAC; }` runs (V/F 0.7983, K_ethanol 2.0405).

## What does not hold

1. **WRONG NUMBER AT EXIT 0 -- the kernel's own recommended unit.**  Section 7 says "phaseChanger ...
   `outletState saturatedVapour|saturatedLiquid` ... **Use this to reach a T.**"  On a MIXTURE, `outletState
   saturatedLiquid` (and `outletQuality 0`) returns a liquid 119 K below its saturation: case k3, 40/60
   benzene/toluene at 2.2 bar, T_out = 294.515 K, the unit's own `Tsat` 413.515 K, Q = -15.1 kW of COOLING
   for a feed at 298 K.  Cause (src/unitOperations/heatTransfer/PhaseChanger.cpp:428-433): the bracket scan
   looks for a sign change of vf(T) - 0, which is exactly 0 everywhere below the bubble point, so the FIRST
   scan interval [Tc-120, Tc-118] passes `fprev * fcur <= 0` and Newton returns its midpoint, Tc - 119 K.
   `saturatedVapour` (403.49 K) and `outletQuality 0.5` (400.63 K) are plausible; their accuracy against the
   dew point was not checked to the kelvin (the flat side of the target allows up to the 2 K scan step).
   The pure-component branch is unaffected, which is why the only corpus case using the spec
   (rankine02_water) never showed it.  Engine fix needed before the kernel lands.
2. **The kernel's two lookup URLs do not exist**: https://choupo.org/llm/components.txt and
   https://choupo.org/llm/unit-keys.md both redirect to www and return 404.  Section 6 says "a name that is
   not there makes the case refuse" -- the one check it prescribes cannot be made.  (Phase D not built.)
3. **"Case > Complete 0/" does not exist in the app on main** (no such string in gui/src).  It is C200 B',
   work in progress on a backup branch.  A student in the browser cannot complete 0/, and an incomplete 0/
   is refused, so the kernel cannot land before B' does.
4. **Twelve packs are named, three exist** (recycles+pressure, separations, reactors, on backup branches).
   Section 7 also says "each has its pack" for membranes, electrolytes, solids, ...  check_doc_references
   refuses a pointer to a missing file: either the nine are written or the table lists only what exists.
5. The menu label is *Open case .zip* (gui/src/ui/WelcomeScreen.tsx:203), not "Open Case from .zip...".
6. Section 8 promises balances "prints and writes" on every converged run; true in the log, but the app's
   run strip shows MASS "not published" on almost every case (gui/src/case/runSummary.ts:65 -- see the
   newcomer review, J2).  The first thing a student reads contradicts the brief.
7. The distillationColumn line "feedStage 2..N, 1..N-1 under the default model" does not say which range
   belongs to which model; rewrite as two explicit cases.
8. SOURCES cites docs/ai/unit-ops.md for "heater takes Q only" and for every unit key, while the pack
   specification says unit-ops.md is not authoritative; cite Heater.cpp:70-79 and each unit's C++.
9. Not taught and needed by the k2-style case: kij for SRK.  The run announces "kij = 0 for all 3 pairs";
   the kernel's EOS block gives no `binaryInteractions` example and no pack covers it in the list.

## Verdict
The grammar is right: an LLM holding only this file can write a recycle flowsheet, an EOS case and a column
that run and close their balances.  It must not land until (1) the phaseChanger saturated-liquid bug is
fixed, (2)-(4) its URLs, the Complete-0/ button and its packs exist (or it stops promising them).
