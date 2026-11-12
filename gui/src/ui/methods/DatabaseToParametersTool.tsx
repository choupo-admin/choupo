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
  DatabaseToParametersTool -- "From a database to binary parameters"
  (DEV.md 4c C332 item 3, C334).

  THE STUDENT'S TASK, in one sentence: "I have a ThermoML file for my pair;
  what parameters does it give, and how good are they?"  So the page opens
  on that file: load it (downloaded by the student -- NIST's per-article
  URL sends no CORS header, so the browser cannot fetch it for them), see
  every block and why each is or is not usable, name the two compounds, and
  FIT -- the engine's choupoProps `fitParameters`, run in the browser on a
  case written by databaseToParametersFit.ts, with the curation pipeline's
  own rule.  The lesson below it is the pipeline, step by step.

  ZERO PHYSICS HERE: the reader is gui/src/case/thermomlReader.ts (held to
  the Python extractor), the fit and every bubble point are the engine's,
  and the page computes only the largest residual, the grade and the cap --
  arithmetic on the engine's parity table, marked `page`.

  The `<LessonReferences>` block and the registry entry arrive with the
  mount patch (docs/design/from-a-database-to-binary-parameters.md): the
  tool id does not exist until registry.ts carries it.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Alert, Anchor, Badge, Box, Button, Group, Loader, Select, Stack, Table, Text, Title,
} from "@mantine/core";

import EXAMPLE_XML from "../../../../tutorials/props/curation/fixtures/thermoml/binary-bubble-fixture.xml?raw";

import { useCaseFilesRun } from "../../case/methodRun.js";
import { CATALOGUE, rawRecordFor } from "../../case/catalogue.js";
import { filesToCaseFiles } from "../../cases/tutorials.js";
import {
  interiorIndices, isReaderError, isRefusal, readThermoML, ThermoMLRefusal,
  type BubblePRecord, type BubbleTRecord, type ThermoMLCompound, type ThermoMLFile,
} from "../../case/thermomlReader.js";
import { LessonLimits, LessonReferences, lessonStepper } from "./lessonStep.js";
import {
  CASE_NAME, FIT_RULE, capOf, gradeOf, kindOf, maxErrorOf, outliersOf, pairFitCaseFiles,
  pipelineIssues, readParity, temperaturesOf, type FitKind, type Grade, type PairFitInput,
  type ParityRow,
} from "./databaseToParametersFit.js";
import {
  CATALOGUE_COMMIT, CATALOGUE_DATE, COUNTS, DP_LIMITS, DP_STEPS, EXAMPLE_RECORD, MAP,
  RECORD_LINES,
} from "./databaseToParametersLesson.js";
import { OriginMark } from "./origin.js";
import { setActiveMethodTool, type MethodToolId } from "./registry.js";

const step = lessonStepper(DP_STEPS, { foldSymbols: true });

/** The name of the example file, said wherever the example is used. */
export const EXAMPLE_NAME = "binary-bubble-fixture.xml (synthetic, invented numbers)";

const BORDER = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-text)";
const DIM = "var(--mantine-color-dimmed)";

function PanTable({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }}>
      <Table striped withTableBorder withColumnBorders fz="xs" mt={6}>{children}</Table>
    </Box>
  );
}

// ---- formulas: a FILTER for the join, never the join -----------------------

/** Element counts of a molecular formula (Hill or otherwise). */
export function formulaCounts(f: string): Map<string, number> | null {
  const s = f.replace(/\s+/g, "");
  if (!/^([A-Z][a-z]?\d*)+$/.test(s)) return null;
  const m = new Map<string, number>();
  for (const [, el, n] of s.matchAll(/([A-Z][a-z]?)(\d*)/g))
    m.set(el!, (m.get(el!) ?? 0) + (n ? Number(n) : 1));
  return m;
}
export function sameFormula(a: string, b: string): boolean {
  const x = formulaCounts(a), y = formulaCounts(b);
  if (!x || !y || x.size !== y.size) return false;
  for (const [k, v] of x) if (y.get(k) !== v) return false;
  return true;
}

/** Catalogue components a student may pick for one archive compound: the
 *  volatile ones, those with the archive's formula first.  The formula
 *  narrows the list; it does not identify (isomers share it). */
