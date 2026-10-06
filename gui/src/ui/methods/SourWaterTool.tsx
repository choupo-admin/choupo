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
  THE SAME SULFUR, ONE UNIT EARLIER -- the second process page, and the pair
  it makes with `claus-gibbs` is the point of both.

  A Claus furnace is a Gibbs minimisation over ideal gases: no solvent, no
  charge, no pH, and a temperature that comes out of an energy balance.  The
  stripper that produced its feed is the opposite in every one of those:
  aqueous, charged, pH-decided, and isothermal per tray by construction.  The
  same three atoms travel through both.  A student who meets only one of them
  learns that "the model" is whichever one they met.

  THE PAGES DO NOT CLAIM THE STREAMS JOIN, and the box at the end says so:
  claus01's feed is a rich-amine acid gas, stripper02's overhead is a
  sour-water vapour, and pretending they are the same stream to make a neat
  story would be the kind of true-sounding statement this repository refuses.
  What connects them is the SULFUR and the two model families it needs.

  It walks tutorials/steady/distillation/stripper02_sour_water_h2s, whose
  chemistry is anchored one layer down by edwards02/03 against Edwards et al.
  (1978) Tables 7 and 8 -- reproducing the paper's own PREDICTIONS from its
  own equations, with its measurements quoted there as context only.  That
  is a verification of a transcription, not a validation against measured
  data, and the page says so out loud.

  ZERO PHYSICS IN TYPESCRIPT: nothing is computed here.
\*---------------------------------------------------------------------------*/

import { Alert, Box, Code, Stack, Table, Text, Title } from "@mantine/core";

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";

