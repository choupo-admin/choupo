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
  AdsorbentSelectionTool -- "Which adsorbent for which separation"
  (DEV.md 4c C459, Vitor 2026-11-19).

  THE QUESTION THE SCREEN ANSWERS FIRST.  I have a separation in front of me
  -- drying a gas, purifying hydrogen, splitting air, recovering a solvent,
  treating water: which of the common industrial adsorbents does a cited page
  name for it, and why?  So the page opens on the eight adsorbents with their
  pore size, polarity, heats and regeneration, then the matrix of
  separations against adsorbents, and only then the catalogue: the three
  adsorbents Choupo holds as records, each opened, with the case that uses it.

  THE DATA PATH.  No engine run.  Every value is read from a page of a book
  (adsorbentSelectionData.ts, the page beside each number); the catalogue
  records are read as text (adsorbentCatalogue.ts); the arithmetic is Wankat's
  Eq. (17-25), a kcal-to-kJ conversion and a count of matrix cells, and each
  is marked `page`.

  THE PARETO.  Nothing in the folder gives tonnes or shares, so the bars are
  a COUNT of the separations a cited page names each adsorbent for, and the
  page says that in the sentence above them.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Accordion, Badge, Box, Button, Collapse, Group, Stack, Table, Text, Title,
} from "@mantine/core";

import { caseTabSearch, openAppTab } from "../openInTab.js";
import {
  ADSORBENTS, CASES_USING, GENERIC_HEAT, KCAL_TO_KJ, MATRIX, SEPARATIONS,
  SOURCES, ZEOLITE_POLAR_HEAT, cell, kcalToKj, maxTemperatureRise, namedCount,
  type Adsorbent, type AdsorbentId, type Cite, type Role, type SeparationId,
} from "./adsorbentSelectionData.js";
import { catalogueAdsorbents } from "./adsorbentCatalogue.js";
import {
  ADS_SEL_LIMITS, ADS_SEL_QUIZ, ADS_SEL_STEPS,
} from "./adsorbentSelectionLesson.js";
import { KnobSlider, PanelNote, type PanelKnob } from "./knobPanel.js";
import { LessonLimits, LessonReferences, Tex, lessonStepper } from "./lessonStep.js";
import { LessonQuiz } from "./lessonQuiz.js";
import { OriginMark } from "./origin.js";

const step = lessonStepper(ADS_SEL_STEPS);
const BORDER = "var(--mantine-color-default-border)";

const ROLE_WORD: Record<Role, string> = {
  dominant: "dominant", layer: "layer", named: "named",
};
const ROLE_COLOR: Record<Role, string> = {
  dominant: "teal", layer: "blue", named: "gray",
};

/** y and the heat of adsorption, the two knobs of the temperature-rise sum. */
export const Y_KNOB: PanelKnob = {
  id: "y", label: "adsorbate in the feed gas, y", min: 0.05, max: 5, step: 0.05, unit: "wt%",
  why: "Dilute feeds heat the bed by a degree or two; concentrated ones can heat it by tens.",
};
export const DH_KNOB: PanelKnob = {
  id: "dH", label: "heat of adsorption, |dH|", min: 1000, max: 4000, step: 100, unit: "kJ/kg",
  why: "The range the source gives for common adsorbents; the average is 2500.",
};
/** Wankat takes the feed gas heat capacity as about 1.0 kJ/(kg K). */
export const CP_FEED = 1.0;

/** A page reference, drawn small.  The title holds what is on the page and
 *  the PDF page of the literature folder, so a reader can open it. */
export function CiteMark({ cite }: { cite: Cite }): JSX.Element {
  const s = SOURCES[cite.src];
  return (
    <Text span size="xs" c="dimmed" data-cite={`${cite.src}:${cite.page}`}
      title={`${s.cite} -- p. ${cite.page}, PDF page ${cite.pdfPage} of ${s.file}: ${cite.what}`}
      style={{ whiteSpace: "nowrap" }}>
      {" "}[{s.short} p. {cite.page}]
    </Text>
  );
}

