/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  adsorbentSelectionLesson -- the lesson text of the `adsorbent-selection`
  EduTool (DEV.md 4c C459, Vitor 2026-11-19: "nas minhas aulas de adsorcao
  eu falo dos adsorventes mais comuns na industria e a sua utilizacao").

  The page maps eight industrial adsorbents to five separations.  Every value
  and every sentence of guidance comes from a page of a book in the project's
  literature folder (adsorbentSelectionData.ts carries the page of each); the
  only arithmetic is Eq. (17-25) of Wankat for the temperature rise of a bed,
  a kcal-to-kJ conversion and a count of matrix cells.

  THE ENGINE CITATIONS of this page are the two lines where Choupo reads what
  the catalogue holds for an adsorbent:

    the identity of the material  (a name, a class, a packed bulk density)
                                  src/thermo/adsorbent/Adsorbent.cpp:42
    the heat of adsorption of one gas on it
                                  src/thermo/adsorbent/IsothermModel.cpp:140

  each held to the line by gui/tests/adsorbentSelection.test.ts, whose CLAIMS
  table bin/curate/repoint_lesson_citations.py keeps current.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";
import type { QuizQuestion } from "./lessonQuiz.js";

export const ADS_SEL_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "Three properties decide most choices: size, polarity, strength",
    body: "A molecule is either small enough for the pore or it is not. If it fits, "
      + "polarity decides who wins: a hydrophilic surface holds water, a hydrophobic "
      + "one holds organics. Strength, the heat of adsorption, decides how hard the "
      + "bed is to regenerate and how hot it gets while it works.",
    note: "Perry sorts separations into equilibrium, rate and molecular sieving "
      + "(Table 16-1, p. 16-5) and adsorbents into hydrophobic or hydrophilic, "
      + "amorphous or structured (Table 16-3, p. 16-7).",
  },
  {
    n: 2,
    title: "The eight adsorbents side by side",
    body: "The zeolites 3A, 4A, 5A and 13X differ chiefly in their window: 0.3, 0.4, "
      + "0.5 and 1.0 nm. Silica gel and alumina are hydrophilic solids with pores of "
      + "a few nanometres; activated carbon is hydrophobic. A carbon molecular sieve is "
      + "carbon with zeolite-like pores. Every value below carries its page.",
    note: "Where two books print different figures, both are shown and not "
      + "reconciled: alumina pore size, 5A bulk density, silica gel in PSA.",
  },
  {
    n: 3,
    title: "Heat of adsorption: how hot the bed gets",
    body: "Adsorption releases heat, and the same heat must be put back to regenerate. "
      + "For a dilute adsorbate in a gas, with no heat lost, the bed's temperature rise "
      + "is limited by dividing the released heat over the gas that carries it.",
    derivation: [
      { step: "Per kilogram of gas, a mass fraction y of adsorbate is taken up and "
          + "releases y times the heat of adsorption per kilogram of adsorbate:",
        eq: String.raw`Q = y\,\lvert\Delta H_{\mathrm{ads}}\rvert` },
      { step: "That heat warms the gas, whose heat capacity per kilogram is C_{p,f}, "
          + "so the largest rise, with nothing lost to the wall or the solid, is:",
        eq: String.raw`Q = C_{p,f}\,\Delta T_{\max}` },
    ],
    formula: String.raw`\Delta T_{\max} = \frac{y\,\lvert\Delta H_{\mathrm{ads}}\rvert}{C_{p,f}}`,
    where: [
      { sym: "\\Delta T_{\\max}", means: "largest temperature rise of the bed, no heat lost",
        unit: "K" },
      { sym: "y", means: "mass fraction of adsorbate in the feed gas", unit: "kg/kg" },
      { sym: "\\lvert\\Delta H_{\\mathrm{ads}}\\rvert",
        means: "heat of adsorption, as a magnitude, per kg of adsorbate", unit: "kJ/kg" },
      { sym: "C_{p,f}", means: "heat capacity of the feed gas, per kg of gas", unit: "kJ/(kg K)" },
      { sym: "Q", means: "heat released per kg of gas passing", unit: "kJ/kg" },
    ],
    note: "Wankat's Eq. (17-25), p. 640: 1000 to 4000 kJ/kg, about 2500 on average, "
      + "gives 25 deg C for 1.0 wt% adsorbate and 1.25 deg C for 0.05 wt%. The page "
      + "redoes this arithmetic; it is not a measurement.",
  },
  {
    n: 4,
    title: "Which adsorbent for which separation",
    body: "Read each cell as a question a cited page answers. Dominant: the page names "
      + "the adsorbent of the duty. Layer: one of several in a bed. Named: for a "
      + "particular duty inside the separation. A blank cell means the cited pages do "
      + "not name it, not that it is never used.",
    note: "Open a cell to read its sentence and the page it was read at.",
  },
  {
    n: 5,
    title: "What a Pareto would need, and what the folder has",
    body: "A Pareto of industrial use needs tonnes or sales by adsorbent. None of the "
      + "four books gives them, so the page draws none. It counts how many of the five "
      + "separations a cited page names each adsorbent for: breadth in these readings, "
      + "not volume of use.",
    note: "If you file a market review, the bar chart can become a real Pareto; the "
      + "count then stays as the cross-check.",
  },
  {
    n: 6,
    title: "From the record to the case",
    body: "Three of the eight are catalogue records, each with the isotherm and heat of "
      + "adsorption of its gas pairs. Open the record, then the case that uses it. Where "
      + "the book prints a heat for the same pair, the two are set side by side.",
    note: "Activated carbon has a record and five pair records, and no tutorial case "
      + "uses it today.",
  },
];