export const SOURWATER_STEPS = [
  {
    n: 1,
    title: "One molecule, three names",
    body: "Dissolve hydrogen sulfide in water and you no longer have one "
      + "substance.  You have H₂S(aq), you have HS⁻, and you have H⁺ — and "
      + "which of them you mostly have is decided by nothing in the H₂S "
      + "record.  It is decided by the pH, which is itself decided by "
      + "everything else in the water.",
    eq: "H₂S(aq)  ⇌  H⁺ + HS⁻            K₁(T)\n"
      + "HS⁻      ⇌  H⁺ + S²⁻            K₂(T)",
    after: "This is why the stream table's `H2S` column is not a lie but is "
      + "not the whole truth either.  Choupo carries BOTH bases on every "
      + "stream its package can resolve: the apparent components, which ARE "
      + "the state and close the flowsheet's mass balance, and a "
      + "`speciation {}` block that decomposes the liquid into the species "
      + "the equilibrium is actually solved in.  Neither is derived from the "
      + "other by convention — the bridge is DECLARED on the component, and "
      + "the reader verifies m = A n against the same bridges, where m is "
      + "the master-species TOTALS on the same molar basis as n.",
    where: [
      { sym: "K₁, K₂", means: "dissociation constants of the sulfide family at T", unit: "—" },
      { sym: "m", means: "the master-species totals the apparent amounts map onto — an AMOUNT on the same basis as n, not a molality despite the letter", unit: "mol" },
      { sym: "A", means: "the declared stoichiometric bridge, component → master species", unit: "—" },
      { sym: "n", means: "the apparent component amounts (the flowsheet's state)", unit: "mol" },
    ],
    assumes: "That the case DECLARES which networks exist.  A component with "
      + "no declared bridge is refused rather than guessed at by name — a "
      + "species called `S` is not automatically sulfide.",
    cites: "SpeciationSolver.cpp:679-690",
  },
  {
    n: 2,
    title: "The equilibrium is a Newton, and it lives inside every stage",
    body: "Each mass-action law is one equation; each element or master "
      + "species is one mole balance; and when the pH is solved rather than "
      + "given, electroneutrality is one more row.  Together they are a "
      + "small nonlinear system solved by Newton at every point where a "
      + "composition is needed.",
    eq: "γ_species m_species = K(T) · Π_j (γ_j m_j)^ν_j   (mass action)\n"
      + "Σ_species ν_ji m_species = n_j                (master balance)\n"
      + "Σ_species z_species m_species = 0             (electroneutrality)",
    after: "The temperature enters through K, by van't Hoff on the record's "
      + "own enthalpy of reaction — not by a fitted correlation and not by a "
      + "constant.  Where a record carries the PHREEQC analytic form instead, "
      + "that is used and announced.  Nothing here is a Claus-specific "
      + "model: it is the same solver every electrolyte case in the tree "
      + "runs.",
    where: [
      { sym: "K(T)", means: "equilibrium constant of one curated reaction at T", unit: "—" },
      { sym: "γ_j", means: "activity coefficient of species j (Davies, Pitzer or Edwards)", unit: "—" },
      { sym: "ν_ji", means: "stoichiometric coefficient of master j in species i", unit: "—" },
      { sym: "z", means: "charge of a species", unit: "—" },
      { sym: "m_j, m_species", means: "molality of master j, of a formed species", unit: "mol/kg" },
      { sym: "n_j", means: "total of master species j from the apparent basis, PER KILOGRAM OF WATER — a molality, so that the balance adds like to like", unit: "mol/kg" },
    ],
    assumes: "That the curated records for these families exist and are "
      + "reachable from THIS feed.  A record the feed cannot reach is "
      + "reported as not activated, with the master species that was "
      + "missing — the closure shows its work rather than assembling itself "
      + "silently.",
    cites: "SpeciationSolver.cpp:702-707, SpeciationSolver.cpp:1690-1697",
  },
  {
    n: 3,
    title: "A tray is a flash, and a reactive tray is a reactive flash",
    body: "Now put that inside a column.  The MESH equations need one thing "
      + "from thermodynamics per stage — a K-value — and the engine asks for "
      + "it through a single entry point.  For a molecular package that call "
      + "forwards straight to the ordinary K; for a reactive one it solves "
      + "the stage's OWN equilibrium at the stage's own T, P and overall "
      + "composition and returns an effective APPARENT K.",
    eq: "K_stage = ThermoPackage::stageK(T, P, z_stage, x, y)",
    after: "The consequence is worth stating plainly: the Jacobian never "
      + "sees an ion.  The apparent components stay the column's state, the "
      + "ions stay internal to each stage exactly as they do in a flash, and "
      + "the column's dimension does not depend on how much chemistry the "
      + "case declared.  What it costs is one reactive flash per stage per "
      + "residual evaluation, which is why this case selects "
      + "`model simultaneous;` rather than a bubble-point sweep.",
    where: [
      { sym: "K_i", means: "vapour-liquid distribution ratio y_i / x_i for apparent component i", unit: "—" },
      { sym: "z_stage", means: "overall composition on the stage", unit: "—" },
      { sym: "x, y", means: "liquid and vapour compositions on the stage", unit: "—" },
    ],
    assumes: "That equilibrium holds on each stage.  This is a rigorous MESH "
      + "column, not a shortcut — but it is still an EQUILIBRIUM column, and "
      + "no tray efficiency is applied anywhere.",
    cites: "ThermoPackage.cpp:811-815",
  },
  {
    n: 4,
    title: "Now predict the pH profile — and be wrong",
    body: "Feed sour water carrying ammonia, carbon dioxide and hydrogen "
      + "sulfide to eight reactive trays and strip it.  CO₂ is the more "
      + "volatile acid gas, so it leaves first.  Removing an acid should "
      + "raise the pH going down the column.",
    after: "It falls: 8.4947876 at the top to 7.6090598 at the reboiler.  "
      + "The reason is that CO₂ is not the only thing leaving.  Ammonia "
      + "leaves too, and it is the base; meanwhile the sulfide does NOT "
      + "follow the carbonate out — m_HCO3 collapses from 0.14620364 to "
      + "5.6325275e-06 while m_HS goes the other way, 0.27828666 to "
      + "0.28854884.  The departing ammonia and the accumulating sulfide "
      + "acidify faster than the departing carbonate alkalinises.  (The "
      + "molalities are read from stage 2, the feed stage, down to the "
      + "reboiler: the top stage carries no sulfide at all.)",
    where: [
      { sym: "m_HCO3", means: "molality of bicarbonate on the tray", unit: "mol/kg" },
      { sym: "m_HS", means: "molality of bisulfide on the tray", unit: "mol/kg" },
      { sym: "pH", means: "−log₁₀ of the hydrogen-ion ACTIVITY, solved not declared", unit: "—" },
    ],
    assumes: "Three networks at once — ammonia, carbonate, sulfide — each "
      + "from its own curated record.  Drop any one and the answer changes, "
      + "which is the argument for not modelling sour water as a two-family "
      + "system.",
    cites: "tutorials/steady/distillation/stripper02_sour_water_h2s/expected",
  },
  {
    n: 5,
    title: "Where the numbers come from",
    body: "Almost nothing on this shelf is checked against a published "
      + "reference, and this page is one of the exceptions — but the "
      + "reference is a published MODEL's own predictions, not a "
      + "measurement, so it is worth being precise about what is anchored "
      + "and what is not.",
    after: "The CHEMISTRY under this column is pinned one layer down by two "
      + "witness cases that reproduce Edwards, Maurer, Newman & Prausnitz, "
      + "AIChE J. 24(6):966-976 (1978) — its Table 7 for the NH₃-CO₂-water "
      + "system and Table 8 for NH₃-H₂S-water — with the paper's own "
      + "truncated Pitzer expansion and its own parameters, compared with "
      + "the paper's PREDICTED values (its measurements are quoted as context "
      + "only), with bands sized to the residual measured between the two "
      + "rather than chosen to pass.  That verifies a transcription of a "
      + "published model; it does not validate the model against measured "
      + "data.  The COLUMN "
      + "itself is not validated against anything: its stage count, feed "
      + "position and reflux are a teaching configuration, and its golden "
      + "records that the answer has not MOVED, never that it is right.",
    where: [],
    assumes: "That an anchored property model under an unanchored unit gives "
      + "an unanchored answer.  It does.  The anchor buys confidence that the "
      + "chemistry is the paper's — and none at all in the column.",
    cites: "tutorials/props/electrolyte/edwards02_table7_vle",
  },
] as const;