export function candidatesFor(c: ThermoMLCompound): { value: string; label: string; match: boolean }[] {
  return CATALOGUE.filter((m) => m.vleAble)
    .map((m) => ({ value: m.name, label: `${m.name} (${m.formula || "no formula"})`,
      match: !!c.formula && sameFormula(m.formula, c.formula) }))
    .sort((a, b) => Number(b.match) - Number(a.match) || a.value.localeCompare(b.value));
}

const casOf = (name: string): string =>
  /\bCAS\s+([0-9]+-[0-9]+-[0-9])\s*;/.exec(rawRecordFor(name) ?? "")?.[1] ?? "not declared";

// ---- the block table ---------------------------------------------------------

type Usable = { index: number; rec: BubbleTRecord | BubblePRecord };

/** One row per block: what it is, and why it is or is not fitted. */
export function blockRows(file: ThermoMLFile): {
  index: number; what: string; points: number | null; condition: string;
  status: "usable" | "setAside" | "refused"; why: string; usable: Usable | null;
}[] {
  return file.blocks.map((b) => {
    const pick = !isRefusal(b.bubbleT) && !isReaderError(b.bubbleT) ? b.bubbleT
      : !isRefusal(b.bubbleP) && !isReaderError(b.bubbleP) ? b.bubbleP : null;
    if (!pick) {
      //  Name the refusal of the geometry the block's property suggests.
      const isP = b.properties.some((p) => p.toLowerCase().startsWith("vapor or sublimation pressure"));
      const o = isP ? b.bubbleP : b.bubbleT;
      const why = isRefusal(o) ? o.refused : isReaderError(o) ? o.error : "";
      return { index: b.index, what: b.properties.join("; ") || "no property", points: null,
        condition: "", status: "refused", why, usable: null };
    }
    const rec = pick as BubbleTRecord | BubblePRecord;
    const condition = rec.kind === "bubbleT"
      ? (rec.isobars ? `${rec.isobars.length} isobars` : `P = ${rec.PkPa} kPa`)
      : (rec.isotherms ? `${rec.isotherms.length} isotherms` : `T = ${rec.TK} K`);
    const issues = pipelineIssues(rec);
    return {
      index: b.index,
      what: `${rec.kind === "bubbleT" ? "bubble T" : "bubble P"}: ${rec.system[0]} + ${rec.system[1]}`,
      points: rec.points.length, condition,
      status: issues.length ? "setAside" : "usable",
      why: issues.length ? `the pipeline would set it aside: ${issues.join("; ")}` : "the pipeline would fit it",
      usable: { index: b.index, rec },
    };
  });
}