export const ADS_SEL_LIMITS: readonly LessonLimit[] = [
  {
    id: "reading-not-ranking",
    title: "A reading of four books, not a ranking",
    body: "Each cell is what a cited page says, in the book's year (1984 to 2019). "
      + "Nothing here is a market share, a tonnage or a selectivity. A cell that is "
      + "blank is a page that did not name the adsorbent.",
  },
  {
    id: "outside-the-eight",
    title: "Adsorbents the sources name that are not among the eight",
    body: "LiX and LiLSX zeolites (oxygen from air), mordenite, clinoptilolite, the "
      + "titanosilicate ETS-4, polymeric resins for VOCs and MOFs are named in the "
      + "handbook and are left out: the scope is the eight the lecture course meets.",
  },
  {
    id: "heat-gaps",
    title: "Heats of adsorption the folder does not print",
    body: "The folder prints heats for 4A, 5A, 13X and the carbon molecular sieve, for "
      + "named gases. For activated carbon, silica gel, alumina and 3A it prints none "
      + "per adsorbent; the one range it gives for all common adsorbents is 1000 to "
      + "4000 kJ/kg. The page says so instead of filling the cell.",
  },
  {
    id: "engine-holds-identity",
    title: "What Choupo holds for an adsorbent",
    body: "A catalogue record keeps the identity of the material and its packed bulk "
      + "density (Adsorbent.cpp:42); the isotherm and the heat of adsorption belong to "
      + "the pair of adsorbent and gas (IsothermModel.cpp:140). The pair records are "
      + "marked teachingOnly: they are not design data.",
  },
];

export const ADS_SEL_QUIZ: readonly QuizQuestion[] = [
  {
    id: "dry-cracked-gas",
    q: "Why are 3A and pore-closed 4A zeolites used to dry cracked gas?",
    options: [
      "Their window admits water and excludes hydrocarbons, so none is lost to co-adsorption",
      "Their heat of adsorption for water is the lowest of any adsorbent",
      "They are hydrophobic and so reject the water",
      "They are the cheapest adsorbents for any drying duty",
    ],
    correct: 0,
    feedback: "Size, not strength or price: the window passes the small water molecule "
      + "and keeps the hydrocarbons out, which raises their recovery (Perry, p. 16-40). "
      + "All the zeolites in the table are hydrophilic.",
    steps: [1, 2],
    origins: ["reference"],
  },
  {
    id: "nitrogen-from-air",
    q: "A carbon molecular sieve makes nitrogen from air at pressure. Why is nitrogen the product?",
    options: [
      "Oxygen diffuses into the pores far faster, though the equilibrium capacities differ little",
      "Nitrogen is held much more strongly at equilibrium",
      "Oxygen is excluded by the window",
      "The carbon is hydrophilic and rejects oxygen",
    ],
    correct: 0,
    feedback: "It is a rate-selective separation (Ruthven, Farooq and Knaebel, p. 85; Perry "
      + "Table 16-1, p. 16-5): the cycle must stop before the slow nitrogen has time to "
      + "load, so the contact time is the design variable.",
    steps: [1, 4],
    origins: ["reference"],
  },
  {
    id: "temperature-rise",
    q: "A gas carries 1.0 wt% of an adsorbate whose heat of adsorption is 2500 kJ/kg; "
      + "the gas has a heat capacity of 1.0 kJ/(kg K). What is the largest temperature rise?",
    options: ["25 K", "2.5 K", "250 K", "0.25 K"],
    correct: 0,
    feedback: "0.01 x 2500 / 1.0 = 25 K, the worked figure of Wankat's Eq. (17-25). "
      + "At 0.05 wt% it falls to 1.25 K, which is why dilute beds are treated as "
      + "isothermal and concentrated ones are not.",
    steps: [3],
    origins: ["page"],
  },
  {
    id: "blank-cell",
    q: "In the matrix the cell of activated alumina against solvent recovery is blank. What does that say?",
    options: [
      "The cited pages do not name alumina for that duty",
      "Alumina cannot be used for solvent recovery",
      "Alumina is dominant there, and the cell is hidden",
      "Alumina was tested for it and failed",
    ],
    correct: 0,
    feedback: "Absence of a cell is absence of a sentence in the cited pages, not a "
      + "finding about the adsorbent. A reader who knows a source that names it can add "
      + "the cell with its page.",
    steps: [4],
  },
  {
    id: "no-pareto",
    q: "Why does the page not draw a Pareto of tonnes of adsorbent sold?",
    options: [
      "None of the four cited books gives tonnage or sales by adsorbent",
      "Zeolites are too numerous to count",
      "Tonnage is the same for every adsorbent",
      "The chart would not fit on the page",
    ],
    correct: 0,
    feedback: "A bar of an invented share would be falsely sourced. The page counts the "
      + "separations a cited page names each adsorbent for, says so, and leaves the "
      + "market chart to a source that provides one.",
    steps: [5],
  },
  {
    id: "silica-gel-psa",
    q: "Perry says instrument-air dryers use pressure-swing cycles with alumina or silica gel; the 1994 PSA book says silica gel is not commonly used in PSA. What does the page do?",
    options: [
      "Shows both statements with their pages and reconciles neither",
      "Keeps the more recent source and drops the other",
      "Averages the two",
      "Shows neither, because they disagree",
    ],
    correct: 0,
    feedback: "The two books speak about different things: one names a dryer duty, the "
      + "other a general reason (mechanical strength). A reader is better served by "
      + "both sentences and their pages than by a verdict the sources do not give.",
    steps: [2, 4],
    origins: ["reference"],
  },
];
