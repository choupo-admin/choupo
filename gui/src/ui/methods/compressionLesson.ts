/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  The "Compressing a gas" lesson, as DATA (DEV.md 4c C442, Vitor 2026-11-19:
  "Parece que os EduTools precisam de um em compressores?").  Prose is the part
  of a tool that rots with nothing failing, so every number the steps print is
  held by tests/compression.test.ts against the engine's own run of the two
  witnesses: compressor03_staged_design (air, 1 -> 12 bar) and the make-up
  compressor of ammonia02_full_plant (hydrogen and nitrogen, 25 -> 245 bar).

  WHAT THE PAGE MAY CLAIM is what the engine's staged design computes
  (src/postProcessing/sizing/CompressorDesign.cpp, DEV.md 4c C440): the
  polytropic head of Brown (2005) Eq 2.73 with the mean compressibility of
  Eq 2.68, the exponent from the package's own isentropic path (Eq 2.76), the
  discharge temperature of Eq 5.16, equal ratios per section with the cooler
  drops of p.200, the shaft power of Eq 2.78 plus a mechanical loss.  What it
  does NOT compute is named in COMPRESSION_LIMITS and not implied: surge,
  speed, frames, the intercoolers as exchangers, condensation between stages.

  EVERY FORMULA is cited at its page in Brown, R. N. (2005), Compressors:
  Selection and Sizing, 3rd ed., Gulf Professional.  The library PDF's page is
  the printed page plus 21.
\*---------------------------------------------------------------------------*/

import type { LessonStep, SymbolGloss } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";
export type { LessonStep, SymbolGloss };

