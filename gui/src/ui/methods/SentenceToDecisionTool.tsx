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
  SentenceToDecisionTool -- "From a sentence to a decision" (DEV.md 4c C127).

  THE STUDENT'S TASK, in one sentence: "I was asked to fit a model for my
  mixture and to say whether it can be used for my process; what do I do, in
  what order, and what do I conclude from what the screen shows?"  So the page
  walks ONE worked example, six pages, and every page shows an artefact of the
  tree: the files the case reads, the case's own declaration, the engine's
  tables, the catalogue record the fit became.  Nothing is invented and
  nothing is fitted here.

  WHERE EACH NUMBER COMES FROM (the origin marks say it on the page):
    * the two measured series, the propsDict, the golden and the catalogue
      record are the files themselves (sentenceToDecisionData.ts imports them);
    * the per-point residuals are the ENGINE's tables of the shipped case, run
      in the browser the first time page 3 opens (the same case, not a copy);
    * the page's own arithmetic is the ratio of a residual to the point's
      stated uncertainty and the root-mean-square of a group of residuals, and
      it is marked `page`.

  The Explorer's Evidence view draws the same measured points against every
  candidate model; this page is about how a fit and its test are organised,
  and it links there rather than copying it.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Alert, Anchor, Badge, Box, Button, Checkbox, Group, Loader, SegmentedControl, Select, Stack,
  Table, Text, Textarea, Title,
} from "@mantine/core";

import { useMethodRun } from "../../case/methodRun.js";
import { LessonLimits, LessonReferences, lessonStepper } from "./lessonStep.js";
import { LessonQuiz } from "./lessonQuiz.js";
import { OriginMark } from "./origin.js";
import { setActiveMethodTool } from "./registry.js";
import {
  ATM_KPA, FIT_FILE, FIT_SERIES, GOLDEN_FILE, HELD_FILE, HELD_SERIES, PROPS_DICT,
  PROPS_FILE, RECORD_FILE, RECORD_PARSED, REQUEST_P_KPA, aadOf, byIsobar, fitPoints, golden,
  goldenAad, heldPoints, independenceOf, parseBand, parseEvidenceDecl, rmsOf, type Pt, type Series,
} from "./sentenceToDecisionData.js";
import { SD_LIMITS, SD_QUIZ, SD_STEPS } from "./sentenceToDecisionLesson.js";

const step = lessonStepper(SD_STEPS, { foldSymbols: true });

/** The shipped case, as the bundled corpus names it. */
export const SD_WITNESS = "props/curation/curate04_nrtl_methanol_water";

const BORDER = "var(--mantine-color-default-border)";
const DIM = "var(--mantine-color-dimmed)";
const FIT_INK = "#868e96";
const HELD_INK = "#ef6c00";

const f = (v: number, d = 2): string => (Number.isFinite(v) ? v.toFixed(d) : "—");

/** The 1-based line of the first line of `text`, at or after `from`, that
 *  contains `frag`.  The page names lines of a file it has just read, so the
 *  line can never be stale. */
export function lineOf(text: string, frag: string, from = 1): number {
  const ls = text.split("\n");
  for (let i = from - 1; i < ls.length; i++) if (ls[i]!.includes(frag)) return i + 1;
  return -1;
}

const FIT_OP_LINE = lineOf(PROPS_DICT, "name        fit_nrtl;");

function PanTable({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }}>
      <Table striped withTableBorder withColumnBorders fz="xs" mt={6}>{children}</Table>
    </Box>
  );
}

// ---- the figure: residual against a condition, fit and held out distinct ------

/** Residual (engine minus measurement, K) against x or against pressure.  Fit
 *  points are filled grey circles, held-out points open orange diamonds with a
 *  bar of the point's own stated uncertainty: two roles, two shapes and two
 *  colours, so a reader never has to guess which is which. */