/** One row per quantity, one column per profile STAGE, every cell a row the
 *  golden pins (profile row index = stage - 1).  The old table had one "top"
 *  column holding stage 1's pH beside stage 2's bicarbonate and bisulfide --
 *  stage 1 carries no sulfide at all -- so the two stages are now apart, and
 *  a cell the golden does not pin is "—" rather than borrowed from a
 *  neighbour (C22 slice 2). */
export const SOURWATER_TABLE = [
  { q: "pH", s1: "8.4947876", s2: "8.2089848", s8: "7.6090598" },
  { q: "m_HCO3  [mol/kg]", s1: "—", s2: "0.14620364", s8: "5.6325275e-06" },
  { q: "m_HS  [mol/kg]", s1: "0", s2: "0.27828666", s8: "0.28854884" },
  { q: "m_H2Saq  [mol/kg]", s1: "0", s2: "—", s8: "0.008247863" },
  //  T: the golden pins the distillate and bottoms STREAMS, which leave at
  //  the stage-1 and stage-8 temperatures (356.43087 / 372.03155 K in the
  //  profile, equal to the profile's printed precision).
  { q: "T  [K]", s1: "356.430868413", s2: "—", s8: "372.031545213" },
] as const;

export function SourWaterTool(): JSX.Element {
  return (
    //  `minHeight: 0` is the load-bearing half: a flex child refuses to
    //  shrink below its content without it, so the inner scroll never
    //  engages.  Reported by the owner on the COSMO-SAC page, 2026-08-31.
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
    <Stack gap={14}>
      <Box>
        <Title order={3}>The same sulfur, one unit earlier</Title>
        <Text size="sm" mt={4}>
          A sour-water stripper, and the model family a Claus furnace never
          needs.  Read it beside{" "}
          <em>The allotrope nobody declared</em>: that page minimises a Gibbs
          energy over ideal gases with no solvent and no charge; this one
          solves an aqueous equilibrium where the same sulfur exists under
          three names and the <strong>pH decides which</strong>.  Numbers are
          the recorded golden of{" "}
          <Code style={{ fontSize: 11 }}>tutorials/steady/distillation/stripper02_sour_water_h2s</Code>.
        </Text>
      </Box>

      {SOURWATER_STEPS.map((s) => (
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
        <Title order={5}>Down the column</Title>
        <Text size="sm" mt={4} mb={8}>
          Stages 1 (top), 2 (feed) and 8 (reboiler), off the run's own
          profile.  The top stage carries no sulfide at all, so the
          bisulfide and bicarbonate are followed from stage 2; a dash is a
          value the golden does not pin.
        </Text>
        <Table withTableBorder withColumnBorders striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>quantity</Table.Th>
              <Table.Th>stage 1 (top)</Table.Th>
              <Table.Th>stage 2 (feed)</Table.Th>
              <Table.Th>stage 8 (reboiler)</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {SOURWATER_TABLE.map((r) => (
              <Table.Tr key={r.q}>
                <Table.Td><Code style={{ fontSize: 11 }}>{r.q}</Code></Table.Td>
                <Table.Td>{r.s1}</Table.Td>
                <Table.Td>{r.s2}</Table.Td>
                <Table.Td>{r.s8}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>

      <Alert variant="light" color="blue"
        title="Two pages, one element — and NOT one stream">
        <Text size="sm">
          It is tempting to say the overhead of this column is the feed to the
          Claus furnace on the other page.  It is not, and the difference is
          worth more than the tidy story would be.  A Claus plant is normally
          fed a <strong>rich-amine acid gas</strong> — concentrated H₂S with
          some CO₂ — while a sour-water stripper produces a wet vapour carrying
          ammonia as well, which is why real plants route it through a separate
          burner section.  The two cases are configured independently and
          neither number feeds the other.
        </Text>
        <Text size="sm" mt={6}>
          What genuinely connects them is the sulfur and{" "}
          <strong>the two model families it needs</strong>.  In water it is a
          charged equilibrium at 100 °C where a curated log K and an activity
          coefficient decide everything.  In the furnace it is an uncharged
          minimisation at 1500 K where a formation enthalpy decides everything
          and the word pH does not occur.  Same element, same plant, and no
          single model that covers both.
        </Text>
      </Alert>

      <Box>
        <Title order={5}>What to try</Title>
        <Text size="sm" mt={4}>
          Open{" "}
          <Code style={{ fontSize: 11 }}>reports/unitOperations/tower/profile.csv</Code>{" "}
          after a run: it carries all three families' molalities per tray, so
          the pH story above can be checked line by line rather than believed.
          Then look at <Code>stripper01_sour_water</Code>, the same column with
          the sulfide family removed — its pH RISES.  The difference between
          the two cases is one chemistry record, and it reverses the
          direction of the answer — its pH climbs 8.46 → 8.80 from tray 2
          down.  Its header explains why the claim starts at tray 2 and not
          at the condenser: the top tray sits about 7 K colder, so comparing
          a pH across that jump compares two different water dissociations.
          Worth reading before you compare any two pH's in this tree.
        </Text>
      </Box>
    </Stack>
    </Box>
  );
}
