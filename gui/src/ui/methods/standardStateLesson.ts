/*---------------------------------------------------------------------------*\
  standard-state -- enthalpy, the standard state and equilibrium: what the
  degree sign really means (DEV.md 4c, C32, commissioned 2026-10-03).

  WHERE IT COMES FROM.  A long conversation Vítor had about thermodynamics,
  starting from the `reaction-enthalpy` page, in which formally correct
  answers kept introducing symbols before the physical need for them, and
  each answer made a new confusion.  The questions it has to answer, in his
  words rendered: does the degree sign mean 1 bar?  Does it also mean 25 °C?
  How can a standard property serve a process at 150 bar -- is that not
  assuming an ideal gas?  Why fix the pressure and leave the temperature a
  variable?  If h depends little on P, how little -- show the numbers.  Is
  the zero of enthalpy the same thing as the standard state?  Why is
  equilibrium a minimum of G?  Where does the 1/T² come from?

  THE ORDER IS THE PEDAGOGY, and it is the brief's: FIRST the physical
  behaviour (how much the enthalpy of real hydrogen moves with temperature
  against pressure, measured by the engine), THEN the reference curve and its
  correction, ONLY THEN the degree sign.  Three separate choices are kept
  apart throughout: the real (T, P) of the system; the standard state used
  as the thermodynamic reference; the convention that fixes the ZERO of the
  enthalpy values.  The usual symbols, every one glossed where it appears.

  THE NUMBERS are the ENGINE's, from the witness
  tutorials/props/thermo/standardState01_hydrogen_enthalpy_TP (42
  `propertyPoint` ops on SRK, golden-pinned), drawn on the page from a live
  run and never typed into it; the prose below quotes that golden, rounded,
  and the test holds the prose to the golden.  Beside them the page draws a
  REFERENCE equation of state fitted to measurements (Leachman et al. 2009,
  through CoolProp 8.0.0, re-computed by bin/curate/reference_h2_enthalpy.py
  into the witness's constant/experimental/), with the gap stated: SRK is
  not hydrogen's own equation, and the residual is where that shows.
\*---------------------------------------------------------------------------*/

import type { LessonStep, LessonLimit } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";
export type { LessonStep, LessonLimit };