export function ResidualFigure({ fit, held, against, title }: {
  fit: readonly Pt[]; held: readonly Pt[]; against: "x" | "P"; title: string;
}): JSX.Element {
  const W = 620, H = 250, L = 52, R = 12, T = 22, B = 40;
  const all = [...fit, ...held];
  const xs = all.map((p) => (against === "x" ? p.x : p.P));
  const xmin = against === "x" ? 0 : Math.min(...xs) - 4;
  const xmax = against === "x" ? 1 : Math.max(...xs) + 4;
  const ext = Math.max(1, ...all.map((p) => Math.abs(p.res) + (p.role === "heldOut" ? p.U : 0)));
  const ylim = Math.ceil(ext);
  const X = (v: number): number => L + ((v - xmin) / (xmax - xmin)) * (W - L - R);
  const Y = (v: number): number => T + ((ylim - v) / (2 * ylim)) * (H - T - B);
  const xt = against === "x" ? [0, 0.2, 0.4, 0.6, 0.8, 1] : [20, 40, 60, 80, 100];
  return (
    <Box data-figure={against} style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} style={{ width: "100%", height: "auto" }}>
        <text x={L} y={14} fontSize={11} fill="currentColor">{title}</text>
        <line x1={L} y1={Y(0)} x2={W - R} y2={Y(0)} stroke={DIM} strokeDasharray="4 3" />
        <line x1={L} y1={T} x2={L} y2={H - B} stroke={DIM} />
        {[-ylim, 0, ylim].map((v) => (
          <g key={v}><text x={L - 6} y={Y(v) + 4} fontSize={10} textAnchor="end" fill="currentColor">{v}</text></g>
        ))}
        {xt.map((v) => (
          <g key={v}>
            <line x1={X(v)} y1={H - B} x2={X(v)} y2={H - B + 4} stroke={DIM} />
            <text x={X(v)} y={H - B + 16} fontSize={10} textAnchor="middle" fill="currentColor">{v}</text>
          </g>
        ))}
        <text x={(L + W - R) / 2} y={H - 6} fontSize={11} textAnchor="middle" fill="currentColor">
          {against === "x" ? "x, methanol liquid mole fraction" : "pressure, kPa"}
        </text>
        <text x={12} y={(T + H - B) / 2} fontSize={11} textAnchor="middle" fill="currentColor"
          transform={`rotate(-90 12 ${(T + H - B) / 2})`}>residual, K</text>
        {fit.map((p, i) => (
          <circle key={`f${i}`} data-role="fit" cx={X(against === "x" ? p.x : p.P)} cy={Y(p.res)} r={3}
            fill={FIT_INK} fillOpacity={0.55} stroke={FIT_INK} />
        ))}
        {held.map((p, i) => {
          const cx = X(against === "x" ? p.x : p.P), cy = Y(p.res);
          return (
            <g key={`h${i}`} data-role="heldOut">
              <line x1={cx} y1={Y(p.res - p.U)} x2={cx} y2={Y(p.res + p.U)} stroke={HELD_INK} />
              <path d={`M${cx} ${cy - 5} L${cx + 5} ${cy} L${cx} ${cy + 5} L${cx - 5} ${cy} Z`}
                fill="none" stroke={HELD_INK} strokeWidth={1.6} />
            </g>
          );
        })}
        <g transform={`translate(${W - 190} ${T + 4})`}>
          <circle cx={6} cy={0} r={3} fill={FIT_INK} fillOpacity={0.55} stroke={FIT_INK} />
          <text x={16} y={4} fontSize={10} fill="currentColor">fitted points</text>
          <path d="M96 -5 L101 0 L96 5 L91 0 Z" fill="none" stroke={HELD_INK} strokeWidth={1.6} />
          <text x={108} y={4} fontSize={10} fill="currentColor">held-out points</text>
        </g>
      </svg>
    </Box>
  );
}

/** The pressure axis: what was asked, what the fit evidence spans, and where
 *  the held-out series lies.  Pure drawing of numbers read from the files. */
