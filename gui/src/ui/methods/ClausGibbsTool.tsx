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
  THE ALLOTROPE NOBODY DECLARED -- the first PROCESS page on this shelf, and
  the reason it is a process and not a method is that its lesson only exists
  between two units.  Every other EduTool here explains one construction; this
  one shows the same twelve species minimised twice, 900 K apart, and lets the
  student read the difference off two stream tables.

  It walks tutorials/steady/gibbs/claus01_thermal_stage, and every number on
  the page is that case's recorded golden -- not a worked example, not a
  textbook table.  If the case moves, the page is wrong, and the gate that
  catches it is bin/runTests on the case itself.

  WHY CLAUS.  Three things a chemical engineering student should meet
  together, and this process is where they are inseparable:

    * A stoichiometry that CANNOT be written by hand, because "3/x S_x"
      contains an unknown that is itself an equilibrium.
    * An adiabatic temperature that is a RESULT of one design knob (the air
      rate) rather than a specification.
    * A compound the software does not have, which is the ordinary condition
      of real work and is usually hidden from students entirely.

  ZERO PHYSICS IN TYPESCRIPT: nothing is computed here.
\*---------------------------------------------------------------------------*/

import { Alert, Box, Code, Stack, Table, Text, Title } from "@mantine/core";

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";