export const STANDARD_STATE_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "How much does the enthalpy really change?",
    body: "Before any symbol, a measurement.  The chart draws the molar "
      + "enthalpy of real hydrogen priced by the engine's equation of state "
      + "(SRK), from 300 to 1000 K and from 1 to 1000 bar, every curve "
      + "shifted so that the value at 300 K and 1 bar is zero — the same "
      + "zero for all of them.  Put the temperature on the axis and the "
      + "curves for the five pressures lie almost on top of one another; "
      + "put the pressure on the axis and each isotherm climbs a little.  "
      + "Read two points: at 1 bar, heating from 300 to 1000 K raises the "
      + "enthalpy by 20.64 kJ/mol; at 300 K, compressing from 1 to 1000 bar "
      + "at CONSTANT temperature raises it by 1.29 kJ/mol (the reference "
      + "equation of state says 1.38); at 1000 K the same compression adds "
      + "1.69 (reference 1.73).  So in this range the enthalpy of hydrogen "
      + "moves far more with temperature than with pressure — but the "
      + "pressure contribution is not zero, and it is there without any "
      + "change of temperature.",
    formula: String.raw`\Delta h = h(T, P) - h(300\,\text{K},\, 1\,\text{bar})`,
    where: [
      { sym: "\\Delta h", means: "the quantity drawn: the enthalpy difference "
        + "between a state and the common zero", unit: "kJ/mol" },
      { sym: "h", means: "molar enthalpy of the pure gas (the total enthalpy of a "
        + "stream is this times its molar flow)", unit: "kJ/mol" },
      { sym: "T", means: "temperature of the state", unit: "K" },
      { sym: "P", means: "pressure of the state", unit: "bar" },
    ],
    note: "Two things this comparison is NOT.  It is not a compression: a "
      + "compressor heats the gas, and that temperature rise is another "
      + "problem — the chart compares two states at the SAME temperature.  And "
      + "no percentage of the enthalpy itself is quoted anywhere on this page, "
      + "because the enthalpy's value depends on where its zero was put (step "
      + "6); only differences between named states are compared.",
  },
  {
    n: 2,
    title: "A reference curve and a correction",
    body: "The identity below is trivial and is the whole idea.  If the "
      + "enthalpy is known along ONE pressure — a reference pressure — the "
      + "enthalpy at any other pressure is that curve plus the difference "
      + "between the two pressures at the same temperature.  To APPROXIMATE "
      + "is to drop that difference when it is small enough for the "
      + "calculation at hand (for hydrogen between 1 and 150 bar it is a "
      + "fraction of a kilojoule per mole against tens for the heating).  To "
      + "CORRECT is to compute it.  For an ideal gas the difference is "
      + "exactly zero and the enthalpy depends on temperature alone; for a "
      + "real gas it depends on both; for liquids and solids the pressure "
      + "effect is small in many applications, but it is not removed by "
      + "definition — it is a derivative with a value.",
    formula: String.raw`h(T, P) = h(T, P_{\mathrm{ref}}) + \left[\, h(T, P) - h(T, P_{\mathrm{ref}}) \,\right]`,
    where: [
      { sym: "P_{\\mathrm{ref}}", means: "the reference pressure along which the "
        + "enthalpy is known (1 bar on this page)", unit: "bar" },
      { sym: "v", means: "(derivation) molar volume", unit: "m³/mol" },
      { sym: "R", means: "(derivation) gas constant", unit: "kJ/(mol·K)" },
    ],
    derivation: [
      { step: "The pressure derivative at constant temperature is a property of "
          + "the equation of state alone — no change of temperature is involved:",
        eq: String.raw`\left(\frac{\partial h}{\partial P}\right)_T = v - T \left(\frac{\partial v}{\partial T}\right)_P` },
      { step: "For an ideal gas the molar volume is RT/P, so the second term is "
          + "T·(R/P) = v and the two cancel exactly: h depends on T alone.",
        eq: String.raw`v = \frac{R T}{P} \;\Rightarrow\; v - T\,\frac{R}{P} = 0` },
      { step: "For a real gas the cancellation is not exact.  Hydrogen above "
          + "about 200 K has a positive derivative (its molar volume grows faster "
          + "than RT/P), which is why every isotherm on the chart climbs with "
          + "pressure.  Integrating this derivative from the reference pressure to "
          + "P gives the bracket of the identity above." },
    ],
  },
  {
    n: 3,
    title: "So why does the degree sign appear?",
    body: "Now, and only now, the symbol.  The degree sign names a RULE OF "
      + "REFERENCE called the standard state.  The temperature is not part of "
      + "that rule and must be stated separately — so a standard enthalpy at "
      + "298.15 K, at 700 K and at 1000 K are three standard properties of the "
      + "same substance at three temperatures.  The standard pressure in "
      + "current use is 1 bar; some sources and some programs still use 1 atm, "
      + "and which one a table uses must be identified.  For a GAS the "
      + "standard state is the pure substance as an ideal gas at the standard "
      + "pressure — a hypothetical state, which asks nothing of how the real "
      + "gas at 1 bar behaves.  For a pure LIQUID or SOLID it is the pure "
      + "substance in the stated phase at the standard pressure.  (Solutions "
      + "have their own standard states; they are not on this page.)",
    formula: String.raw`h^\circ(298.15\,\text{K}), \quad h^\circ(700\,\text{K}), \quad h^\circ(1000\,\text{K})`,
    where: [
      { sym: "h^\\circ", means: "molar enthalpy in the STANDARD STATE: the pure "
        + "substance at the standard pressure, as an ideal gas if a gas, in its "
        + "stated phase otherwise — evaluated at the temperature written in the "
        + "argument", unit: "kJ/mol" },
    ],
    note: "The engine shows the two definitions apart.  The real gas at 1 bar "
      + "and the ideal gas at 1 bar differ, for hydrogen, by 0.5 J/mol at 300 K "
      + "and 1.5 J/mol at 733 K — a hair's breadth on this chart, and still not "
      + "the same definition: one is a state the gas can be in, the other is "
      + "the rule the tables are built on.",
  },
  {
    n: 4,
    title: "Why not fix the temperature too?",
    body: "We could choose 298.15 K as a reference point, and tables do: the "
      + "formation enthalpies are printed at 298.15 K because a table must be "
      + "printed at some temperature.  But the standard properties are needed "
      + "at every temperature a process runs at, so what the symbol names is a "
      + "FUNCTION of temperature, not a value.  There is no contradiction "
      + "between tabulating a value at 298.15 K, having a function defined at "
      + "every temperature, and using that function in a process at another "
      + "pressure with the correction of step 2.  The degree sign identifies "
      + "the standard; the argument says at what temperature it is evaluated.  "
      + "So when a table says \"standard formation enthalpy at 298.15 K\", "
      + "where does the temperature come from?  From the column header or "
      + "the explicit 298.15 K — the degree sign alone does not fix it.",
    formula: String.raw`\Delta_f H^\circ(298.15\,\text{K}) \;\text{is one value of the function}\; \Delta_f H^\circ(T)`,
    where: [
      { sym: "\\Delta_f H^\\circ", means: "standard enthalpy of formation: the "
        + "enthalpy of forming one mole of the substance from its elements, each "
        + "in its reference phase, all in their standard states at the temperature "
        + "stated", unit: "kJ/mol" },
    ],
    note: "A common standard pressure is what lets data from different sources "
      + "be compared and combined.  Another convention would serve, provided "
      + "every value and every expression were transformed consistently — "
      + "which is exactly what a table that silently mixes 1 atm and 1 bar "
      + "fails to do.",
  },
  {
    n: 5,
    title: "And if the process is at 150 bar?",
    body: "Three separate things, kept separate.  The REAL state: the "
      + "temperature, pressure and composition of the stream.  The STANDARD "
      + "property at the same temperature.  The MODEL's correction that takes "
      + "the standard property to the real one.  For the enthalpy of a gas "
      + "that is the sum below: the ideal-gas enthalpy, which depends on "
      + "temperature alone, plus the residual (departure) enthalpy, which the "
      + "equation of state computes at the real temperature and pressure.  "
      + "Using an ideal reference does NOT make the real fluid ideal: the "
      + "non-ideality enters through the correction.  The witness evaluates "
      + "hydrogen at the green-ammonia converter's state, 733.15 K and 150 "
      + "bar: the ideal-gas enthalpy has risen 12.73 kJ/mol since 298.15 K and "
      + "the residual adds 0.23 kJ/mol (reference 0.26) — 1.8 % of that rise.  "
      + "Switch the residual off on the panel and that is the error of "
      + "pretending the gas is ideal at 150 bar.",
    formula: String.raw`h(T, P) = h^{\mathrm{ig}}(T) + h^{\mathrm{R}}(T, P)`,
    where: [
      { sym: "h^{\\mathrm{ig}}", means: "ideal-gas molar enthalpy at T — the "
        + "standard-state enthalpy of a gas, a function of temperature alone", unit: "kJ/mol" },
      { sym: "h^{\\mathrm{R}}", means: "residual (departure) enthalpy: the real "
        + "fluid's enthalpy minus the ideal gas's at the same T and P, computed by "
        + "the equation of state", unit: "kJ/mol" },
    ],
    note: "Both terms must carry the SAME reference for the enthalpy, or the "
      + "sum is meaningless (step 6).  For a MIXTURE the residual depends on "
      + "composition as well as on T and P; a pure-component correction is not "
      + "carried over to a mixture by assumption.",
  },
  {
    n: 6,
    title: "The zero of enthalpy is another choice",
    body: "Only differences of enthalpy are measurable, so the value assigned "
      + "to any one state is a convention.  Move the zero with the slider on "
      + "the panel: every curve moves by the same constant and every "
      + "difference between the same two states is unchanged — the 20.64 and "
      + "the 1.29 of step 1 do not move.  Four things that share a letter and "
      + "must not be confused: the molar enthalpy of a state, which depends on "
      + "the zero; a difference between two states, which does not; the "
      + "standard enthalpy of a FORMATION reaction, which is a difference "
      + "between a compound and its elements; and the standard enthalpy of the "
      + "reaction AS WRITTEN, which is a difference between products and "
      + "reactants.  In a reacting system the zeros of the species must be "
      + "consistent with one another, and the derivation shows what "
      + "\"consistent\" means.",
    formula: String.raw`\Delta_r H^\circ = \sum_i \nu_i\, \Delta_f H_i^\circ`,
    where: [
      { sym: "\\Delta_r H^\\circ", means: "standard enthalpy of the reaction as "
        + "written, per mole of reaction", unit: "kJ/mol" },
      { sym: "\\nu_i", means: "stoichiometric coefficient of species i, negative "
        + "for a reactant, positive for a product", unit: "—" },
      { sym: "\\Delta_f H_i^\\circ", means: "standard enthalpy of formation of "
        + "species i", unit: "kJ/mol" },
      { sym: "c_i", means: "(derivation) a hypothetical shift of species i's enthalpy "
        + "zero", unit: "kJ/mol" },
      { sym: "c_e", means: "(derivation) a hypothetical shift of element e's enthalpy "
        + "zero", unit: "kJ/mol" },
      { sym: "n_{e,i}", means: "(derivation) number of atoms of element e in one "
        + "molecule of species i", unit: "—" },
    ],
    derivation: [
      { step: "Suppose each species' enthalpy zero were moved by its own constant.  "
          + "The reaction enthalpy would move by the stoichiometric sum of those "
          + "constants:",
        eq: String.raw`\Delta_r H^\circ \;\to\; \Delta_r H^\circ + \sum_i \nu_i\, c_i` },
      { step: "That sum vanishes only when the constants are built from a datum "
          + "the reaction conserves.  The ELEMENTS are such a datum: write each "
          + "species' constant as the sum of its atoms' constants, and the atom "
          + "balance of the reaction makes the stoichiometric sum zero for every "
          + "reaction at once.",
        eq: String.raw`c_i = \sum_e n_{e,i}\, c_e \;\Rightarrow\; \sum_i \nu_i\, c_i = \sum_e c_e \sum_i \nu_i\, n_{e,i} = 0` },
      { step: "This is why the formation convention exists: setting every element "
          + "in its reference phase to zero at 298.15 K is a choice of zeros that "
          + "no reaction can see.  Moving one species alone is not." },
    ],
  },
  {
    n: 7,
    title: "What Choupo does — and what any simulator's convention must declare",
    body: "Choupo prices every stream on the ELEMENTS datum, and the formula "
      + "below is the whole of it: the species' standard formation enthalpy at "
      + "298.15 K, plus the ideal-gas enthalpy rise from 298.15 K to the "
      + "stream's temperature, plus the equation of state's residual at the "
      + "stream's temperature and pressure.  In the source, the first two terms "
      + "are one function (`Component::h_pure_ig`, src/thermo/Component.cpp:1429, "
      + "\"ONE implementation of the standard-state enthalpy, not two\"), the "
      + "residual is added in `ThermoPackage::H_real` "
      + "(src/thermo/ThermoPackage.cpp:1200), and the `propertyPoint` operation "
      + "this page runs publishes the two halves and their sum "
      + "(src/propertyOps/PropertyPoint.cpp:79).  The elements' reference "
      + "phases are what the tables say they are — graphite for carbon, the "
      + "liquid for bromine — not all ideal gases.  A tabulated formation "
      + "enthalpy is therefore never, by itself, the enthalpy of a real "
      + "stream: it is the first of three terms.  Other programs carry the "
      + "same three terms under their own conventions, some at 1 atm; the "
      + "convention must be identified wherever data cross from one to "
      + "another, never swapped silently.",
    formula: String.raw`h_i(T, P) = \Delta_f H_i^\circ(298.15\,\text{K}) + \left[\, h_i^{\mathrm{ig}}(T) - h_i^{\mathrm{ig}}(298.15\,\text{K}) \,\right] + h_i^{\mathrm{R}}(T, P)`,
    where: [
      { sym: "h_i", means: "molar enthalpy of species i in the stream, on the "
        + "elements datum", unit: "kJ/mol" },
      { sym: "h_i^{\\mathrm{ig}}", means: "ideal-gas molar enthalpy of species i "
        + "(the bracket is its sensible rise from 298.15 K)", unit: "kJ/mol" },
      { sym: "h_i^{\\mathrm{R}}", means: "residual enthalpy of species i at the "
        + "stream's T and P", unit: "kJ/mol" },
    ],
    note: "Because every species is on the one datum, a reactor's energy "
      + "balance on these enthalpies needs no reaction enthalpy at all — the "
      + "heat of reaction is already inside the formation terms.  The "
      + "`reaction-enthalpy` page makes that point with the ammonia converter.",
  },
  {
    n: 8,
    title: "Can I use the reaction enthalpy at 25 °C?",
    body: "Yes, consistently.  A reactor balance can be organised two ways and "
      + "both are right when they include the same states and corrections: "
      + "take the standard reaction enthalpy at 298.15 K and account for the "
      + "sensible terms that bring reactants and products from 298.15 K to "
      + "their real temperatures; or evaluate the reaction enthalpy at the "
      + "reactor temperature by Kirchhoff's law and arrange the sensible terms "
      + "accordingly.  Using the 298.15 K value is not automatically an error; "
      + "using it AS IF it were the value at the reactor temperature is.  For "
      + "ammonia the engine prices −45.9 kJ per mole of NH₃ at 298.15 K and "
      + "−53.4 at 773 K (the `reaction-enthalpy` page), and a design that "
      + "takes the first for the second is 14 % short on the heat released — "
      + "but do not carry that percentage to the steam raised or to an "
      + "adiabatic temperature rise without closing those balances, which "
      + "carry other terms.",
    formula: String.raw`\frac{\mathrm{d}\,\Delta_r H^\circ}{\mathrm{d}T} = \Delta_r c_p^\circ, \qquad \Delta_r H^\circ(T) = \Delta_r H^\circ(T_0) + \int_{T_0}^{T} \Delta_r c_p^\circ\, \mathrm{d}T'`,
    where: [
      { sym: "\\Delta_r c_p^\\circ", means: "standard reaction heat capacity: the "
        + "stoichiometric sum of the species' standard heat capacities", unit: "kJ/(mol·K)" },
      { sym: "T_0", means: "the temperature at which the reaction enthalpy is known "
        + "(298.15 K for a table)", unit: "K" },
      { sym: "T'", means: "the integration variable, a temperature", unit: "K" },
    ],
    note: "The BASIS matters: \"per mole of reaction as written\" is not \"per "
      + "mole of product\".  N₂ + 3 H₂ → 2 NH₃ releases twice what the same "
      + "equation written per mole of NH₃ does, and multiplying a chemical "
      + "equation by a number multiplies its standard reaction enthalpy and "
      + "Gibbs energy by the same number.",
  },
  {
    n: 9,
    title: "Why equilibrium is a minimum of G (not G = 0)",
    body: "Four energies, one law.  The internal energy U is what the first law "
      + "conserves.  The enthalpy adds the pressure-volume term so that heat at "
      + "constant pressure is a difference of H.  The Helmholtz energy "
      + "subtracts T·S; the Gibbs energy does the same to H.  None of them is "
      + "minimised because \"nature minimises energy\".  The second law says "
      + "the entropy of a system AND its surroundings together never decreases "
      + "in a spontaneous process.  For a closed system held at a temperature "
      + "and a pressure imposed by reservoirs, with no work other than "
      + "expansion, that total entropy change is minus the system's Gibbs "
      + "energy change divided by the temperature — the derivation is four "
      + "lines.  So at fixed T and P a spontaneous change lowers G, and the "
      + "stable equilibrium is the MINIMUM of G compatible with the "
      + "constraints.  That minimum is some number; nothing says it is zero.",
    formula: String.raw`H = U + P V, \qquad A = U - T S, \qquad G = H - T S`,
    where: [
      { sym: "U", means: "internal energy", unit: "kJ/mol" },
      { sym: "H", means: "enthalpy (total, not molar, when the system is the whole "
        + "reactor)", unit: "kJ/mol" },
      { sym: "V", means: "volume", unit: "m³/mol" },
      { sym: "A", means: "Helmholtz energy", unit: "kJ/mol" },
      { sym: "S", means: "entropy", unit: "kJ/(mol·K)" },
      { sym: "G", means: "Gibbs energy", unit: "kJ/mol" },
      { sym: "\\Delta S_{\\mathrm{total}}", means: "(derivation) entropy change of system "
        + "and surroundings together", unit: "kJ/(mol·K)" },
      { sym: "\\Delta S", means: "(derivation) entropy change of the system", unit: "kJ/(mol·K)" },
      { sym: "\\Delta S_{\\mathrm{surr}}", means: "(derivation) entropy change of the "
        + "surroundings, a reservoir at T", unit: "kJ/(mol·K)" },
      { sym: "\\Delta H", means: "(derivation) enthalpy change of the system — the heat it "
        + "takes in at constant P with expansion work only", unit: "kJ/mol" },
      { sym: "\\Delta G", means: "(derivation) Gibbs energy change of the system", unit: "kJ/mol" },
    ],
    derivation: [
      { step: "Second law for system plus surroundings:",
        eq: String.raw`\Delta S_{\mathrm{total}} = \Delta S + \Delta S_{\mathrm{surr}} \ge 0` },
      { step: "The surroundings are a reservoir at T; the heat they receive is "
          + "minus the heat the system receives, and at constant pressure with "
          + "expansion work only that heat is the system's enthalpy change:",
        eq: String.raw`\Delta S_{\mathrm{surr}} = -\frac{\Delta H}{T}` },
      { step: "Substitute and multiply by −T (positive):",
        eq: String.raw`\Delta S_{\mathrm{total}} = \Delta S - \frac{\Delta H}{T} = -\frac{\Delta G}{T} \;\Rightarrow\; \Delta G \le 0` },
      { step: "Equality is equilibrium: no further change at fixed T and P can "
          + "lower G.  G itself is whatever the datum makes it; what is zero is "
          + "its CHANGE along any admissible displacement." },
    ],
  },
  {
    n: 10,
    title: "Where the 1/T² comes from: three relations, kept apart",
    body: "Three derivatives with respect to temperature, three different "
      + "subjects.  Kirchhoff (step 8) says how the standard reaction ENTHALPY "
      + "changes with temperature.  Gibbs–Helmholtz says how the standard "
      + "reaction Gibbs energy DIVIDED BY T changes — and that derivative is "
      + "the reaction enthalpy over T squared.  Van 't Hoff says how the "
      + "thermodynamic EQUILIBRIUM CONSTANT changes, and it is Gibbs–Helmholtz "
      + "read through the definition of K: the 1/T² is the same one.  K here "
      + "is dimensionless, defined through activities; for a real gas the "
      + "activity is the fugacity over the standard pressure, so a K computed "
      + "from STANDARD properties does not oblige anyone to treat the real "
      + "mixture as ideal — the fugacity coefficients carry the non-ideality, "
      + "exactly as the residual enthalpy did in step 5.",
    formula: String.raw`\frac{\mathrm{d}\,\Delta_r H^\circ}{\mathrm{d}T} = \Delta_r c_p^\circ, \qquad \frac{\mathrm{d}}{\mathrm{d}T}\!\left(\frac{\Delta_r G^\circ}{T}\right) = -\frac{\Delta_r H^\circ}{T^2}, \qquad \frac{\mathrm{d} \ln K}{\mathrm{d}T} = \frac{\Delta_r H^\circ}{R\,T^2}`,
    where: [
      { sym: "\\Delta_r G^\\circ", means: "standard Gibbs energy of the reaction as "
        + "written", unit: "kJ/mol" },
      { sym: "K", means: "thermodynamic equilibrium constant, a product of activities "
        + "raised to the stoichiometric coefficients", unit: "—" },
      { sym: "R", means: "gas constant", unit: "kJ/(mol·K)" },
      { sym: "\\Delta_r G", means: "(derivation) Gibbs energy of reaction at the "
        + "actual composition", unit: "kJ/mol" },
      { sym: "Q", means: "(derivation) reaction quotient: the activity product at the "
        + "actual composition", unit: "—" },
      { sym: "a_i", means: "(derivation) activity of species i", unit: "—" },
      { sym: "f_i", means: "(derivation) fugacity of species i in the mixture", unit: "bar" },
      { sym: "p^\\circ", means: "(derivation) the standard pressure, 1 bar", unit: "bar" },
      { sym: "\\varphi_i", means: "(derivation) fugacity coefficient of species i, "
        + "from the equation of state", unit: "—" },
      { sym: "y_i", means: "(derivation) mole fraction of species i in the gas", unit: "—" },
    ],
    derivation: [
      { step: "The equilibrium constant is defined from the standard Gibbs energy "
          + "of reaction:",
        eq: String.raw`\Delta_r G^\circ = -R T \ln K \;\Rightarrow\; \ln K = -\frac{1}{R}\,\frac{\Delta_r G^\circ}{T}` },
      { step: "Differentiate with respect to T and use Gibbs–Helmholtz for the "
          + "right-hand side — van 't Hoff is one substitution away:",
        eq: String.raw`\frac{\mathrm{d} \ln K}{\mathrm{d}T} = -\frac{1}{R}\,\frac{\mathrm{d}}{\mathrm{d}T}\!\left(\frac{\Delta_r G^\circ}{T}\right) = \frac{\Delta_r H^\circ}{R\,T^2}` },
      { step: "Away from equilibrium the reaction Gibbs energy is the standard one "
          + "plus RT times the logarithm of the reaction quotient; at equilibrium "
          + "it is zero and the quotient equals K:",
        eq: String.raw`\Delta_r G = \Delta_r G^\circ + R T \ln Q, \qquad Q = \prod_i a_i^{\nu_i}` },
      { step: "For a gas the activity is the fugacity over the standard pressure, "
          + "and the fugacity is the partial pressure times the fugacity "
          + "coefficient the equation of state computes:",
        eq: String.raw`a_i = \frac{f_i}{p^\circ} = \frac{\varphi_i\, y_i\, P}{p^\circ}` },
    ],
  },
];