function BlockTable({ file, chosen, onChoose }: {
  file: ThermoMLFile; chosen: number | null; onChoose: (u: Usable) => void;
}): JSX.Element {
  const rows = blockRows(file);
  return (
    <PanTable>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>block</Table.Th><Table.Th>what it is</Table.Th><Table.Th>points</Table.Th>
          <Table.Th>held</Table.Th><Table.Th>verdict</Table.Th><Table.Th />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((r) => (
          <Table.Tr key={r.index} data-block-row={r.index} data-block-status={r.status}>
            <Table.Td>{r.index}</Table.Td>
            <Table.Td>{r.what}</Table.Td>
            <Table.Td>{r.points ?? "—"}</Table.Td>
            <Table.Td>{r.condition || "—"}</Table.Td>
            <Table.Td>
              <Badge size="xs" variant="light"
                color={r.status === "usable" ? "teal" : r.status === "setAside" ? "yellow" : "gray"}>
                {r.status === "usable" ? "usable" : r.status === "setAside" ? "set aside" : "refused"}
              </Badge>
              <Text size="xs" c="dimmed" style={{ whiteSpace: "pre-wrap" }}>{r.why}</Text>
            </Table.Td>
            <Table.Td>
              {r.usable && (
                <Button size="compact-xs" variant={chosen === r.index ? "filled" : "light"}
                  onClick={() => onChoose(r.usable!)}>
                  {chosen === r.index ? "chosen" : "choose"}
                </Button>
              )}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </PanTable>
  );
}

// ---- the parity figure (SVG, no plotting library) ---------------------------

export function ParityFigure({ kept, dropped, kind }: {
  kept: readonly ParityRow[]; dropped: readonly ParityRow[]; kind: FitKind;
}): JSX.Element {
  const W = 420, H = 380, L = 64, R = 16, T = 16, B = 52;
  const scale = kind === "T_bubble" ? 1 : 1e-3;     // K, or kPa from Pa
  const unit = kind === "T_bubble" ? "K" : "kPa";
  const all = [...kept, ...dropped].flatMap((r) => [r.measured * scale, r.model * scale])
    .filter(Number.isFinite);
  let lo = Math.min(...all), hi = Math.max(...all);
  if (!(hi > lo)) { lo -= 1; hi += 1; }
  const pad = 0.05 * (hi - lo); lo -= pad; hi += pad;
  const sx = (v: number) => L + (v - lo) / (hi - lo) * (W - L - R);
  const sy = (v: number) => H - B - (v - lo) / (hi - lo) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * (hi - lo));
  const name = kind === "T_bubble" ? "T" : "P";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 560, display: "block" }}
      role="img" aria-label={`Parity: the model's ${name} against the measured ${name}`} data-parity-figure="">
      <line x1={sx(lo)} y1={sy(lo)} x2={sx(hi)} y2={sy(hi)} stroke={DIM} strokeDasharray="4 3" />
      <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke={INK} />
      <line x1={L} y1={T} x2={L} y2={H - B} stroke={INK} />
      {ticks.map((t, k) => (
        <g key={k}>
          <text x={sx(t)} y={H - B + 16} fontSize={11} textAnchor="middle" fill={INK}>{t.toFixed(1)}</text>
          <text x={L - 6} y={sy(t) + 4} fontSize={11} textAnchor="end" fill={INK}>{t.toFixed(1)}</text>
        </g>
      ))}
      <text x={(L + W - R) / 2} y={H - 10} fontSize={12} textAnchor="middle" fill={INK}>
        measured {name} [{unit}]
      </text>
      <text x={16} y={(T + H - B) / 2} fontSize={12} textAnchor="middle" fill={INK}
        transform={`rotate(-90 16 ${(T + H - B) / 2})`}>model {name} [{unit}]</text>
      {kept.filter((r) => Number.isFinite(r.model)).map((r, k) => (
        <circle key={`k${k}`} cx={sx(r.measured * scale)} cy={sy(r.model * scale)} r={4}
          fill="var(--mantine-color-blue-6)" data-parity-point="kept" />
      ))}
      {dropped.filter((r) => Number.isFinite(r.model)).map((r, k) => {
        const x = sx(r.measured * scale), y = sy(r.model * scale);
        return (
          <g key={`d${k}`} data-parity-point="discarded" stroke="var(--mantine-color-red-6)" strokeWidth={2}>
            <line x1={x - 5} y1={y - 5} x2={x + 5} y2={y + 5} />
            <line x1={x - 5} y1={y + 5} x2={x + 5} y2={y - 5} />
          </g>
        );
      })}
      <text x={W - R} y={T + 12} fontSize={11} textAnchor="end" fill={INK}>
        ● kept   ✕ discarded at stage A   - - model = measured
      </text>
    </svg>
  );
}

// ---- the fit ----------------------------------------------------------------

export interface FitOutcome {
  kind: FitKind;
  b12: number | null;
  b21: number | null;
  kept: ParityRow[];
  dropped: ParityRow[];
  discardRows: number[];
  whole: boolean;
  maxErr: number;
  grade: Grade;
  capped: { grade: Grade; caps: string[] };
}

/** Everything the result panel draws, from the engine's two runs. */
export function fitOutcome(
  kind: FitKind, csvA: string, csvB: string, diag: { [k: string]: number } | undefined,
  nTemperatures: number,
): FitOutcome {
  const rowsA = readParity(csvA, kind);
  const out = outliersOf(rowsA, kind);
  const kept = readParity(csvB, kind);
  const dropped = out.rows.map((r) => rowsA[r - 1]!).filter(Boolean);
  const maxErr = maxErrorOf(kept, kind);
  const grade = gradeOf(maxErr, kind);
  return {
    kind,
    b12: typeof diag?.["fit.0.value"] === "number" ? diag["fit.0.value"]! : null,
    b21: typeof diag?.["fit.1.value"] === "number" ? diag["fit.1.value"]! : null,
    kept, dropped, discardRows: out.rows, whole: out.whole, maxErr, grade,
    capped: capOf(grade, nTemperatures, 1),
  };
}