export const COMPRESSION_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "What compressing costs: the head, and why it grows with the inlet temperature",
    body: "A compressor raises a gas from \\(P_1\\) to \\(P_2\\), and the work it needs per "
      + "kilogram is the head.  For a real machine the useful form is the polytropic head: "
      + "the work of a path with a constant efficiency along it, which is how the machine "
      + "is actually graded (Brown 2005, Eq 2.73, p.37); the shaft power divides the head by "
      + "the efficiency and adds the mechanical loss (Eq 2.78, p.40; 1 % of the gas power for a "
      + "centrifugal estimate, p.199).  Two things in it matter before "
      + "any design: the work is proportional to the inlet temperature \\(T_1\\) (a hot gas "
      + "is a more expensive gas to compress, which is the whole reason for cooling it "
      + "between stages), and it grows with the pressure ratio only as \\(r^{(n-1)/n}\\), "
      + "not as \\(r\\).  The engine evaluates exactly this at "
      + "src/postProcessing/sizing/CompressorDesign.cpp:223, the shaft power at "
      + "src/postProcessing/sizing/CompressorDesign.cpp:225, and the specific gas constant "
      + "from R = 8314.462618 J/(kmol K) (src/postProcessing/sizing/CompressorDesign.cpp:35).  "
      + "Worked on the witness (air, 455 kmol/h, 1 bar and 25 degC, one section of "
      + "ratio 2.3568, \\(n\\) = 1.6090244 as printed on the sheet, \\(Z\\) = 1): "
      + "the discharge is 412.44 K, the head 87036 J/kg and the shaft power 427.31 kW, "
      + "which is what the engine prints for its first section.  Recompute it with the "
      + "formula below; the page's own function does, and a test holds it to the sheet.",
    formula: String.raw`H_\mathrm{p} = Z\,R_s\,T_1\,\frac{n}{n-1}\left(r^{(n-1)/n}-1\right),\qquad
R_s=\frac{R_\mathrm{u}}{M},\qquad
W_\mathrm{shaft}=\frac{\dot m\,H_\mathrm{p}}{\eta_p}\,(1+f_\mathrm{m})`,
    where: [
      { sym: "H_\\mathrm{p}", means: "The polytropic head: the work the gas receives per kilogram "
        + "along a path of constant polytropic efficiency (Brown Eq 2.73).  It is what the "
        + "sheet prints as stageN_head.", unit: "J/kg" },
      { sym: "Z", means: "The compressibility factor, how far the gas is from ideal: pv = Z R_s T.  "
        + "The head uses its mean over the stage, the average of the inlet and discharge values "
        + "(Brown Eq 2.68); the sheet prints it as stageN_Zavg.  For air at these pressures it "
        + "is 1." },
      { sym: "R_s", means: "The specific gas constant of this gas: the universal constant divided by "
        + "its molar mass.", unit: "J/(kg K)" },
      { sym: "R_\\mathrm{u}", means: "The universal gas constant, 8314.462618 J/(kmol K) in the "
        + "engine.", unit: "J/(kmol K)" },
      { sym: "M", means: "The molar mass of the gas mixture (28.845 kg/kmol for the air of the "
        + "witness).", unit: "kg/kmol" },
      { sym: "T_1", means: "The absolute temperature at the section's inlet.", unit: "K" },
      { sym: "n", means: "The polytropic exponent of the path, p v^n = constant.  The engine "
        + "does not guess it: it follows from the package's own isentropic path and the "
        + "efficiency (step 2), and is printed as stageN_n." },
      { sym: "r", means: "The pressure ratio of the section, outlet over inlet absolute "
        + "pressure." },
      { sym: "\\dot m", means: "The mass flow of gas through the machine (3.6457 kg/s here).",
        unit: "kg/s" },
      { sym: "\\eta_p", means: "The polytropic efficiency of the section: the fraction of the "
        + "shaft work that ends up as head.  It is declared or taken from the book "
        + "(Brown p.196 starts a centrifugal estimate at 0.75).  Step 2 says how it differs "
        + "from the isentropic efficiency." },
      { sym: "f_\\mathrm{m}", means: "The mechanical loss of bearings and seals, taken as a "
        + "fraction of the gas power (1 % for a centrifugal estimate, Brown p.199).  The sheet "
        + "shows it as powerShaft over powerGas, minus one." },
      { sym: "W_\\mathrm{shaft}", means: "The power at the compressor shaft, "
        + "gas power plus the mechanical loss (Brown Eq 2.78, p.40).", unit: "W" },
    ],
    note: "The head is a property of the gas and the path, not of the machine: it is the same "
      + "87036 J/kg whatever the impellers look like.  What the machine adds is the efficiency "
      + "and the number of impellers it needs to deliver that head, which the sheet counts "
      + "(three per section here) and this page does not teach.",
  },
  {
    n: 2,
    title: "Isentropic and polytropic efficiency: two ways to grade one stage",
    body: "The same number, 0.75, means two different things.  The isentropic efficiency "
      + "compares the work with the work of the ideal reversible-adiabatic line between the "
      + "same two pressures; the polytropic efficiency is the efficiency of every infinitesimal "
      + "slice of the compression, held constant along the path.  They are tied together by "
      + "the pressure ratio.  Derive it: the isentropic head follows Brown Eq 2.70 with the "
      + "exponent \\(a\\) of the isentropic line, the polytropic head follows Eq 2.73 with "
      + "\\(n/(n-1)=\\eta_p/a\\) (Eq 2.71), and the isentropic efficiency is the first over "
      + "the actual work, the second divided by \\(\\eta_p\\).  At the engine's section ratio "
      + "2.3568 a polytropic efficiency of 0.75 is an isentropic efficiency of 0.719; at the "
      + "overall ratio 12 the same 0.75 is only 0.656, because the work of the first slices "
      + "heats the gas and every later slice is compressed hotter.  That is why the staged "
      + "design uses the polytropic efficiency (it does not change with the number of "
      + "sections) while the flowsheet unit, a single adiabatic pass declared at an "
      + "isentropic 0.75 over ratio 12, takes 1504.3 kW, less than the 1740.5 kW of one "
      + "section at a polytropic 0.75 over the same ratio.  The sheet says so in its own "
      + "notes: the two powers are not expected to agree.  The exponent \\(a\\) itself is "
      + "read from the package: src/postProcessing/sizing/CompressorDesign.cpp:207 prices the "
      + "isentropic discharge temperature at constant entropy and takes its logarithm "
      + "(Brown Eq 2.76, p.38), and src/postProcessing/sizing/CompressorDesign.cpp:216 forms "
      + "the isentropic efficiency of the section from it.",
    derivation: [
      { step: "The isentropic head, with the path exponent a = (k-1)/k of the reversible "
          + "adiabatic line (Brown Eq 2.70, p.36).",
        eq: String.raw`H_\mathrm{a} = Z\,R_s\,T_1\,\frac{1}{a}\left(r^{a}-1\right)` },
      { step: "The polytropic head: the same expression on the path of exponent n, and the "
          + "exponent tied to the efficiency by Brown Eq 2.71, (n-1)/n = a/\\(\\eta_p\\) "
          + "(p.36).",
        eq: String.raw`H_\mathrm{p} = Z\,R_s\,T_1\,\frac{\eta_p}{a}\left(r^{a/\eta_p}-1\right)` },
      { step: "The work actually spent per kilogram is the polytropic head over \\(\\eta_p\\); "
          + "the isentropic efficiency is the ideal work over it.",
        eq: String.raw`\eta_a = \frac{H_\mathrm{a}}{H_\mathrm{p}/\eta_p} = \frac{r^{a}-1}{r^{a/\eta_p}-1}` },
    ],
    formula: String.raw`\eta_a = \frac{r^{a}-1}{r^{a/\eta_p}-1},\qquad
a=\frac{k-1}{k}=\frac{\ln\left(T_{2s}/T_1\right)}{\ln r}`,
    where: [
      { sym: "H_\\mathrm{a}", means: "The isentropic head: the work per kilogram of the "
        + "reversible adiabatic line between the two pressures (Brown Eq 2.70).", unit: "J/kg" },
      { sym: "\\eta_a", means: "The isentropic (adiabatic) efficiency of the section: the work of "
        + "the reversible adiabatic line over the work actually spent." },
      { sym: "a", means: "The exponent of the isentropic line between the two pressures, "
        + "(k-1)/k for a gas of constant specific-heat ratio k.  For a real gas Brown "
        + "Eq 2.76 fixes it from the isentropic discharge temperature, which is how the "
        + "engine reads it from the package, so a is not (k-1)/k of a handbook but of the "
        + "gas's own entropy surface." },
      { sym: "k", means: "The ratio of the gas's specific heats at constant pressure and "
        + "volume; it is only a name for the exponent here, and for a real gas it is not "
        + "constant along the path (Brown p.37)." },
      { sym: "T_{2s}", means: "The temperature the gas would have at the discharge pressure "
        + "if the compression were isentropic, found by the package at constant entropy.",
        unit: "K" },
    ],
    note: "At a pressure ratio close to 1 the two efficiencies coincide; they separate as the "
      + "ratio grows.  A datasheet that says only 'efficiency 0.75' without saying which one "
      + "has said nothing about the machine.",
  },
  {
    n: 3,
    title: "The discharge temperature, and why it limits one stage",
    body: "The gas leaves a section at \\(T_2 = T_1\\,r^{(n-1)/n}\\) (Brown Eq 5.16, p.196; "
      + "src/postProcessing/sizing/CompressorDesign.cpp:218), and nothing in the "
      + "compression removes that heat.  Brown calls out the temperature a centrifugal "
      + "estimate should not exceed when nothing else limits it, 475 degF, about 519 K, "
      + "and in the same sentence calls the limit arbitrary: machines are built above it "
      + "(p.196-197).  The limit is a design decision, not a law, and the witness declares "
      + "its own, 450 K, in system/postDict.  Invert Eq 5.16 and the limit becomes a "
      + "ceiling on the pressure ratio of one section.  With the exponent of the witness "
      + "and air at 25 degC the ceiling is 2.967: a single section to ratio 12 would "
      + "discharge at 763.7 K on this page's polytropic 0.75 (the flowsheet's own single "
      + "adiabatic pass, at an isentropic 0.75, prints 694.78 K), far over 450 K, and two "
      + "sections of ratio 3.5 each still reach 480.8 K.  The fewest sections whose "
      + "hottest discharge is within the limit is the smallest N with "
      + "\\(R^{1/N} \\le r_\\mathrm{max}\\): three.  The engine reaches the same answer "
      + "by trying section counts upward (stagesBy limit on the sheet, 412.44 K on every "
      + "section); the interactive panel below does it with your numbers.",
    formula: String.raw`T_2 = T_1\,r^{(n-1)/n}
\;\Rightarrow\;
r_\mathrm{max}=\left(\frac{T_\mathrm{lim}}{T_1}\right)^{n/(n-1)},
\qquad N_\mathrm{min}=\left\lceil\frac{\ln R}{\ln r_\mathrm{max}}\right\rceil`,
    where: [
      { sym: "T_2", means: "The discharge temperature of the section, before any cooling.",
        unit: "K" },
      { sym: "r_\\mathrm{max}", means: "The largest pressure ratio one section may have "
        + "before its discharge passes the limit.  The sheet prints the section ratio it "
        + "chose, stageN_ratio, which must not exceed it." },
      { sym: "T_\\mathrm{lim}", means: "The limit on the hot gas after a section: declared "
        + "by the case (450 K in the witness, maxDischargeT) or taken from the book "
        + "(475 degF, 519.26 K).", unit: "K" },
      { sym: "R", means: "The overall pressure ratio of the whole machine, the discharge "
        + "pressure over the suction pressure (12 in the witness)." },
      { sym: "N_\\mathrm{min}", means: "The fewest sections that keep every discharge within "
        + "the limit; the brackets round up to the next whole number." },
    ],
    note: "The temperature limit is the reason you meet intercoolers, but not the only one: "
      + "the same cooling also cuts the work (steps 4 and 5).  A hotter limit buys fewer "
      + "sections and a more expensive gas to compress.  What the page does not know is what "
      + "limits a given machine in the field (seals, lubricant, rotor materials, a "
      + "polymerising or cracking gas): that is the declared number, and the sheet repeats it "
      + "as T_dischargeLimit.",
  },
  {
    n: 4,
    title: "Staging with intercooling: why the ratios come out equal",
    body: "Split the compression into N sections and cool the gas back to the suction "
      + "temperature between them.  If the gas returns to \\(T_1\\) each time and the "
      + "exponent is the same, the total work is the sum of the sections' work, and the "
      + "question is how to share the overall ratio among them.  The answer is the "
      + "symmetric one: equal ratios, each \\(R^{1/N}\\) (Brown Eq 3.17, p.65; the book "
      + "derives it for two sections as Eq 3.14, \\(P_i=\\sqrt{P_1P_2}\\), p.64).  Here it is "
      + "from first principles for any N and any exponent.  The engine does this in "
      + "src/postProcessing/sizing/CompressorDesign.cpp:246, "
      + "and adds the pressure the intercoolers lose: 2 % of the pressure at the cooler's "
      + "entrance, never less than 2 psi (Brown p.200), which is why its section ratio "
      + "2.3568 is a little above \\(12^{1/3}=2.2894\\).",
    derivation: [
      { step: "Each section starts at \\(T_1\\), so the work of section i is proportional "
          + "to \\(r_i^{m}-1\\), with \\(m=(n-1)/n\\) and everything else common to all "
          + "sections.  The total, in the units of that common factor c:",
        eq: String.raw`W = c\sum_{i=1}^{N}\left(r_i^{\,m}-1\right)` },
      { step: "The ratios must multiply to the overall ratio, and that is the only "
          + "constraint: minimise W with the Lagrange multiplier \\(\\lambda\\) on the "
          + "logarithm of the constraint.",
        eq: String.raw`J=\sum_i r_i^{\,m}-\lambda\left(\sum_i\ln r_i-\ln R\right)` },
      { step: "Set the derivative with respect to each ratio to zero.  Every section then "
          + "obeys the same equation, so the sections are all equal.",
        eq: String.raw`\frac{\partial J}{\partial r_i}=m\,r_i^{\,m-1}-\frac{\lambda}{r_i}=0
\;\Rightarrow\; r_i^{\,m}=\frac{\lambda}{m}\ \text{for every }i
\;\Rightarrow\; r_i=R^{1/N}` },
      { step: "It is a minimum, not a saddle: in the variables \\(u_i=\\ln r_i\\) the work is "
          + "a sum of \\(e^{m u_i}\\), a convex function, over a plane \\(\\sum u_i=\\ln R\\).  "
          + "Substitute the equal ratios:",
        eq: String.raw`W_N = c\,N\left(R^{m/N}-1\right)` },
    ],
    formula: String.raw`r_i=R^{1/N}\ \text{for every section},\qquad W_N=c\,N\left(R^{m/N}-1\right),\qquad
c=\frac{\dot m\,Z\,R_s\,T_1\,(1+f_\mathrm{m})}{m\,\eta_p},\quad m=\frac{n-1}{n}`,
    where: [
      { sym: "r_i", means: "The pressure ratio of section i." },
      { sym: "i", means: "The index of a section, counted from the suction: 1 to N." },
      { sym: "N", means: "The number of sections (compressor bodies, or groups of impellers "
        + "between two coolers).  The engine prints it as nStages." },
      { sym: "m", means: "The exponent (n-1)/n of the path: the constant that turns a pressure "
        + "ratio into a temperature ratio (step 3) and a work (step 1)." },
      { sym: "\\lambda", means: "The Lagrange multiplier of the constraint that the ratios "
        + "multiply to R; it is eliminated by the equations and never needed as a number." },
      { sym: "J", means: "The function to minimise, the work plus the constraint "
        + "weighted by lambda." },
      { sym: "W", means: "The total shaft work of all sections, written as c times "
        + "the sum of \\(r_i^m-1\\).", unit: "W" },
      { sym: "W_N", means: "The total work for N equal sections.", unit: "W" },
      { sym: "c", means: "The common factor: the mass flow, the gas constant, the inlet "
        + "temperature and the losses of step 1, over the exponent m and the efficiency.  "
        + "It does not depend on how the ratio is split, which is what makes the "
        + "result so simple.", unit: "W" },
      { sym: "u_i", means: "The logarithm of the section ratio, \\(\\ln r_i\\): the variable "
        + "in which the constraint is a straight line." },
    ],
    note: "Equal ratios minimise the work of an ideal gas cooled to the same \\(T_1\\) each "
      + "time and compressed with the same exponent.  Real designs depart from it on "
      + "purpose: a limit on one section's discharge, machines with fixed frame sizes, a "
      + "gas that condenses in the cooler, or a cooling water that cannot return the gas "
      + "to \\(T_1\\).  The engine takes equal ratios as the starting design and reports "
      + "the unequal reality only as the cooler pressure drops.",
  },
  {
    n: 5,
    title: "What staging saves, and what it costs",
    body: "Put numbers on step 4 for the witness: air, ratio 12, polytropic 0.75, every "
      + "section cooled back to 298.15 K.  The formula below is the drop-free ideal of "
      + "step 4 (no pressure lost in the coolers): with \\(m\\) = 0.3785 and \\(c\\) = 1114.8 kW "
      + "one section takes 1740.5 kW and two take 1338.6 kW, three 1231.4 kW, four 1182.0 kW.  "
      + "So the first intercooler saves 23 % of the work, the second a further 8 % of what "
      + "is left, the third 4 %; the saving has a limit, "
      + "\\(m\\ln R\\) in units of c, which is the work of an infinite number of "
      + "infinitesimal sections cooled continuously (isothermal-like), 60 % of one "
      + "section's.  The engine's design does not match that ideal exactly, because every "
      + "intercooler loses pressure (0.1379 bar each, the 2 psi floor of Brown p.200) and "
      + "the next section must recover it: with those drops the same witness takes "
      + "1365.6 kW in two sections (480.8 K), 1281.9 kW in three (412.4 K) and 1255.6 kW in "
      + "four (382.1 K), which saves a fifth, 6 % and 2 % at each step, and four sections "
      + "already sit at 72 % of one.  The engine's three-section "
      + "design takes 1281.9 kW, the page's total at N = 3 with the drops, as the test below holds.  "
      + "Staging is not free: the engine lists two intercoolers of 423.77 kW each, which "
      + "the cooling water and the exchanger area must supply, and each costs "
      + "its pressure drop, a second casing, "
      + "the piping between them.  Below, move the number of sections and the "
      + "temperature to which the intercoolers return the gas, and read the total power, "
      + "the hottest discharge against the limit, and the work saved against one section "
      + "(the tool includes the drops, so it reads like the second set of numbers).",
    formula: String.raw`\frac{W_N}{W_1}=\frac{N\left(R^{m/N}-1\right)}{R^{m}-1},\qquad
\lim_{N\to\infty}\frac{W_N}{W_1}=\frac{m\ln R}{R^{m}-1}`,
    where: [
      { sym: "W_1", means: "The work of one section over the whole ratio, c times "
        + "\\(R^m-1\\).", unit: "W" },
    ],
    note: "The formula is the drop-free ideal; the page's total and the engine's include the "
      + "cooler pressure drops, so they sit a few percent above it for N > 1.  "
      + "The intercooler temperature enters as \\(T_1\\) of every section after the first: "
      + "a warmer return gas raises c and the later discharges with it.  The page keeps "
      + "the exponent of the engine's first section for every section and for every N, "
      + "which is exact at the engine's own choice and a constant-exponent estimate "
      + "elsewhere; the engine would re-price each section on the package.",
  },
  {
    n: 6,
    title: "The real gas: the compressibility and the exponent from the package",
    body: "The air of the witness is an ideal gas to four digits, so \\(Z=1\\) and the "
      + "steps above are the whole story.  The make-up gas of the reference ammonia plant "
      + "(hydrogen and nitrogen, 25 bar to 245 bar in two sections, "
      + "ammonia02_full_plant, unit makeupComp) is not.  Brown's real-gas rule is the one "
      + "the engine uses: average the compressibility between the inlet and the discharge, "
      + "taking the discharge temperature from the polytropic equation "
      + "(Eq 2.68 and p.196; src/postProcessing/sizing/CompressorDesign.cpp:221), and read "
      + "the exponent from the gas's own isentropic path rather than from a handbook "
      + "(Eq 2.76, p.38).  Because the head is linear in Z, the real gas needs "
      + "\\(Z_\\mathrm{avg}\\) times the ideal-gas head at the same exponent: 2.3 % more in "
      + "the first section (Z = 1.0231, head 418687 J/kg, power 11063 kW, discharge 466.95 K) "
      + "and 7.5 % more in the second (Z = 1.0750, head 440292 J/kg, power 11634 kW, "
      + "discharge 467.66 K).  The effective exponent is the package's: a = 0.2881 and "
      + "0.2891, an equivalent k of 1.405 and 1.407, close to the 1.4 of a handbook for "
      + "a diatomic gas and not equal to it.  The sheet also prints the engine's own check "
      + "of the arithmetic, stageN_dhCheck: the polytropic gas power against the package's "
      + "enthalpy rise for the same section, -0.04 % and +0.66 % here.  When the "
      + "first section's closure is worse than 5 % the run prints a warning line to its "
      + "text output (only the first section is tested, and the warning is not an advisory "
      + "of the result).",
    formula: String.raw`\frac{H_\mathrm{p}^\mathrm{real}}{H_\mathrm{p}^{Z=1}}=Z_\mathrm{avg}=\frac{Z_1+Z_2}{2},
\qquad a=\frac{\ln\left(T_{2s}/T_1\right)}{\ln r},\qquad
k_\mathrm{eff}=\frac{1}{1-a}`,
    where: [
      { sym: "H_\\mathrm{p}^\\mathrm{real}", means: "The polytropic head with the real-gas "
        + "compressibility.", unit: "J/kg" },
      { sym: "H_\\mathrm{p}^{Z=1}", means: "The same head with the compressibility set to 1: "
        + "what an ideal-gas page would compute at the same exponent.", unit: "J/kg" },
      { sym: "Z_\\mathrm{avg}", means: "The mean compressibility over the section, printed as "
        + "stageN_Zavg." },
      { sym: "Z_1", means: "The compressibility of the gas at the section's inlet state." },
      { sym: "Z_2", means: "The compressibility at the discharge state, evaluated at the "
        + "polytropic discharge temperature of step 3." },
      { sym: "k_\\mathrm{eff}", means: "The ratio of specific heats that a constant-k "
        + "treatment would need to give the same exponent, 1/(1-a); it is printed only as "
        + "a comparison with a handbook value." },
    ],
    note: "Z and the exponent come from the case's package and so are as good as its equation "
      + "of state; near the critical point or for a gas the package does not describe, they "
      + "are not.  The sheet notes that no condensation between sections is tested: a "
      + "gas that condenses in an intercooler would need a flash at each cooler, which this "
      + "design does not do.",
  },
];