export const STANDARD_STATE_QUIZ: readonly QuizQuestion[] = [
  {
    id: "h0-at-700",
    q: "Can a standard enthalpy be evaluated at 700 K?",
    options: ["Yes", "No"], correct: 0,
    feedback: "The degree sign fixes the standard state — the standard pressure "
      + "and the reference phase — and says nothing about temperature.  A "
      + "standard property is a function of temperature; the table's 298.15 K "
      + "is one value of it (steps 3 and 4).",
  },
  {
    id: "standard-at-150bar",
    q: "Does using a standard property in a calculation at 150 bar oblige you "
      + "to assume an ideal gas?",
    options: ["Yes", "No"], correct: 1,
    feedback: "The standard property is the reference; the equation of state "
      + "adds the residual at the real temperature and pressure.  Dropping the "
      + "residual is the approximation — and for hydrogen at the converter it "
      + "is 0.23 kJ/mol against a 12.7 kJ/mol sensible rise (step 5).",
  },
  {
    id: "pressure-affects-h",
    q: "At constant temperature, does pressure leave the enthalpy of a real gas "
      + "unchanged?",
    options: ["Yes", "No — it can change it"], correct: 1,
    feedback: "The isothermal derivative of h with respect to P is v − T(∂v/∂T) "
      + "at constant P, zero only for an ideal gas.  For hydrogen from 1 to "
      + "1000 bar at 300 K the engine prices +1.29 kJ/mol, the reference "
      + "equation +1.38 (steps 1 and 2).",
  },
  {
    id: "zero-shift",
    q: "Does moving the zero of the enthalpy change the energy needed to take "
      + "a gas from one state to another?",
    options: ["Yes", "No"], correct: 1,
    feedback: "Every value moves by the same constant, so every difference "
      + "between two states is unchanged — the panel's slider shows it (step "
      + "6).  What a shift CAN corrupt is a reaction enthalpy, if the species' "
      + "zeros are moved inconsistently.",
  },
  {
    id: "g-zero",
    q: "At equilibrium, is G equal to zero?",
    options: ["Yes", "No"], correct: 1,
    feedback: "At fixed T and P the stable equilibrium is the MINIMUM of G "
      + "compatible with the constraints.  Its value is whatever the datum "
      + "makes it; what vanishes is the CHANGE of G along any admissible "
      + "displacement — ΔrG = 0, not G = 0 (steps 9 and 10).",
  },
  {
    id: "298-in-700-balance",
    q: "Is using the standard reaction enthalpy at 298.15 K in a balance on a "
      + "reactor at 700 K necessarily wrong?",
    options: ["Yes", "No"], correct: 1,
    feedback: "Not if the sensible terms that take reactants and products from "
      + "298.15 K to their real temperatures are included: that route and the "
      + "Kirchhoff route give the same answer.  What is wrong is taking the "
      + "298.15 K value AS the value at 700 K (step 8).",
  },
];