const csvNamed = (files: { [k: string]: string } | undefined, name: string): string =>
  Object.entries(files ?? {}).find(([k]) => k === name || k.endsWith(`/${name}`))?.[1] ?? "";

export function FitResult({ o, names }: { o: FitOutcome; names: [string, string] }): JSX.Element {
  const unit = o.kind === "T_bubble" ? "K" : "%";
  return (
    <Box data-fit-result="">
      <OriginMark of={["engine", "page"]}
        note="b and every model value are choupoProps in this browser; the largest error, the grade and the cap are worked on this page from the engine's parity table" />
      <Group align="flex-start" gap="lg" mt={6} wrap="wrap">
        <Box style={{ flex: "1 1 320px" }}>
          <ParityFigure kept={o.kept} dropped={o.dropped} kind={o.kind} />
        </Box>
        <Box style={{ flex: "1 1 260px" }}>
          <Text size="sm"><b>b</b><sub>{names[0]}–{names[1]}</sub> = {o.b12?.toFixed(1) ?? "—"} K</Text>
          <Text size="sm"><b>b</b><sub>{names[1]}–{names[0]}</sub> = {o.b21?.toFixed(1) ?? "—"} K</Text>
          <Text size="sm" mt={6}>
            Largest error over the {o.kept.length} kept points:{" "}
            <b>{Number.isFinite(o.maxErr) ? o.maxErr.toFixed(3) : "no bubble point"} {unit}</b>
          </Text>
          <Text size="sm">Discarded at stage A: {o.discardRows.length
            ? `${o.whole ? "the whole block" : `rows ${o.discardRows.join(", ")}`}` : "none"}</Text>
          <Text size="sm" mt={6}>In-sample grade: <b data-grade={o.grade}>{o.grade}</b></Text>
          <Text size="sm">
            As the catalogue would carry it: <b data-capped={o.capped.grade}>{o.capped.grade}</b>
            {o.capped.caps.length > 0 && <> — capped: {o.capped.caps.join(", ")}</>}
          </Text>
          <Text size="xs" c="dimmed" mt={6}>
            Limits {o.kind === "T_bubble" ? FIT_RULE.gradeK.join(" / ") + " K" : FIT_RULE.gradePct.join(" / ") + " %"}{" "}
            for clean / warning / severe.  Not run here: the second start and the
            one-liquid check.
          </Text>
        </Box>
      </Group>
    </Box>
  );
}

// ---- the page ---------------------------------------------------------------