export function CoverageFigure(): JSX.Element {
  const W = 620, H = 150, L = 20, R = 20;
  const vmin = 0, vmax = 110;
  const X = (v: number): number => L + ((v - vmin) / (vmax - vmin)) * (W - L - R);
  const val = RECORD_PARSED.validity;
  const heldP = HELD_SERIES.heldPressureKPa ?? HELD_SERIES.P[0]!;
  const isobars = [...new Set(FIT_SERIES.P.map((p) => p.toFixed(2)))].map(Number);
  return (
    <Box data-figure="coverage" style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pressure covered by the request, the fit and the held-out series"
        style={{ width: "100%", height: "auto" }}>
        <rect x={X(REQUEST_P_KPA[0])} y={12} width={X(REQUEST_P_KPA[1]) - X(REQUEST_P_KPA[0])} height={22}
          fill="#1e88e5" fillOpacity={0.25} stroke="#1e88e5" />
        <text x={X(REQUEST_P_KPA[0]) + 4} y={27} fontSize={11} fill="currentColor">the request</text>
        <rect x={X(val.PminPa / 1000)} y={46} width={X(val.PmaxPa / 1000) - X(val.PminPa / 1000)} height={22}
          fill={FIT_INK} fillOpacity={0.25} stroke={FIT_INK} />
        <text x={X(val.PminPa / 1000) + 4} y={61} fontSize={11} fill="currentColor">fit evidence (the record's validity)</text>
        {isobars.map((p) => <circle key={p} cx={X(p)} cy={86} r={3.5} fill={FIT_INK} fillOpacity={0.6} stroke={FIT_INK} />)}
        <text x={L} y={104} fontSize={10} fill="currentColor">fitted isobars</text>
        <path d={`M${X(heldP)} 108 l6 8 l-6 8 l-6 -8 Z`} fill="none" stroke={HELD_INK} strokeWidth={1.8} />
        <text x={X(heldP) - 10} y={138} fontSize={10} textAnchor="end" fill="currentColor">held-out series</text>
        <line x1={L} y1={H - 2} x2={W - R} y2={H - 2} stroke={DIM} />
        {[0, 20, 40, 60, 80, 100].map((v) => (
          <text key={v} x={X(v)} y={H - 6} fontSize={10} textAnchor="middle" fill="currentColor" dy={-4}>{v}</text>
        ))}
      </svg>
      <Text size="xs" c="dimmed">pressure, kPa</Text>
    </Box>
  );
}

// ---- the engine's tables ------------------------------------------------------

const pick = (files: { [k: string]: string } | undefined, name: string, exact: boolean): string => {
  const e = Object.entries(files ?? {});
  return (exact ? e.find(([k]) => k === name) : e.find(([k]) => k === name || k.endsWith(`/${name}`)))?.[1] ?? "";
};

export interface EngineTables { parity: string; residuals: string }

/** Read the two tables from a run's CSV files, or null while there are none. */
export function tablesOf(files: { [k: string]: string } | undefined): EngineTables | null {
  const parity = pick(files, "parity.csv", true);
  const residuals = pick(files, "postProcessing/fit_nrtl/residuals.csv", false);
  return parity && residuals ? { parity, residuals } : null;
}

// ---- the pages ------------------------------------------------------------------

const SENTENCE = "Fit NRTL for methanol-water at 1 atm and tell me if I can use it for a column at 0.5-1 atm.";

export function RequestPage(): JSX.Element {
  const band = parseBand(PROPS_DICT);
  const L = (frag: string): number => lineOf(PROPS_DICT, frag, FIT_OP_LINE);
  const rows: { words: string; becomes: string; where: string }[] = [
    { words: "fit NRTL", becomes: "two free parameters, the temperature parts b of the pair; the constant parts and alpha stay fixed",
      where: `${PROPS_FILE}:${L("binaryParameters.methanol-water.b_ij")}` },
    { words: "for methanol-water", becomes: "the pair the parameters belong to, named in the path of each parameter",
      where: `${PROPS_FILE}:${L("binaryParameters.methanol-water.b_ji")}` },
    { words: "at 1 atm", becomes: "a measured property at a held pressure: the temperature at which the liquid boils, the residual kind",
      where: `${PROPS_FILE}:${L("kind        T_bubble")}` },
    { words: "tell me if I can use it", becomes: "a test on data the fit never saw: the second file carries the role validation, and a band is written before the fit",
      where: `${PROPS_FILE}:${L("role     validation")}, :${L("maxAAD")} (${band.value} ${band.unit})` },
    { words: "for a column at 0.5-1 atm", becomes: `a range to compare with what was tested: ${f(REQUEST_P_KPA[0], 1)} to ${f(REQUEST_P_KPA[1], 1)} kPa (1 atm = ${ATM_KPA} kPa)`,
      where: "pages 4 and 5" },
  ];
  return (
    <Stack gap="xs" data-page="1">
      <Box px="sm" py={8} style={{ border: `1px solid ${BORDER}`, borderRadius: 4 }} data-sentence="">
        <Text size="xs" c="dimmed" tt="uppercase">the request, as it arrives</Text>
        <Text size="md" fs="italic" mt={2}>&ldquo;{SENTENCE}&rdquo;</Text>
      </Box>
      <OriginMark of={["reference", "page"]}
        note={`the right-hand column is read from ${PROPS_FILE} (the lines are found in the file, not typed)`} />
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th>the words</Table.Th><Table.Th>what the engine needs</Table.Th><Table.Th>where the case says it</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r) => (
            <Table.Tr key={r.words} data-sentence-row={r.words}>
              <Table.Td><b>{r.words}</b></Table.Td>
              <Table.Td>{r.becomes}</Table.Td>
              <Table.Td><Text size="xs" ff="monospace" style={{ overflowWrap: "anywhere" }}>{r.where}</Text></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </PanTable>
      <Text size="sm">
        Notice what the sentence did not say: which data, from where, and what counts as good enough. The
        next pages fill each of those in, and the last one asks you to write the decision.
      </Text>
    </Stack>
  );
}

function SeriesColumn({ s, role, file }: { s: Series; role: string; file: string }): JSX.Element {
  const show = s.x.map((_, i) => i).slice(0, 5);
  const span = (a: number[]): string => `${f(Math.min(...a), 3)} to ${f(Math.max(...a), 3)}`;
  return (
    <Box data-series={role} style={{ border: `1px solid ${BORDER}`, borderRadius: 4, padding: 8, minWidth: 0 }}>
      <Group gap={6}>
        <Badge color={role === "fit" ? "gray" : "orange"} variant="light">{role === "fit" ? "role: fit" : "role: validation (held out)"}</Badge>
        <Text size="xs" ff="monospace" style={{ overflowWrap: "anywhere" }}>{file}</Text>
      </Group>
      <Text size="sm" mt={6}>{s.citation}</Text>
      <PanTable>
        <Table.Tbody>
          <Table.Tr><Table.Td>doi</Table.Td><Table.Td>
            <Anchor href={`https://doi.org/${s.doi}`} target="_blank" rel="noopener noreferrer" size="xs">{s.doi}</Anchor></Table.Td></Table.Tr>
          <Table.Tr><Table.Td>archive file, block</Table.Td><Table.Td>{s.archiveFile}, block {s.block}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>sha256 of that archive file</Table.Td><Table.Td><Text size="xs" ff="monospace" style={{ overflowWrap: "anywhere" }}>{s.sha256}</Text></Table.Td></Table.Tr>
          <Table.Tr><Table.Td>points</Table.Td><Table.Td>{s.x.length}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>pressure, kPa</Table.Td><Table.Td>{span(s.P)}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>temperature, K</Table.Td><Table.Td>{span(s.T)}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>x of methanol</Table.Td><Table.Td>{span(s.x)}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>stated uncertainty, K ({s.uncertaintyKind}, {s.uncertaintyLevel} % level)</Table.Td><Table.Td>{span(s.U)}, per point</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>compounds</Table.Td><Table.Td>methanol CAS {s.cas.methanol}; water CAS {s.cas.water}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>review status</Table.Td><Table.Td><Text size="xs" ff="monospace">{s.reviewStatus}</Text></Table.Td></Table.Tr>
        </Table.Tbody>
      </PanTable>
      <PanTable>
        <Table.Thead><Table.Tr><Table.Th>x</Table.Th><Table.Th>P, kPa</Table.Th><Table.Th>T, K</Table.Th><Table.Th>U, K</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>
          {show.map((i) => (
            <Table.Tr key={i}><Table.Td>{f(s.x[i]!, 4)}</Table.Td><Table.Td>{f(s.P[i]!)}</Table.Td><Table.Td>{f(s.T[i]!)}</Table.Td><Table.Td>{f(s.U[i]!)}</Table.Td></Table.Tr>
          ))}
          <Table.Tr><Table.Td colSpan={4}><Text size="xs" c="dimmed">first {show.length} of {s.x.length} rows</Text></Table.Td></Table.Tr>
        </Table.Tbody>
      </PanTable>
    </Box>
  );
}

export function DataPage(): JSX.Element {
  const decl = parseEvidenceDecl(PROPS_DICT);
  const roleOf = (file: string): string => decl.find((d) => file.endsWith(d.dataset))?.role ?? "?";
  return (
    <Stack gap="xs" data-page="2">
      <OriginMark of="reference" note={`the two files are read as shipped; each says which article and archive block it was transcribed from`} />
      <Group align="flex-start" grow wrap="wrap" gap="sm">
        <SeriesColumn s={FIT_SERIES} role={roleOf(FIT_FILE)} file={FIT_FILE} />
        <SeriesColumn s={HELD_SERIES} role={roleOf(HELD_FILE) === "validation" ? "validation" : roleOf(HELD_FILE)} file={HELD_FILE} />
      </Group>
      <Alert color="yellow" variant="light" title="Read this before you trust either column">
        Both files say <b>{FIT_SERIES.reviewStatus}</b>: the values were taken from the archive and nobody has read them back
        against the printed article. The role of each file is not in the file: it is declared by the operation, before the fit, in{" "}
        <Text span ff="monospace" size="sm">{PROPS_FILE}:{lineOf(PROPS_DICT, "role     fit", FIT_OP_LINE)}</Text>.
      </Alert>
    </Stack>
  );
}

function CodeExcerpt({ text, from, to }: { text: string; from: number; to: number }): JSX.Element {
  const ls = text.split("\n").slice(from - 1, to);
  return (
    <Box data-excerpt="" style={{ border: `1px solid ${BORDER}`, borderRadius: 4, overflowX: "auto" }} p={6}>
      <pre style={{ margin: 0, fontSize: 11, lineHeight: 1.35 }}>
        {ls.map((l, i) => `${String(from + i).padStart(4)}  ${l}`).join("\n")}
      </pre>
    </Box>
  );
}

function RunNote({ busy, err, have }: { busy: boolean; err: string | null; have: boolean }): JSX.Element | null {
  if (have) return null;
  if (busy) return <Group gap={6}><Loader size="xs" /><Text size="sm">Running the shipped case in your browser…</Text></Group>;
  if (err) return <Alert color="red" variant="light" title="The engine could not be run here">{err} The numbers from the golden above are still the engine&apos;s; only the per-point residuals need the run.</Alert>;
  return <Text size="sm" c="dimmed">The per-point residuals appear when the shipped case has run in your browser.</Text>;
}

export function FitPage({ tables, busy, err }: { tables: EngineTables | null; busy: boolean; err: string | null }): JSX.Element {
  const band = parseBand(PROPS_DICT);
  const end = lineOf(PROPS_DICT, "weighting   uncertainty;", FIT_OP_LINE) + 1;
  const rec = RECORD_PARSED;
  const fit = useMemo(() => (tables ? fitPoints(tables.parity, FIT_SERIES) : null), [tables]);
  const g = (k: string): number => golden("fit_nrtl", k);
  return (
    <Stack gap="xs" data-page="3">
      <Text size="sm" fw={600}>What the case declares before it fits anything</Text>
      <OriginMark of="reference" note={`${PROPS_FILE}:${FIT_OP_LINE}-${end}, shown as written`} />
      <CodeExcerpt text={PROPS_DICT} from={FIT_OP_LINE} to={end} />
      <Text size="sm">
        Two rows of the declaration carry the whole idea: the file with <b>role fit</b> is what the parameters are adjusted to, and the file
        with <b>role validation</b> is only compared with afterwards. The band is{" "}
        <b>{band.value} {band.unit}</b> of the measured temperature, and its rule is written beside it: the held-out set&apos;s own stated
        uncertainty plus the vapour-pressure model&apos;s own error at the pure ends, so a model is not asked to be better than the
        measurement. The declaration is frozen in a fingerprint, <Text span ff="monospace" size="sm">{rec.fingerprint}</Text>.
      </Text>
      <Text size="sm" fw={600} mt="xs">What the fit found</Text>
      <OriginMark of={["engine", "reference"]} note={`the case's golden (${GOLDEN_FILE}) and the catalogue record (${RECORD_FILE}) it became`} />
      <PanTable>
        <Table.Tbody>
          <Table.Tr><Table.Td>b_ij, b_ji, K</Table.Td><Table.Td data-fit-b="">{f(rec.b_ij)} and {f(rec.b_ji)}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>points fitted, parameters</Table.Td><Table.Td>{g("n_data")}, {g("n_params")} (degrees of freedom {g("dof")})</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>in-sample rms residual, K</Table.Td><Table.Td data-fit-rms="">{f(g("rms"), 3)}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>weighted chi-square, per degree of freedom</Table.Td><Table.Td>{f(g("chi2"), 1)}, {f(g("chi2_reduced"), 2)}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>parameters identifiable from these data</Table.Td><Table.Td>{g("identifiable") === 1 ? "yes" : "no"} (largest correlation {f(g("max_abs_corr"), 3)})</Table.Td></Table.Tr>
        </Table.Tbody>
      </PanTable>
      <Text size="sm">
        These are <b>in-sample</b>: the model reproducing the very points it was fitted to. A small rms here says the equation can bend to
        the data, and says nothing yet about data it has not seen.
      </Text>
      {fit ? (
        <>
          <OriginMark of="engine" note="the engine's own residual table of the shipped case, run in this browser; the figure only draws it" />
          <ResidualFigure fit={fit} held={[]} against="x" title="in-sample residuals of the 54 fitted points" />
          <Text size="xs" c="dimmed">
            The largest in-sample miss is {f(Math.max(...fit.map((p) => Math.abs(p.res))))} K; the point with the stated uncertainty of{" "}
            {f(Math.max(...FIT_SERIES.U))} K is the one the fit was told to trust least.
          </Text>
        </>
      ) : <RunNote busy={busy} err={err} have={false} />}
    </Stack>
  );
}

export function HeldOutPage({ tables, busy, err }: { tables: EngineTables | null; busy: boolean; err: string | null }): JSX.Element {
  const decl = parseEvidenceDecl(PROPS_DICT);
  const indep = independenceOf(FIT_SERIES, HELD_SERIES, decl);
  const pts = useMemo(() => (tables
    ? { fit: fitPoints(tables.parity, FIT_SERIES), held: heldPoints(tables.residuals, HELD_SERIES) } : null), [tables]);
  const band = parseBand(PROPS_DICT);
  return (
    <Stack gap="xs" data-page="4">
      <Box px="sm" py={6} style={{ border: `1px solid ${BORDER}`, borderRadius: 4 }} data-independence={indep.level}>
        <Text size="xs" c="dimmed" tt="uppercase">how independent is the test?</Text>
        <Text size="sm" mt={2}>
          <b>{indep.level === "anotherStudy" ? "Another study." : indep.level === "splitOfOneStudy" ? "A split of one study." : "Not stated."}</b>{" "}
          The case declares {indep.words}. The engine settles only the part a machine can: it stops a run that puts the same evidence in both roles, and
          announces the identity facts it sees. Whether two laboratories are scientifically independent stays a human judgement.
        </Text>
      </Box>
      {pts ? (
        <>
          <OriginMark of={["engine", "page"]} note="residual = engine value minus measurement, in kelvin; bars are each held-out point's own stated uncertainty" />
          <ResidualFigure fit={pts.fit} held={pts.held} against="x" title="residual against composition, fit and held out" />
          <ResidualFigure fit={pts.fit} held={pts.held} against="P" title="residual against pressure, fit and held out" />
          <Text size="sm" data-aad="">
            Held-out error: <b>{f(aadOf(pts.held).K, 3)} K</b>, which is <b>{f(aadOf(pts.held).pct, 3)} %</b> of the measured temperature,
            against a band of {band.value} {band.unit}. The first number is in kelvin because a column is designed in kelvin; the second
            is the unit the band is written in.
          </Text>
          <PanTable>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>x</Table.Th><Table.Th>measured T, K</Table.Th><Table.Th>engine T, K</Table.Th>
                <Table.Th>residual, K</Table.Th><Table.Th>stated U, K</Table.Th><Table.Th>|residual| / U</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pts.held.map((p, i) => (
                <Table.Tr key={i} data-held-row={i} style={Math.abs(p.res) / p.U > 3 ? { fontWeight: 600 } : undefined}>
                  <Table.Td>{f(p.x, 3)}</Table.Td><Table.Td>{f(p.T)}</Table.Td><Table.Td>{f(p.calc)}</Table.Td>
                  <Table.Td>{f(p.res, 3)}</Table.Td><Table.Td>{f(p.U)}</Table.Td><Table.Td>{f(Math.abs(p.res) / p.U, 1)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </PanTable>
          <OriginMark of="page" note="the last column is the page's own division of the engine's residual by the file's stated uncertainty" />
          <WorstRegion held={pts.held} />
        </>
      ) : <RunNote busy={busy} err={err} have={false} />}
    </Stack>
  );
}

/** The region the average hides: the held-out points whose residual exceeds
 *  three times their own stated uncertainty, named by composition. */
export function WorstRegion({ held }: { held: readonly Pt[] }): JSX.Element {
  const bad = held.filter((p) => Math.abs(p.res) / p.U > 3);
  const aad = aadOf(held);
  return (
    <Alert color="orange" variant="light" title="One average can hide a badly represented region" data-worst="">
      {bad.length === 0
        ? <>No held-out point misses by more than three times its own stated uncertainty.</>
        : <>
            {bad.length} of {held.length} held-out points miss by more than three times their own stated uncertainty, all at
            x of methanol from {f(Math.min(...bad.map((p) => p.x)), 3)} to {f(Math.max(...bad.map((p) => p.x)), 3)}, by{" "}
            {f(Math.min(...bad.map((p) => Math.abs(p.res))))} to {f(Math.max(...bad.map((p) => Math.abs(p.res))))} K, against a mean of{" "}
            {f(aad.K, 2)} K over all {held.length}. The average passes; that composition range is not well represented.
          </>}
    </Alert>
  );
}

export function VerdictPage({ tables }: { tables: EngineTables | null }): JSX.Element {
  const rec = RECORD_PARSED;
  const v = rec.validity;
  const held = useMemo(() => (tables ? heldPoints(tables.residuals, HELD_SERIES) : null), [tables]);
  const fit = useMemo(() => (tables ? fitPoints(tables.parity, FIT_SERIES) : null), [tables]);
  const heldP = HELD_SERIES.heldPressureKPa ?? HELD_SERIES.P[0]!;
  const inRequest = fit ? byIsobar(fit).filter((g) => g.P >= REQUEST_P_KPA[0] && g.P <= REQUEST_P_KPA[1]) : [];
  const unifacK = goldenAad("heldout_methanol_water", "txy_unifac.T_bubble.aadAbs");
  const nrtlK = goldenAad("heldout_methanol_water", "txy_nrtl.T_bubble.aadAbs");
  const yAad = goldenAad("heldout_methanol_water", "txy_nrtl.y_eq_methanol.aadAbs");
  return (
    <Stack gap="xs" data-page="5">
      <OriginMark of={["reference", "engine"]} note={`the verdict, its test set and the validity span are read from ${RECORD_FILE}`} />
      <PanTable>
        <Table.Tbody>
          <Table.Tr data-verdict={rec.verdict}><Table.Td>verdict</Table.Td><Table.Td><b>{rec.verdict}</b></Table.Td></Table.Tr>
          <Table.Tr><Table.Td>test set</Table.Td><Table.Td>{rec.heldOut.points} held-out points, one isobar at {f(heldP, 2)} kPa, x of methanol from {f(rec.heldOut.x1[0], 3)} to {f(rec.heldOut.x1[1], 3)}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>property tested</Table.Td><Table.Td>bubble temperature, T_bubble</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>held-out error</Table.Td><Table.Td>{f(rec.heldOut.aad_K, 3)} K, {f(rec.heldOut.aad_pct, 3)} % of the measured temperature</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>band declared before the fit</Table.Td><Table.Td>{f(rec.maxAAD_pct, 2)} %</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>validity (span of the FIT evidence)</Table.Td><Table.Td>{f(v.Tmin, 1)} to {f(v.Tmax, 1)} K, {f(v.PminPa / 1000, 2)} to {f(v.PmaxPa / 1000, 2)} kPa</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>review status of the record</Table.Td><Table.Td><Text size="xs" ff="monospace">{rec.reviewStatus}</Text></Table.Td></Table.Tr>
        </Table.Tbody>
      </PanTable>
      <Box px="sm" py={8} style={{ border: `1px solid ${BORDER}`, borderRadius: 4 }} data-reading="">
        <Text size="xs" c="dimmed" tt="uppercase">the verdict, read in context</Text>
        <Text size="sm" mt={2}>
          The pair <b>meets the criterion for this test set</b> ({rec.heldOut.points} points from {HELD_SERIES.doi}), <b>this range</b>{" "}
          (x of methanol {f(rec.heldOut.x1[0], 3)} to {f(rec.heldOut.x1[1], 3)} at {f(heldP, 2)} kPa) and <b>this property</b> (bubble temperature):
          {" "}{f(rec.heldOut.aad_pct, 3)} % against {f(rec.maxAAD_pct, 2)} %.
        </Text>
      </Box>
      <OriginMark of="page" note="the three bars are the request, the record's validity and the held-out series, drawn from the numbers above" />
      <CoverageFigure />
      <Text size="sm" fw={600}>What the verdict does not say</Text>
      <Box component="ul" pl={20} m={0} data-limits="">
        <li>
          <b>The request reaches below the test.</b> The request spans {f(REQUEST_P_KPA[0], 1)} to {f(REQUEST_P_KPA[1], 1)} kPa; the held-out
          series is at one pressure, {f(heldP, 2)} kPa, which is above the highest fitted isobar ({f(v.PmaxPa / 1000, 2)} kPa), so it lies
          just outside the record&apos;s own validity span. The part of the request below it is covered only by fitted points, which
          are in-sample{inRequest.length ? ` (${inRequest.map((g) => `${f(g.P, 2)} kPa: rms ${f(rmsOf(g.pts), 2)} K`).join("; ")})` : ""}.
        </li>
        <li>
          <b>The property tested is the temperature.</b> A column also needs the vapour composition. The case compares it with the held-out
          data and publishes {f(yAad, 4)} (mole fraction, mean absolute), but declares no band for it: a comparison, not a validation.
        </li>
        <li>
          <b>Validated is not best.</b> On the same held-out points the predictive UNIFAC model errs {f(unifacK, 3)} K and the
          fitted pair {f(nrtlK, 3)} K. Both statements are true.
        </li>
        {held && (
          <li data-worst-note="">
            <b>The average hides a region.</b> {f(Math.max(...held.map((p) => Math.abs(p.res))))} K is the largest single held-out miss,
            against a mean of {f(aadOf(held).K, 2)} K (page 4).
          </li>
        )}
        <li>
          <b>Nobody has read the data back against the articles.</b> The record says <i>{rec.reviewStatus}</i>, and both series say{" "}
          <i>{FIT_SERIES.reviewStatus}</i>.
        </li>
      </Box>
    </Stack>
  );
}

const STANCES = [
  { value: "accept", label: "Accept for the whole 0.5-1 atm range" },
  { value: "restricted", label: "Accept for a restricted range, and say which" },
  { value: "reject", label: "Reject: the evidence falls short of the request" },
  { value: "more", label: "Ask for more evidence, and say which" },
];

const CHECKS = [
  "the test set it rests on (which points, from which article, at which pressure)",
  "the property it was tested on (bubble temperature, not vapour composition)",
  "the range the test touches, and the range of the request it does not",
  "the criterion it was held to, and that the criterion was declared before the fit",
  "how independent the test is of the fit",
  "the region where the model does worst",
];

export function DecisionPage({ tables }: { tables: EngineTables | null }): JSX.Element {
  const [stance, setStance] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [ticked, setTicked] = useState<string[]>([]);
  const rec = RECORD_PARSED;
  const heldP = HELD_SERIES.heldPressureKPa ?? HELD_SERIES.P[0]!;
  const held = tables ? heldPoints(tables.residuals, HELD_SERIES) : null;
  const bad = held ? held.filter((p) => Math.abs(p.res) / p.U > 3) : [];
  const answer =
    `Accept for ${f(heldP, 1)} kPa and the composition range ${f(rec.heldOut.x1[0], 3)} to ${f(rec.heldOut.x1[1], 3)}, for the bubble `
    + `temperature: ${rec.heldOut.points} held-out points from another study (${HELD_SERIES.doi}) gave ${f(rec.heldOut.aad_pct, 3)} % `
    + `(${f(rec.heldOut.aad_K, 2)} K) against a band of ${f(rec.maxAAD_pct, 2)} % declared before the fit. `
    + `Below ${f(rec.validity.PmaxPa / 1000, 1)} kPa the pair rests on fitted points only, and the vapour composition carries no declared band; `
    + (bad.length ? `x of methanol near ${f(Math.min(...bad.map((p) => p.x)), 2)} to ${f(Math.max(...bad.map((p) => p.x)), 2)} is poorly represented. ` : "")
    + `The data are transcribed, not checked against the articles.`;
  return (
    <Stack gap="xs" data-page="6">
      <Text size="sm">Write the decision as you would send it to the engineer who asked. Nothing you type leaves this page.</Text>
      <Select label="Your decision" data={STANCES} value={stance} onChange={setStance} placeholder="choose one" allowDeselect={false} />
      <Textarea label="The sentence you would sign" minRows={4} autosize value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        placeholder="e.g. I accept the pair for ... because ..." />
      <Box>
        <Text size="sm" fw={600}>Does it name</Text>
        {CHECKS.map((c) => (
          <Checkbox key={c} size="xs" mt={4} label={c} checked={ticked.includes(c)}
            onChange={(e) => setTicked(e.currentTarget.checked ? [...ticked, c] : ticked.filter((x) => x !== c))} />
        ))}
        <Text size="xs" c="dimmed" mt={4} data-ticked="">{ticked.length} of {CHECKS.length} named</Text>
      </Box>
      <Box px="sm" py={8} style={{ border: `1px solid ${BORDER}`, borderRadius: 4 }} data-model-answer="">
        <Text size="xs" c="dimmed" tt="uppercase">one defensible decision, built from the files</Text>
        <OriginMark of={["reference", "page"]} note="every number is read from the record and the engine's tables; your own may be more or less cautious" />
        <Text size="sm" mt={4}>{answer}</Text>
      </Box>
      <Text size="sm">
        The files do not force this sentence: a more cautious reader rejects the part of the range the test does not touch, and a less
        cautious one accepts it on the strength of the fit evidence. What the files do fix is which of those claims has a test behind it.
        To see the same measured points drawn against every candidate model for a pair, open the{" "}
        <Anchor href="?workspace=explore&view=surfaces&components=methanol,water&lens=evidence" size="sm">Explorer&apos;s Evidence view</Anchor>.
        For how a pair like this one is made from a database, see{" "}
        <Anchor component="button" type="button" size="sm" onClick={() => setActiveMethodTool("database-to-parameters")}>
          From a database to binary parameters
        </Anchor>.
      </Text>
    </Stack>
  );
}

// ---- the tool ---------------------------------------------------------------------

const PAGES = [
  { n: 1, short: "1 Request" }, { n: 2, short: "2 Data" }, { n: 3, short: "3 Fit" },
  { n: 4, short: "4 Held-out" }, { n: 5, short: "5 Verdict" }, { n: 6, short: "6 Decision" },
];

export function SentenceToDecisionTool({ initialPage = 1, injected }: {
  initialPage?: number; injected?: EngineTables;
}): JSX.Element {
  const [page, setPage] = useState(initialPage);
  const run = useMethodRun(!injected && page >= 3 ? SD_WITNESS : null, [], "", "choupoProps");
  const tables = useMemo(() => injected ?? tablesOf(run.result?.csvFiles), [injected, run.result]);
  const err = run.err;
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={4}>From a sentence to a decision</Title>
          <Text size="sm" c="dimmed" mt={4}>
            One worked example, methanol and water, from the request in plain language to the sentence you would sign.
            Every page shows a file or a table of the tree, never an invented one.
          </Text>
        </Box>
        <SegmentedControl fullWidth size="xs" value={String(page)} onChange={(v) => setPage(Number(v))}
          data={PAGES.map((p) => ({ value: String(p.n), label: p.short }))} data-pager="" />
        {step(page)}
        <Box data-artefact={page}>
          {page === 1 && <RequestPage />}
          {page === 2 && <DataPage />}
          {page === 3 && <FitPage tables={tables} busy={run.busy} err={err} />}
          {page === 4 && <HeldOutPage tables={tables} busy={run.busy} err={err} />}
          {page === 5 && <VerdictPage tables={tables} />}
          {page === 6 && <DecisionPage tables={tables} />}
        </Box>
        <Group justify="space-between">
          <Button size="xs" variant="default" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous page</Button>
          <Button size="xs" disabled={page >= 6} onClick={() => setPage(page + 1)}>Next page</Button>
        </Group>
        <LessonQuiz title="Check how you read a verdict" questions={SD_QUIZ} lesson={SD_STEPS} />
        <LessonLimits limits={SD_LIMITS} />
        <Text size="sm">
          Before:{" "}
          <Anchor component="button" type="button" size="sm" onClick={() => setActiveMethodTool("least-squares")}>
            Least squares: what a fitted parameter is worth
          </Anchor>.  After:{" "}
          <Anchor component="button" type="button" size="sm" onClick={() => setActiveMethodTool("database-to-parameters")}>
            From a database to binary parameters
          </Anchor>.
        </Text>
        <LessonReferences tool="sentence-to-decision" />
      </Stack>
    </Box>
  );
}

export default SentenceToDecisionTool;