export const STANDARD_STATE_LIMITS: readonly LessonLimit[] = [
  {
    id: "one-substance-one-phase",
    title: "One pure gas, one phase",
    body: "Every number on this page is hydrogen's, in the gas phase.  A "
      + "mixture's residual depends on composition and a liquid's pressure "
      + "dependence has a different size; neither is drawn here, and the "
      + "standard states of solutions are not discussed.",
  },
  {
    id: "srk-is-a-model",
    title: "SRK is a model of hydrogen, not hydrogen",
    body: "The ideal-gas part the engine prices agrees with the reference "
      + "equation of state to a few joules per mole across the whole range; the "
      + "RESIDUAL does not — SRK is 6 % below the reference at 300 K and 1000 "
      + "bar, a third below at 300 K and 100 bar, and 11 % below at the "
      + "converter's state.  The page draws both and states the gap rather than "
      + "tuning anything.  Measured before SRK was chosen: Peng-Robinson is "
      + "worse here and gets the sign of the 100 bar residual wrong at 300 K.",
  },
  {
    id: "reference-is-an-implementation",
    title: "The reference is CoolProp's implementation of Leachman 2009",
    body: "The reference values were re-computed here with CoolProp 8.0.0 "
      + "(bin/curate/reference_h2_enthalpy.py), not read back from the paper's "
      + "own tables, and they sit on CoolProp's default reference state for "
      + "hydrogen — which is why the page shifts both sets to a common zero "
      + "before drawing them and compares only differences.",
  },
  {
    id: "no-study",
    title: "No measured study of this confusion",
    body: "The page answers the questions one engineer asked in one long "
      + "conversation.  Whether they are the questions most students ask is "
      + "not measured by anything here.",
  },
];