function PanTable({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }}>
      <Table striped withTableBorder withColumnBorders fz="xs" mt={6}>
        {children}
      </Table>
    </Box>
  );
}

const range = (r: [number, number]): string =>
  (r[0] === r[1] ? String(r[0]) : `${r[0]}-${r[1]}`);

/** The not-printed state of a cell, said in words. */
function NotInSources(): JSX.Element {
  return <Text span size="xs" c="dimmed">not in the cited sources</Text>;
}

function HeatCell({ a }: { a: Adsorbent }): JSX.Element {
  if (a.heats.length === 0) return <NotInSources />;
  return (
    <>
      {a.heats.map((h) => (
        <Text key={h.sorbate} size="xs" data-heat={`${a.id}:${h.sorbate}`}>
          {h.sorbate} {h.kcalPerMol} kcal/mol ({kcalToKj(h.kcalPerMol).toFixed(1)} kJ/mol)
          <CiteMark cite={h.cite} />
        </Text>
      ))}
    </>
  );
}

function AdsorbentTable(): JSX.Element {
  return (
    <PanTable>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>adsorbent</Table.Th>
          <Table.Th>pore, nm</Table.Th>
          <Table.Th>polarity</Table.Th>
          <Table.Th>heat of adsorption, printed</Table.Th>
          <Table.Th>TSA reactivation, deg C</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {ADSORBENTS.map((a) => (
          <Table.Tr key={a.id} data-adsorbent={a.id}>
            <Table.Td style={{ verticalAlign: "top" }}>
              <Text size="xs" fw={600}>{a.label}</Text>
              <Text size="xs" c="dimmed">{a.family}</Text>
            </Table.Td>
            <Table.Td style={{ verticalAlign: "top" }}>
              <Text size="xs" fw={600}>{range(a.poreNm.value.range)}</Text>
              <CiteMark cite={a.poreNm.cite} />
            </Table.Td>
            <Table.Td style={{ verticalAlign: "top" }}>
              <Badge variant="light" size="sm"
                color={a.polarity.value === "hydrophobic" ? "orange" : "blue"}>
                {a.polarity.value}
              </Badge>
              <CiteMark cite={a.polarity.cite} />
            </Table.Td>
            <Table.Td style={{ verticalAlign: "top" }}><HeatCell a={a} /></Table.Td>
            <Table.Td style={{ verticalAlign: "top" }}>
              {a.reactivationC
                ? (
                  <>
                    <Text size="xs" fw={600}>{range(a.reactivationC.value.range)}</Text>
                    <Text size="xs" c="dimmed">{a.reactivationC.value.of}</Text>
                    <CiteMark cite={a.reactivationC.cite} />
                  </>
                )
                : <NotInSources />}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </PanTable>
  );
}

function AdsorbentDetails(): JSX.Element {
  return (
    <Accordion multiple variant="separated" mt={8} data-adsorbent-details="">
      {ADSORBENTS.map((a) => (
        <Accordion.Item key={a.id} value={a.id} data-detail={a.id}>
          <Accordion.Control>
            <Text size="sm" fw={600}>{a.label}: where the sources differ, density, regeneration</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap={6}>
              <Box>
                <Text size="xs" fw={600}>Pore size, as a second source prints it</Text>
                {a.poreAlt.map((p, i) => (
                  <Text key={i} size="xs">{p.value}<CiteMark cite={p.cite} /></Text>
                ))}
              </Box>
              <Box>
                <Text size="xs" fw={600}>Packed bulk density</Text>
                {a.bulkDensity.map((b, i) => (
                  <Text key={i} size="xs" data-bulk={a.id}>
                    {range(b.value.range)} kg/m3 ({b.value.of})<CiteMark cite={b.cite} />
                  </Text>
                ))}
              </Box>
              <Box>
                <Text size="xs" fw={600}>How it is regenerated, where the pages say</Text>
                {a.regeneration.map((r, i) => (
                  <Text key={i} size="xs">{r.value}<CiteMark cite={r.cite} /></Text>
                ))}
              </Box>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}

/** Wankat's Eq. (17-25) as a sum the student can move. */
function HeatRise(): JSX.Element {
  const [y, setY] = useState(1.0);
  const [dH, setDH] = useState(2500);
  const rise = maxTemperatureRise(y / 100, dH, CP_FEED);
  return (
    <Box mt={8} data-heat-rise="">
      <Title order={5}>How hot does the bed get?</Title>
      <OriginMark of="assumption" note="y and the heat of adsorption are yours to set" />
      <Box mt={6} style={{
        display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
      }}>
        <Stack gap={8} style={{ maxWidth: 320 }}>
          <KnobSlider knob={Y_KNOB} value={y} onChange={setY} showWhy />
          <KnobSlider knob={DH_KNOB} value={dH} onChange={setDH} showWhy />
          <PanelNote>
            The feed gas is taken at C<sub>p,f</sub> = {CP_FEED.toFixed(1)} kJ/(kg K), as the
            source does.
          </PanelNote>
        </Stack>
        <Box>
          <OriginMark of="page" note="Eq. (17-25), redone on this page" />
          <Text size="sm" mt={6}>
            <Tex mode="inline" src={String.raw`\Delta T_{\max} = \frac{${(y / 100).toFixed(4)}\times ${dH}}{${CP_FEED.toFixed(1)}} =`} />
            {" "}<Text span fw={700} data-rise="">{rise.toFixed(rise < 10 ? 2 : 1)} K</Text>
          </Text>
          <Text size="xs" c="dimmed" mt={4}>
            {rise < 2
              ? "Under about 1-2 K the source treats the bed as isothermal."
              : "Above that the source says the temperature wave must be designed for, not ignored."}
            <CiteMark cite={GENERIC_HEAT.cite} />
          </Text>
          <Text size="xs" mt={6}>
            Printed heats of adsorption convert at {KCAL_TO_KJ} kJ per kcal. {ZEOLITE_POLAR_HEAT.value.charAt(0).toUpperCase()
              + ZEOLITE_POLAR_HEAT.value.slice(1)}.
            <CiteMark cite={ZEOLITE_POLAR_HEAT.cite} />
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

function Matrix({ open, setOpen }: {
  open: SeparationId[]; setOpen: (v: SeparationId[]) => void;
}): JSX.Element {
  const toggle = (s: SeparationId): void =>
    setOpen(open.includes(s) ? open.filter((x) => x !== s) : [...open, s]);
  return (
    <Box>
      <OriginMark of="reference" note="each cell is a sentence of a cited page" />
      <PanTable>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>separation</Table.Th>
            {ADSORBENTS.map((a) => <Table.Th key={a.id}>{a.label}</Table.Th>)}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {SEPARATIONS.map((s) => (
            <Table.Tr key={s.id} data-sep-row={s.id}>
              <Table.Td>
                <Button size="compact-xs" variant="subtle" onClick={() => toggle(s.id)}
                  aria-expanded={open.includes(s.id)}>
                  {s.label}
                </Button>
              </Table.Td>
              {ADSORBENTS.map((a) => {
                const c = cell(s.id, a.id);
                return (
                  <Table.Td key={a.id} data-cell={`${s.id}:${a.id}`}
                    style={{ textAlign: "center" }}>
                    {c
                      ? (
                        <Badge variant="light" size="sm" color={ROLE_COLOR[c.role]}
                          style={{ cursor: "pointer" }}
                          onClick={() => toggle(s.id)}>
                          {ROLE_WORD[c.role]}
                        </Badge>
                      )
                      : <Text span size="xs" c="dimmed">&ndash;</Text>}
                  </Table.Td>
                );
              })}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </PanTable>
      <Text size="xs" c="dimmed" mt={4}>
        A dash is a cell no cited page fills. Click a row to read its sentences.
      </Text>
      <Stack gap="xs" mt={8}>
        {SEPARATIONS.map((s) => {
          const cells = MATRIX.filter((c) => c.sep === s.id);
          return (
            <Box key={s.id} data-sep-block={s.id} px="sm" py={8}
              style={{ border: `1px solid ${BORDER}`, borderRadius: 4 }}>
              <Group gap={6} justify="space-between" wrap="nowrap">
                <Text size="sm" fw={600}>{s.label}
                  <Badge ml={6} size="xs" variant="outline" color="gray">{s.phase}</Badge>
                </Text>
                <Button size="compact-xs" variant="default" onClick={() => toggle(s.id)}>
                  {open.includes(s.id) ? "hide" : "read"}
                </Button>
              </Group>
              <Text size="xs" c="dimmed">{s.asks}</Text>
              <Collapse in={open.includes(s.id)}>
                <Stack gap={6} mt={6}>
                  {cells.map((c) => (
                    <Text key={c.ads} size="xs" data-why={`${c.sep}:${c.ads}`}>
                      <Badge size="xs" variant="light" color={ROLE_COLOR[c.role]} mr={4}>
                        {ROLE_WORD[c.role]}
                      </Badge>
                      <b>{ADSORBENTS.find((a) => a.id === c.ads)!.label}.</b> {c.why}
                      <CiteMark cite={c.cite} />
                    </Text>
                  ))}
                  {s.notes.map((n, i) => (
                    <Text key={i} size="xs" c="dimmed" data-note={`${s.id}:${i}`}>
                      Also on the page: {n.value}<CiteMark cite={n.cite} />
                    </Text>
                  ))}
                </Stack>
              </Collapse>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

function CountBars(): JSX.Element {
  const rows = namedCount();
  const top = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Box data-count-bars="">
      <OriginMark of="page" note="a count of the matrix above, not a measurement of use" />
      <Text size="xs" mt={4}>
        Separations, of five, for which a cited page names the adsorbent.
        This is breadth in these readings. It is not tonnes, sales or market
        share: nothing in the four books gives those.
      </Text>
      <Stack gap={4} mt={6}>
        {rows.map((r) => {
          const a = ADSORBENTS.find((x) => x.id === r.id)!;
          return (
            <Group key={r.id} gap={8} wrap="nowrap" data-count={r.id}>
              <Text size="xs" style={{ width: 150, flexShrink: 0 }}>{a.label}</Text>
              <Box style={{
                height: 12, borderRadius: 2, minWidth: 2,
                width: `${(100 * r.count) / top}%`, maxWidth: "55%",
                background: r.count > 0 ? "var(--mantine-color-teal-6)" : "transparent",
              }} />
              <Text size="xs">{r.count}{r.dominantIn > 0 ? ` (dominant in ${r.dominantIn})` : ""}</Text>
            </Group>
          );
        })}
      </Stack>
    </Box>
  );
}

/** The adsorbents the catalogue holds, each opened. */
function Catalogue(): JSX.Element {
  const cat = useMemo(() => catalogueAdsorbents(), []);
  const [shown, setShown] = useState<string | null>(null);
  return (
    <Stack gap="sm" data-catalogue="">
      <OriginMark of="reference" note="records of data/standards/, read as text; marked teachingOnly" />
      {cat.map((c) => {
        const lit = ADSORBENTS.find((a) => a.catalogue === c.identity.name);
        const cases = CASES_USING[c.identity.name] ?? [];
        return (
          <Box key={c.identity.name} px="sm" py={8} data-record={c.identity.name}
            style={{ border: `1px solid ${BORDER}`, borderRadius: 4 }}>
            <Text size="sm" fw={600}>{lit ? lit.label : c.identity.name}
              <Text span size="xs" c="dimmed"> ({c.identity.name}: {c.identity.type})</Text>
            </Text>
            <Text size="xs" data-record-density={c.identity.name}>
              Packed bulk density in the record: <b>{c.identity.rhoBulk} kg/m3</b>.
              {lit && lit.bulkDensity.map((b) => {
                const inside = c.identity.rhoBulk >= b.value.range[0] && c.identity.rhoBulk <= b.value.range[1];
                return (
                  <Text key={b.cite.src} span size="xs" c={inside ? "dimmed" : "orange"}>
                    {" "}{SOURCES[b.cite.src].short}: {range(b.value.range)} kg/m3, the record is {inside ? "inside" : "outside"}.
                  </Text>
                );
              })}
            </Text>
            <PanTable>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>gas</Table.Th><Table.Th>model</Table.Th>
                  <Table.Th>q_max, mol/kg</Table.Th>
                  <Table.Th>record heat, kJ/mol</Table.Th>
                  <Table.Th>book heat for the same pair</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {c.pairs.map((p) => {
                  const book = lit?.heats.find((h) => h.sorbate === p.pair.adsorbate);
                  return (
                    <Table.Tr key={p.pair.adsorbate} data-pair={`${c.identity.name}:${p.pair.adsorbate}`}>
                      <Table.Td>{p.pair.adsorbate}</Table.Td>
                      <Table.Td>{p.pair.model}</Table.Td>
                      <Table.Td>{p.pair.qMax ?? "-"}</Table.Td>
                      <Table.Td>{p.pair.dHads !== null ? (p.pair.dHads / 1000).toFixed(1) : "-"}</Table.Td>
                      <Table.Td>
                        {book
                          ? <>{(-kcalToKj(book.kcalPerMol)).toFixed(1)}<CiteMark cite={book.cite} /></>
                          : <Text span size="xs" c="dimmed">not printed</Text>}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </PanTable>
            <Text size="xs" c="dimmed">
              The pair records are marked {c.pairs[0]?.pair.quality ?? "unstated"}: teaching anchors, not design data.
            </Text>
            <Group gap={6} mt={6}>
              <Button size="compact-xs" variant="default"
                onClick={() => setShown(shown === c.identity.name ? null : c.identity.name)}>
                {shown === c.identity.name ? "hide the record" : `open ${c.path}`}
              </Button>
              {cases.map((k) => (
                <Button key={k.id} size="compact-xs" variant="light"
                  onClick={() => openAppTab(caseTabSearch(k.id))}>
                  open the case {k.id.split("/").pop()}
                </Button>
              ))}
            </Group>
            {cases.map((k) => (
              <Text key={k.id} size="xs" c="dimmed">{k.id.split("/").pop()}: {k.why}.</Text>
            ))}
            {cases.length === 0 && (
              <Text size="xs" c="dimmed" data-no-case={c.identity.name}>
                No tutorial case uses this adsorbent yet; the record and its pair
                records are in the catalogue for a case to name.
              </Text>
            )}
            <Collapse in={shown === c.identity.name}>
              <Box component="pre" mt={6} p="xs" data-record-raw={c.identity.name}
                style={{ fontSize: 11, overflowX: "auto", border: `1px solid ${BORDER}`, borderRadius: 4 }}>
                {c.raw}
              </Box>
            </Collapse>
          </Box>
        );
      })}
      <Text size="xs" c="dimmed">
        The five that have no record are named in the table above and are not in the catalogue:
        {" "}{ADSORBENTS.filter((a) => a.catalogue === null).map((a) => a.label).join(", ")}.
      </Text>
    </Stack>
  );
}

export function AdsorbentSelectionTool(): JSX.Element {
  const [open, setOpen] = useState<SeparationId[]>([]);
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 1080, margin: "0 auto" }}>
        <Box>
          <Title order={4}>Choosing an adsorbent</Title>
          <Text size="sm" c="dimmed" mt={4}>
            You have a separation to make: drying a gas, purifying hydrogen, splitting
            air, recovering a solvent, treating water. Which of the common industrial
            adsorbents does a cited page name for it, and why?
          </Text>
        </Box>

        {step(1)}
        {step(2)}
        <OriginMark of="reference" note="every value beside its page; PDF page in the tooltip" />
        <AdsorbentTable />
        <AdsorbentDetails />

        {step(3)}
        <HeatRise />

        {step(4)}
        <Matrix open={open} setOpen={setOpen} />

        {step(5)}
        <CountBars />

        {step(6)}
        <Catalogue />

        <LessonQuiz title="Check your understanding" questions={ADS_SEL_QUIZ}
          lesson={ADS_SEL_STEPS} />

        <LessonLimits limits={ADS_SEL_LIMITS} />

        <LessonReferences tool="adsorbent-selection" />
      </Stack>
    </Box>
  );
}

export default AdsorbentSelectionTool;

export type { AdsorbentId };