export const COMPRESSION_LIMITS: readonly { id: string; title: string; body: string }[] = [
  {
    id: "not-a-selection",
    title: "A machine's size, not a machine's selection.",
    body: "The design reads the application chart of Brown Fig 1-2 for the machine type and "
      + "counts impellers from a head per impeller.  There is no frame, speed, casing "
      + "or vendor curve, no surge or stonewall margin, and no standard motor size: the "
      + "driver is 110 % of the greatest power (Brown p.307).  Do not select a compressor "
      + "from this page.",
  },
  {
    id: "constant-exponent-away-from-the-engine",
    title: "Away from the engine's own choice the page holds one exponent.",
    body: "The panel keeps the exponent of the engine's first section for every section "
      + "and every number of sections.  It reproduces the engine to the digits at the "
      + "engine's own design (three sections cooled to the suction temperature) and is a "
      + "constant-exponent estimate for any other: the engine would re-price the isentropic "
      + "path on the package for each section, and the air's heat capacity rises with "
      + "temperature.",
  },
  {
    id: "equal-ratios-are-ideal",
    title: "Equal ratios are the ideal-gas, equal-inlet-temperature optimum.",
    body: "The derivation assumes the same exponent in every section and a return to the "
      + "same inlet temperature.  A real train departs from it for frame sizes, limits and "
      + "cooling water; the engine's cooler pressure drops are the only departure it models.",
  },
  {
    id: "intercoolers-are-listed-not-sized",
    title: "The intercoolers are listed, not placed or sized as exchangers.",
    body: "The sheet gives each cooler's duty and pressure drop.  It is not an item of the "
      + "plant: no area, no cooling-water flow, no cost.  The saved work is therefore not "
      + "the saved money: the cooler, the extra casing and the piping are not priced here.",
  },
  {
    id: "single-phase-vapour",
    title: "A vapour at every stage.",
    body: "No condensation between sections is tested.  A wet gas, a gas near its critical "
      + "point or a compression that crosses a phase boundary is outside what the design "
      + "claims.",
  },
  {
    id: "efficiency-is-declared",
    title: "The efficiency is the book's estimate unless the case declares one.",
    body: "The polytropic efficiency 0.75 is Brown's starting estimate for a centrifugal "
      + "stage (p.196); the flow-coefficient chart that would refine it is not used.  The "
      + "flowsheet unit's own efficiency is a different, isentropic number (step 2).",
  },
];