export const CLAUS_STEPS = [
  {
    n: 1,
    title: "The plant, and the sentence it cannot finish",
    body: "An amine unit strips hydrogen sulfide out of natural gas or a "
      + "refinery stream and hands you a concentrated acid gas.  You cannot "
      + "vent it and you cannot burn it to SO₂, so you make elemental "
      + "sulfur.  The route is two reactions and they are not independent: "
      + "burn ONE THIRD of the H₂S to SO₂, then let the SO₂ oxidise the "
      + "rest.",
    eq: "H₂S + 3/2 O₂  →  SO₂ + H₂O            (the burner)\n"
      + "2 H₂S + SO₂   →  3/x S_x + 2 H₂O      (the Claus reaction)",
    after: "Add them in the ratio 1 : 1 and the oxygen is exactly enough — "
      + "which is where the one third comes from, and why the air rate is "
      + "the only real knob on a Claus furnace.  Now try to close a mass "
      + "balance.  You cannot: the second equation contains x, and x is the "
      + "number of sulfur atoms in the molecule that actually forms.  Sulfur "
      + "vapour is S₂ when it is hot and S₈ when it is cool, with everything "
      + "in between at the temperatures a Claus plant works at.  A hand "
      + "calculation must ASSUME a value for x before it can proceed, and "
      + "the assumption changes the mole count of every stream downstream.",
    where: [
      { sym: "x", means: "atoms of sulfur in the allotrope that forms — the unknown", unit: "—" },
      { sym: "S_x", means: "sulfur vapour of unspecified molecularity", unit: "—" },
    ],
    assumes: "Nothing yet.  This step is the problem statement.",
    cites: "tutorials/steady/gibbs/claus01_thermal_stage/system/controlDict",
  },
  {
    n: 2,
    title: "Stop writing reactions",
    body: "The way out is to stop specifying WHICH reactions happen.  "
      + "Equilibrium does not care how the atoms got rearranged; it is the "
      + "composition that minimises the Gibbs energy subject to the atoms "
      + "you started with.  So declare the atoms and the candidate species, "
      + "and ask for the minimum:",
    eq: "min_n  G(n) = Σ_i n_i μ_i(T, P, y)\n"
      + "  subject to   A · n = b        (every element conserved)\n"
      + "               n_i ≥ 0",
    after: "A is the atom matrix — one row per element, one column per "
      + "species, the entry being how many of that atom the species "
      + "contains.  It is exactly the atoms( ) list in the case file, and "
      + "writing it is the whole of the modelling work.  b is what the feed "
      + "brought in.  Note what has disappeared: there is no reaction, no "
      + "stoichiometric coefficient, no conversion, and no x.",
    where: [
      { sym: "n_i", means: "moles of species i at equilibrium (the unknowns)", unit: "mol" },
      { sym: "μ_i", means: "chemical potential of species i in the mixture", unit: "J/mol" },
      { sym: "y_i", means: "mole fraction of species i in the gas", unit: "—" },
      { sym: "A", means: "atom matrix, A_ji = atoms of element j in species i", unit: "—" },
      { sym: "b_j", means: "moles of element j in the feed", unit: "mol" },
      { sym: "N", means: "number of candidate species", unit: "—" },
      { sym: "M", means: "number of elements tracked", unit: "—" },
    ],
    assumes: "That the species you listed are the ones that can form.  This "
      + "is the model's one real assumption and it is yours, not the "
      + "engine's — a species you leave out cannot appear, however "
      + "favourable it would have been.",
    cites: "GibbsReactor.H:36-38",
  },
  {
    n: 3,
    title: "One multiplier per element",
    body: "A constrained minimum is a Lagrangian.  Attach a multiplier π_j "
      + "to each element balance, differentiate, and the stationarity "
      + "condition gives every mole number in closed form:",
    eq: "n_i = exp( ln N − ln P − g°_i(T)/RT + Σ_k π_k A_ki )",
    after: "This is worth staring at.  N unknowns have collapsed into M + 1 "
      + "— one π per ELEMENT plus the total — and there are five elements "
      + "here whatever the species count.  Substituting back into the "
      + "constraints leaves M + 1 equations for M + 1 unknowns, which is "
      + "what the engine actually solves with a finite-difference Newton.",
    where: [
      { sym: "π_j", means: "element potential of element j, in units of RT (λ_j / RT)", unit: "—" },
      { sym: "λ_j", means: "the Lagrange multiplier itself — published as a KPI", unit: "J/mol" },
      { sym: "g°_i", means: "standard-state molar Gibbs energy of species i at T", unit: "J/mol" },
      { sym: "R", means: "gas constant", unit: "J/(mol·K)" },
      { sym: "T", means: "temperature", unit: "K" },
      { sym: "P", means: "pressure", unit: "Pa" },
    ],
    assumes: "Ideal gas at the 1 bar reference, φ_i = 1, so μ_i = g°_i(T) + "
      + "RT ln(y_i P).  At 1.5 bar and 1500 K that is a very good "
      + "approximation and the engine says so rather than hiding it.",
    cites: "GibbsMethod.cpp:78-82, GibbsMethod.cpp:85-92",
  },
  {
    n: 4,
    title: "Where g° comes from, and why COS could not play",
    body: "Everything above rests on one number per species: g°_i(T).  The "
      + "engine gets it from the component's own record — the enthalpy and "
      + "entropy of formation at 298 K, integrated to T with the ideal-gas "
      + "heat capacity.  No formation data, no Gibbs energy, no species.",
    eq: "g°_i(T)/RT  ←  Component::g_pure_ig(T) / (R·T)",
    after: "This is not a formality.  The catalogue's carbonyl sulfide "
      + "record carries a molecular weight, critical constants, an Antoine "
      + "fit and a heat capacity, and states in its own header that "
      + "formation properties were NOT available from its source, so it "
      + "omits them rather than inventing any.  That omission is honest and "
      + "it is disqualifying: COS could not enter this reactor at all.  "
      + "Step 8 is what the case does about it.",
    where: [
      { sym: "g°_i(T)", means: "standard-state Gibbs energy, referenced to the elements", unit: "J/mol" },
    ],
    assumes: "That the record's Cp fit covers the path from 298 K to T.  "
      + "Here it does not quite — the furnace lands 15 K above the fits' "
      + "declared 1500 K ceiling — and the run announces exactly that, once "
      + "per component, in its caveat block.",
    cites: "ElementPotential.cpp:46-48",
  },
  {
    n: 5,
    title: "The furnace: temperature as an answer",
    body: "The furnace is adiabatic.  Nobody sets its temperature; the "
      + "enthalpy of the products at T must equal the enthalpy of the feed, "
      + "and T is whatever satisfies that.  An outer Newton wraps the whole "
      + "minimisation:",
    eq: "f(T) = H_out(T) − H_in − Q = 0,     Q = 0 for an adiabatic burner",
    after: "Each evaluation of f is a complete Gibbs minimisation at a trial "
      + "temperature.  Feed 100 kmol/h of acid gas (90 % H₂S, 10 % CO₂) and "
      + "exactly enough air to burn one third of the H₂S, and the answer is "
      + "1515.34 K — squarely in the 1200–1600 K range real Claus furnaces "
      + "run at, from a model told nothing about Claus furnaces.",
    where: [
      { sym: "H_in", means: "enthalpy of the feed at its own temperature", unit: "J/s" },
      { sym: "H_out", means: "enthalpy of the equilibrium products at T", unit: "J/s" },
      { sym: "Q", means: "heat added to the reactor", unit: "J/s" },
      { sym: "f(T)", means: "the energy residual the outer Newton drives to zero", unit: "J/s" },
    ],
    assumes: "Adiabatic, and a single gas phase.",
    cites: "GibbsReactor.cpp:188-214",
  },
  {
    n: 6,
    title: "And now read the sulfur",
    body: "The case runs the SAME twelve species over the SAME five "
      + "elements a second time, in the waste-heat boiler behind the "
      + "furnace, isothermal at 600 K.  Nothing else changes — not the "
      + "species list, not the atom matrix, not the method.  Only the "
      + "temperature.",
    after: "S₂ and S₈ swap places, and nothing in either unit was told which "
      + "one to prefer.  Both were offered; the minimisation chose.  That is "
      + "the x from step 1, answered — twice, differently, correctly both "
      + "times.",
    where: [],
    assumes: "Both units are the gas phase alone.  Real sulfur CONDENSES "
      + "near 600 K and this package has no liquid sulfur — see the box "
      + "below.",
    cites: "tutorials/steady/gibbs/claus01_thermal_stage/expected",
  },
  {
    n: 7,
    title: "The 2 : 1 nobody asked for",
    body: "Look at H₂S and SO₂ in the boiler: 2.783 % and 1.392 %, a ratio "
      + "of 1.999270.  Every Claus plant in the world is controlled to keep "
      + "that ratio at 2 : 1, because it is the stoichiometry the catalytic "
      + "beds need.  It was never entered anywhere.  It fell out of a Gibbs "
      + "minimisation that had never heard of the Claus reaction.",
    after: "In the FURNACE the same ratio is 1.04, and the explanation is "
      + "two columns over on the same line: 2.85 % H₂ and 0.80 % CO.  At "
      + "1500 K hydrogen sulfide also CRACKS (H₂S → H₂ + ½ S₂), which "
      + "consumes H₂S without consuming any SO₂ and pulls the ratio below "
      + "two.  Hydrogen in Claus tail gas is a real and well-documented "
      + "nuisance.  Here it is not a correction bolted on afterwards — it "
      + "is a consequence of the same minimisation, and it explains a "
      + "number on the line above it.",
    where: [],
    assumes: "Equilibrium.  See the last box: this is not conversion.",
    cites: "tutorials/steady/gibbs/claus01_thermal_stage/expected",
  },
  {
    n: 8,
    title: "The compound the catalogue did not have",
    body: "Two of this case's fourteen components are not in Choupo's "
      + "catalogue in usable form, and they are missing in two different "
      + "ways — which is why the case carries both.",
    after: "S₈ is absent outright: no record, anywhere.  Carbonyl sulfide is "
      + "PRESENT but incomplete, missing exactly the formation block step 4 "
      + "needs.  So the case writes two files into its own "
      + "constant/components/: a NEW record for S₈, and an OVERLAY for COS "
      + "that adds the missing block and nothing else — the catalogue still "
      + "supplies its molecular weight, its criticals and its Cp, and there "
      + "is no second carbonyl sulfide anywhere in the tree.  Neither file "
      + "was typed.  Both were generated from NASA TM-4513 (McBride, Gordon "
      + "& Reno 1993, a US government work in the public domain) by one "
      + "command, and the licence matters as much as the number: a "
      + "compilation you may not redistribute is not a source you may quote "
      + "from, however convenient.",
    eq: "bin/import_nasa.py --tm4513 S8 COS --outdir <case>/constant/components",
    where: [],
    assumes: "That the case, not the catalogue, is the right home for a "
      + "component you have just made.  Promoting a record to "
      + "data/standards/ is a curation act with a reviewer; a case-local "
      + "record is yours and travels with your case.",
    cites: "tutorials/steady/gibbs/claus01_thermal_stage/constant/components/S8.dat",
  },
] as const;