export function DatabaseToParametersTool(): JSX.Element {
  const [src, setSrc] = useState<{ text: string; name: string; example: boolean } | null>(null);
  const [chosen, setChosen] = useState<Usable | null>(null);
  const [names, setNames] = useState<[string | null, string | null]>([null, null]);
  const [go, setGo] = useState(0);

  const parsed = useMemo((): { file: ThermoMLFile | null; err: string | null } => {
    if (!src) return { file: null, err: null };
    try { return { file: readThermoML(src.text), err: null }; }
    catch (e) {
      return { file: null, err: e instanceof ThermoMLRefusal ? e.message : String(e) };
    }
  }, [src]);
  const file = parsed.file;

  const compoundOf = (org: string): ThermoMLCompound | undefined =>
    file?.compounds.find((c) => c.orgNum === org);

  const input = useMemo((): PairFitInput | null => {
    if (!chosen || !file || !names[0] || !names[1] || names[0] === names[1]) return null;
    return {
      rec: chosen.rec, names: [names[0], names[1]], keep: interiorIndices(chosen.rec.points),
      citation: { file: src?.name ?? "", block: chosen.index, doi: file.doi,
        text: `${file.authors.slice(0, 6).map((a) => a.split("[")[0]!.trim()).join("; ")} (${file.year}). ${file.title}. ${file.journal}` },
      source: src?.example ? "synthetic" : "measured",
    };
  }, [chosen, file, names, src]);

  const key = input ? `${go}\u0000${src?.name}\u0000${chosen?.index}\u0000${names.join("|")}` : "";
  const runA = useCaseFilesRun(go > 0 && input
    ? () => filesToCaseFiles(CASE_NAME, pairFitCaseFiles(input, "leastSquares", [])) : null,
    `A\u0000${key}`, "choupoProps");
  const kind = input ? kindOf(input.rec) : "T_bubble";
  const csvA = csvNamed(runA.result?.csvFiles, "parity.csv");
  const discards = useMemo(() => (csvA ? outliersOf(readParity(csvA, kind), kind).rows : null),
    [csvA, kind]);
  const runB = useCaseFilesRun(go > 0 && input && discards
    ? () => filesToCaseFiles(CASE_NAME, pairFitCaseFiles(input, "twoStage", discards)) : null,
    `B\u0000${key}\u0000${discards?.join(",")}`, "choupoProps");
  const csvB = csvNamed(runB.result?.csvFiles, "parity.csv");
  const outcome = useMemo(() => {
    if (!input || !csvA || !csvB) return null;
    const diag = runB.result?.operationResults?.[0]?.diagnostics;
    return fitOutcome(kind, csvA, csvB, diag, temperaturesOf(input.rec, input.keep));
  }, [input, csvA, csvB, kind, runB.result]);

  const load = (text: string, name: string, example: boolean) => {
    setSrc({ text, name, example }); setChosen(null); setNames([null, null]); setGo(0);
  };
  const choose = (u: Usable) => {
    setChosen(u); setGo(0);
    setNames([null, null]);
  };

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={4}>From a database to binary parameters</Title>
          <Text size="sm" c="dimmed" mt={4}>
            You have a ThermoML file for your pair: what NRTL parameters does
            it give, and how good are they?
          </Text>
        </Box>

        <Box px="sm" py={8} style={{ border: `1px solid ${BORDER}`, borderRadius: 4 }} data-loader="">
          <Group gap="sm" wrap="wrap">
            <Button component="label" size="xs">
              Load a ThermoML file
              <input type="file" accept=".xml,application/xml,text/xml" hidden
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  if (f) void f.text().then((t) => load(t, f.name, false));
                }} />
            </Button>
            <Button size="xs" variant="light" onClick={() => load(EXAMPLE_XML, EXAMPLE_NAME, true)}>
              Use the synthetic example
            </Button>
          </Group>
          <Text size="xs" c="dimmed" mt={6}>
            Download the article's file yourself from
            https://trc.nist.gov/ThermoML/&lt;doi&gt;.xml (NIST does not let a
            web page fetch it for you).  The file stays in your browser.
          </Text>
          {parsed.err && <Alert mt="xs" color="red" variant="light" title="Not read">{parsed.err}</Alert>}
          {file && (
            <Text size="sm" mt={6}>
              <b>{src?.name}</b>{src?.example && " — every number in it is invented"}: {file.title || "no title"}
              {file.doi && <> · doi {file.doi}</>} · {file.blocks.length} block(s)
            </Text>
          )}
        </Box>

        {file && (
          <Box>
            <Title order={5}>The blocks in this file</Title>
            <OriginMark of="reference" note="read from the file by the same rules as bin/choupo-thermoml" />
            <BlockTable file={file} chosen={chosen?.index ?? null} onChoose={choose} />
          </Box>
        )}

        {file && chosen && (
          <Box data-join="">
            <Title order={5}>Name the two compounds</Title>
            <Text size="sm" mt={4}>
              Pick the catalogue component each one is.  Components with the
              file's formula are listed first, but a formula does not identify
              a substance: compare the InChIKey and the CAS number.
            </Text>
            <Stack gap={6} mt={6}>
              {chosen.rec.members.map((org, k) => {
                const c = compoundOf(org);
                return (
                  <Group key={org} gap="sm" align="flex-end" wrap="wrap">
                    <Box style={{ minWidth: 260 }}>
                      <Text size="xs" c="dimmed">
                        {k === 0 ? "x is the mole fraction of" : "and"}: {c?.name || "?"} · {c?.formula || "no formula"}
                      </Text>
                      <Text size="xs" c="dimmed">InChIKey {c?.inchikey || "not given in the file"}</Text>
                    </Box>
                    <Select size="xs" searchable placeholder="catalogue component"
                      data={c ? candidatesFor(c) : []}
                      value={names[k]} onChange={(v) => {
                        const n: [string | null, string | null] = [...names] as [string | null, string | null];
                        n[k] = v; setNames(n); setGo(0);
                      }} style={{ minWidth: 240 }} />
                    {names[k] && <Text size="xs" c="dimmed">CAS {casOf(names[k]!)}</Text>}
                  </Group>
                );
              })}
            </Stack>
            <Group mt="sm" gap="sm">
              <Button size="xs" disabled={!input || runA.busy || runB.busy} onClick={() => setGo(go + 1)}>
                Fit with the engine
              </Button>
              {(runA.busy || runB.busy) && (
                <Group gap={6}><Loader size="xs" />
                  <Text size="xs" c="dimmed">{runA.busy ? "stage A: least squares…" : "stage B: largest error…"}</Text>
                </Group>
              )}
            </Group>
            {names[0] && names[0] === names[1] && (
              <Text size="xs" c="red" mt={4}>The two compounds must be different components.</Text>
            )}
            {(runA.err || runB.err) && (
              <Alert mt="xs" color="red" variant="light" title="The engine did not finish">
                {runA.err ?? runB.err}
              </Alert>
            )}
          </Box>
        )}

        {outcome && names[0] && names[1] && <FitResult o={outcome} names={[names[0], names[1]]} />}

        <Title order={4}>How the curated pairs were made</Title>
        {step(1)}
        {step(2)}
        {step(3)}
        {step(4)}
        {step(5)}
        {step(6)}
        {step(7)}
        {step(8)}

        <Box>
          <Title order={5}>A curated record, read line by line</Title>
          <OriginMark of="reference" note={`quoted from ${EXAMPLE_RECORD}; the number is the line`} />
          <PanTable>
            <Table.Thead>
              <Table.Tr><Table.Th>line</Table.Th><Table.Th>the file says</Table.Th><Table.Th>what it tells you</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {RECORD_LINES.map((r) => (
                <Table.Tr key={r.line} data-record-line={r.line}>
                  <Table.Td>{r.line}</Table.Td>
                  <Table.Td><Text size="xs" ff="monospace" style={{ overflowWrap: "anywhere" }}>{r.text}</Text></Table.Td>
                  <Table.Td>{r.means}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </PanTable>
        </Box>

        <Box data-counts="">
          <Title order={5}>The catalogue, counted</Title>
          <OriginMark of="reference"
            note={`counted over data/standards/parameters/ at commit ${CATALOGUE_COMMIT} (${CATALOGUE_DATE}); the catalogue grows`} />
          <Text size="sm" mt={4} component="div">
            <ul style={{ marginTop: 4, paddingLeft: 20 }}>
              <li>{COUNTS.nrtl} NRTL pairs ({COUNTS.uniquac} UNIQUAC, {COUNTS.wilson} Wilson).</li>
              <li>{COUNTS.oneArticle} of the {COUNTS.nrtl} NRTL pairs cite ONE article.</li>
              <li>{COUNTS.heldOutNone} held nothing out: every grade is in-sample.</li>
              <li>{COUNTS.capped} carry a cap: a clean on one temperature or one laboratory.</li>
              <li>{COUNTS.severe} severe pairs are still there, promoted before severe stopped being promoted.</li>
              <li>{COUNTS.reviewedByPerson} have been reviewed by a person.</li>
            </ul>
          </Text>
        </Box>

        <Box data-map="">
          <Title order={5}>Which measurement constrains which parameter</Title>
          <PanTable>
            <Table.Thead>
              <Table.Tr><Table.Th>measurement</Table.Th><Table.Th>what it constrains</Table.Th><Table.Th>in Choupo</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {MAP.map((m) => (
                <Table.Tr key={m.id} data-map-row={m.id}>
                  <Table.Td>{m.measurement}</Table.Td>
                  <Table.Td>{m.constrains}</Table.Td>
                  <Table.Td>
                    {m.where}
                    {m.tool && (
                      <> · <Anchor component="button" type="button" size="xs"
                        onClick={() => setActiveMethodTool(m.tool as MethodToolId)}>{m.toolName}</Anchor></>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </PanTable>
        </Box>

        <LessonLimits limits={DP_LIMITS} />

        <Text size="sm">
          Before:{" "}
          <Anchor component="button" type="button" onClick={() => setActiveMethodTool("least-squares")}>
            Least squares: what a fitted parameter is worth
          </Anchor>.  After: the pages on solid-liquid pairs and on salt mixtures,
          then{" "}
          <Anchor component="button" type="button" onClick={() => setActiveMethodTool("four-ways-mixture")}>
            Four ways to price a mixture
          </Anchor>.
        </Text>

        <LessonReferences tool="database-to-parameters" />
      </Stack>
    </Box>
  );
}

export default DatabaseToParametersTool;