/** The questions at the foot of the page (DEV.md 4c C158): drafts for
 *  Vitor's review, each testing a step and naming it. */
export const COMPRESSION_QUIZ: readonly QuizQuestion[] = [
  {
    id: "head-is-gas", steps: [1],
    q: "The head of a compression is the same whatever the impellers look like.  What does it belong to?",
    options: [
      "The machine",
      "The gas and the path, from P1 to P2 and the inlet temperature",
      "The motor",
      "The number of impellers",
    ],
    correct: 1,
    feedback: "The head is a property of the gas and the path; the machine "
      + "adds the efficiency and the number of impellers needed to deliver it "
      + "(step 1).",
  },
  {
    id: "which-efficiency", steps: [2],
    q: "A datasheet says only 'efficiency 0.75'.  What does that tell you about the machine?",
    options: [
      "Everything: the two efficiencies are the same number",
      "Nothing definite: isentropic and polytropic efficiencies differ as the pressure ratio grows",
      "That the machine is centrifugal",
      "That the gas is ideal",
    ],
    correct: 1,
    feedback: "The isentropic efficiency compares with the reversible adiabatic "
      + "line between the two pressures; the polytropic one holds along every "
      + "slice of the path.  They coincide near a ratio of 1 and separate as it "
      + "grows (step 2).",
  },
  {
    id: "temperature-limit", steps: [3],
    q: "What is the discharge-temperature limit that forces intercooling?",
    options: [
      "A law of thermodynamics",
      "A design decision, which the case declares and which machines can exceed",
      "Always 519 K",
      "A property of the gas only",
    ],
    correct: 1,
    feedback: "The limit is called arbitrary even in the source that quotes "
      + "it, and the witness declares its own; it fixes the number of "
      + "sections you need (step 3).",
  },
  {
    id: "equal-ratios", steps: [4],
    q: "For an ideal gas cooled back to T1 between sections with the same exponent, how should the overall pressure ratio be shared?",
    options: [
      "Larger ratio in the first section",
      "Equal ratios in all sections, each R^(1/N)",
      "Larger ratio in the last section",
      "The ratio does not matter",
    ],
    correct: 1,
    feedback: "The symmetric split minimises the total work.  Real designs "
      + "depart from it on purpose, for a discharge limit for example "
      + "(step 4).",
  },
  {
    id: "diminishing", steps: [5],
    q: "On the witness (air, ratio 12), the first intercooler saves 23 % of the work, the second a further 8 % of what is left.  What does this show?",
    options: [
      "Every added section saves as much as the first",
      "The saving falls with each section and has a limit, the isothermal work",
      "Intercooling raises the work",
      "More than four sections are always needed",
    ],
    correct: 1,
    feedback: "Staging saves less each time, with a limit of m ln R in units "
      + "of c, the work of an infinite number of sections (step 5).",
    origins: ["engine"],
  },
];