export const CLAUS_TABLE = [
  { sp: "S₂", furnace: "10.42 %", boiler: "0.055 %" },
  { sp: "S₈", furnace: "9.4 × 10⁻¹⁴", boiler: "3.44 %" },
  { sp: "H₂S", furnace: "3.91 %", boiler: "2.783 %" },
  { sp: "SO₂", furnace: "3.75 %", boiler: "1.392 %" },
  { sp: "H₂", furnace: "2.85 %", boiler: "~0" },
  { sp: "CO", furnace: "0.80 %", boiler: "~0" },
  { sp: "COS", furnace: "0.037 %", boiler: "~0" },
  { sp: "T", furnace: "1515.34 K (solved)", boiler: "600 K (set)" },
] as const;

export function ClausGibbsTool(): JSX.Element {
  return (
    //  `minHeight: 0` is the load-bearing half: a flex child refuses to
    //  shrink below its content without it, so the inner scroll never
    //  engages.  Reported by the owner on the COSMO-SAC page, 2026-08-31.
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
    <Stack gap={14}>
      <Box>
        <Title order={3}>The allotrope nobody declared</Title>
        <Text size="sm" mt={4}>
          A Claus sulfur plant, worked end to end — and the one thing about it
          that <strong>cannot be done by hand</strong>.  Every number on this
          page is the recorded output of{" "}
          <Code style={{ fontSize: 11 }}>tutorials/steady/gibbs/claus01_thermal_stage</Code>,
          not a textbook table.
        </Text>
      </Box>

      {CLAUS_STEPS.map((s) => (
        <Box key={s.n}>
          <Title order={5}>{s.n} · {s.title}</Title>
          <Text size="sm" mt={4}>{s.body}</Text>
          {"eq" in s && s.eq && (
            <Box my={8} px="sm" py={8} style={{ borderLeft: `3px solid ${GRID}` }}>
              <Text size="sm" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
                {s.eq}
              </Text>
            </Box>
          )}
          {"after" in s && s.after && <Text size="sm">{s.after}</Text>}
          {s.where.length > 0 && (
            <Box mt={6} pl="sm">
              {s.where.map((w) => (
                <Text key={w.sym} size="xs" c={INK}>
                  <Code style={{ fontSize: 11 }}>{w.sym}</Code> — {w.means}
                  {w.unit !== "—" ? ` [${w.unit}]` : ""}
                </Text>
              ))}
            </Box>
          )}
          <Text size="xs" c={INK} mt={6}>
            <strong>Assumed here:</strong> {s.assumes}
          </Text>
          <Text size="xs" c={INK}>
            <strong>In the engine:</strong>{" "}
            <Code style={{ fontSize: 11 }}>{s.cites}</Code>
          </Text>
        </Box>
      ))}

      <Box>
        <Title order={5}>The two answers, side by side</Title>
        <Text size="sm" mt={4} mb={8}>
          Same twelve species, same five elements, same method.  900 K apart.
        </Text>
        <Table withTableBorder withColumnBorders striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>species</Table.Th>
              <Table.Th>furnace, adiabatic</Table.Th>
              <Table.Th>boiler, 600 K</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {CLAUS_TABLE.map((r) => (
              <Table.Tr key={r.sp}>
                <Table.Td><Code style={{ fontSize: 11 }}>{r.sp}</Code></Table.Td>
                <Table.Td>{r.furnace}</Table.Td>
                <Table.Td>{r.boiler}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>

      <Alert variant="light" color="orange"
        title="Equilibrium is not conversion, and this gas does not condense">
        <Text size="sm">
          Two limits, stated here rather than left to be discovered.  Neither
          is a defect in the model; both are the model being asked a narrower
          question than the plant answers.
        </Text>
        <Text size="sm" mt={6}>
          <strong>The catalytic beds are missing, and they exist for a
          reason.</strong>  A real Claus plant puts two or three catalyst beds
          after the boiler precisely because the Claus reaction is
          kinetically slow at 500 K.  Equilibrium says where the composition
          would go given unlimited time; a bed decides how far it actually
          gets.  Nothing on this page is a conversion.
        </Text>
        <Text size="sm" mt={6}>
          <strong>Sulfur condenses near 600 K and this package has no liquid
          sulfur.</strong>  S₂, S₈, S and SO are declared{" "}
          <Code>role nonvolatile;</Code> and the run announces on every pass
          that their volatility is UNKNOWN rather than established.  So the
          boiler's outlet is the composition of the GAS, not of a condenser
          with liquid running out of the bottom.  The 3.44 % S₈ is what a
          condenser would be handed, not what leaves it.
        </Text>
      </Alert>

      <Box>
        <Title order={5}>What to try</Title>
        <Text size="sm" mt={4}>
          Change one number in{" "}
          <Code style={{ fontSize: 11 }}>0/air</Code> and nothing else.  Give
          the furnace more oxygen than the one-third stoichiometry and watch
          the H₂S : SO₂ ratio fall below two while the flame temperature
          rises; starve it and the ratio climbs past two with unburnt H₂S in
          the tail gas.  Real plants run an analyser on exactly that ratio and
          trim exactly that air valve.  Then delete <Code>S8</Code> from the
          species list in <Code>system/flowsheetDict</Code>, re-run, and see
          what the boiler says when the molecule it needs is not on the menu —
          which is step 2's assumption, made visible by removing it.
        </Text>
      </Box>
    </Stack>
    </Box>
  );
}
