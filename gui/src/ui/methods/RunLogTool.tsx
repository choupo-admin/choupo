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
  RunLogTool -- how to read a run's log (DEV.md 4c C54).

  The second page on the "How Choupo works" shelf.  ONE panel carries it: a
  log viewer over a REAL run of one of seven witnesses, made by the browser
  engine on an in-memory copy (methodRun.useCaseFilesRun -- the same hook
  the first page runs its breaks with).  Every line is coloured by the kind
  runLog.classifyLog gives it, from the markers the engine prints and
  nothing else; a click says what the line is and which line of the engine
  printed it.  Above the log, "read the end first" lifts out of the same run
  the four things a reader should check before any number.

  The steps below the viewer each carry buttons that load the run they talk
  about and select the line they mean, so the prose never quotes a log the
  reader cannot see being printed.
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Badge, Box, Button, Group, Loader, SegmentedControl, Stack, Table,
  Text, Title, UnstyledButton,
} from "@mantine/core";

import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { useNarrowViewport } from "./methodsChrome.js";
import { PanelNote } from "./knobPanel.js";
import {
  CITES, EXIT_MEANING, KINDS, KIND_ORDER, RUNS, VERBOSITY, VERBOSITY_LEVELS,
  blockLines, citeText, classifyLog, exitCodeOf, kindCounts, refusalOf,
  witnessRaw, type LogKind, type LogLine, type RunId, type Verbosity,
} from "./runLog.js";
import { RUN_LOG_LIMITS, RUN_LOG_STEPS } from "./runLogLesson.js";
import { useCaseFilesRun } from "../../case/methodRun.js";
import { filesToCaseFiles } from "../../cases/tutorials.js";

const GRID = "var(--mantine-color-default-border)";
const ACCENT = "var(--mantine-color-accent-5)";
const SELECTED = "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-5))";

type Kind = LogKind | "unclassified";

const colorOf = (k: Kind): string =>
  k === "unclassified" ? "var(--mantine-color-pink-6)"
    : `var(--mantine-color-${KINDS[k].color}-6)`;
const labelOf = (k: Kind): string =>
  k === "unclassified" ? "unclassified" : KINDS[k].label;

/** Monospace text that wraps rather than widening the page at 390 px. */
function Mono({ children, c }: { children: React.ReactNode; c?: string }):
  JSX.Element {
  return (
    <Text span ff="monospace" size="xs" c={c}
      style={{ overflowWrap: "anywhere", lineHeight: 1.45 }}>{children}</Text>
  );
}

/** Prose in which a `backticked` span is something the log or a file says. */
function Prose({ text }: { text: string }): JSX.Element {
  return (
    <>
      {text.split("`").map((part, i) => (i % 2 === 1
        ? <Text key={i} span ff="monospace" fz="0.92em">{part}</Text>
        : <span key={i}>{part}</span>))}
    </>
  );
}

/** The line as the Log tab shows it: the engine's stderr keeps the
 *  worker's prefix, because that is what the reader sees there. */
const shown = (l: LogLine): string =>
  l.stream === "err" ? `[stderr] ${l.text}` : l.text;

// ---- One line, and the card that explains it ---------------------------------

function LineRow({ line, selected, onPick }: {
  line: LogLine; selected: boolean; onPick: (n: number) => void;
}): JSX.Element {
  if (line.blank) return <Box style={{ height: "0.7em" }} />;
  const k = line.kind as Kind;
  return (
    <UnstyledButton data-line={line.n} onClick={() => onPick(line.n)}
      aria-pressed={selected}
      aria-label={`line ${line.n}, ${labelOf(k)}`}
      style={{ display: "flex", width: "100%", gap: 6, padding: "0 6px 0 4px",
        borderLeft: `4px solid ${colorOf(k)}`,
        background: selected ? SELECTED : undefined,
        outline: selected ? `1px solid ${ACCENT}` : undefined }}>
      <Text span ff="monospace" c="dimmed" ta="right"
        style={{ fontSize: 10.5, lineHeight: 1.5, minWidth: 26, flexShrink: 0 }}>
        {line.n}
      </Text>
      <Text span ff="monospace"
        c={line.stream === "app" ? "dimmed" : undefined}
        style={{ fontSize: "var(--run-log-font, 11px)", lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere", minWidth: 0, flex: 1 }}>
        {shown(line)}
      </Text>
    </UnstyledButton>
  );
}

function KindBadge({ k }: { k: Kind }): JSX.Element {
  return (
    <Badge size="sm" variant="light"
      color={k === "unclassified" ? "pink" : KINDS[k].color}>
      {labelOf(k)}
    </Badge>
  );
}

function LineCard({ line, lines, onPick }: {
  line: LogLine | null; lines: readonly LogLine[]; onPick: (n: number) => void;
}): JSX.Element {
  if (!line)
    return (
      <Text size="sm" c="dimmed">
        Click any line of the log. The card says what kind of line it is, how
        the page knows, what it means, and which line of the engine printed
        it.
      </Text>
    );
  const k = line.kind as Kind;
  const m = line.marker;
  const from = line.from !== null ? lines.find((l) => l.n === line.from) : null;
  return (
    <Stack gap={8} style={{ minWidth: 0 }}>
      <Group gap={8} wrap="wrap">
        <Text size="sm" fw={600}>Line {line.n}</Text>
        <KindBadge k={k} />
        <Badge size="sm" variant="outline" color="gray">
          {line.stream === "err" ? "standard error"
            : line.stream === "app" ? "this app" : "standard output"}
        </Badge>
      </Group>
      <Box px="sm" py={4} style={{ border: `1px solid ${GRID}`, borderRadius: 4 }}>
        <Mono>{shown(line)}</Mono>
      </Box>
      <Box>
        <Text size="xs" c="dimmed" fw={700} tt="uppercase">how the page knows</Text>
        <Text size="sm" mt={2}>
          {line.via === "marker" && m && (
            <>It carries a marker of its own — it opens with{" "}
              <Mono>{m.startsWith ?? m.looksLike}</Mono>, which the
              {line.stream === "app" ? " app" : " engine"} prints at{" "}
              <Mono>{citeText(CITES[m.cite])}</Mono>.</>
          )}
          {line.via === "block" && m && from && (
            <>No marker of its own. It sits inside the block opened at{" "}
              <UnstyledButton onClick={() => onPick(from.n)}
                style={{ display: "inline" }}>
                <Mono c="accent">line {from.n}</Mono></UnstyledButton>{" "}
              (<Mono>{from.text.trim()}</Mono>), whose opener is printed at{" "}
              <Mono>{citeText(CITES[m.cite])}</Mono>.</>
          )}
          {line.via === "rule" && m && line.from !== null && (
            <>A rule line: it introduces the block that starts at{" "}
              <UnstyledButton onClick={() => onPick(line.from!)}
                style={{ display: "inline" }}>
                <Mono c="accent">line {line.from}</Mono></UnstyledButton>,
              printed with it at <Mono>{citeText(CITES[m.cite])}</Mono>.</>
          )}
          {line.via === "continuation" && m && from && (
            <>It continues the standard-error line{" "}
              <UnstyledButton onClick={() => onPick(from.n)}
                style={{ display: "inline" }}>
                <Mono c="accent">{from.n}</Mono></UnstyledButton>{" "}
              above it, printed at <Mono>{citeText(CITES[m.cite])}</Mono>.</>
          )}
          {k === "unclassified" && (
            <>No marker this page knows, and it sits in no block one opens.
              It is left unclassified rather than given a kind guessed from its
              words; read it in context.</>
          )}
        </Text>
      </Box>
      {m && (
        <Box>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">what it says</Text>
          <Text size="sm" mt={2}><Prose text={m.means} /></Text>
        </Box>
      )}
      {k !== "unclassified" && (
        <Text size="xs" c="dimmed">
          <Text span fw={600}>{labelOf(k)}: </Text>{KINDS[k].says}.
        </Text>
      )}
      {m?.act && (
        <Alert color={m.failure || k === "refusal" ? "red"
          : k === "divergence" ? "grape" : "orange"}
          title="What to do" p="xs">
          <Text size="sm"><Prose text={m.act} /></Text>
        </Alert>
      )}
    </Stack>
  );
}

// ---- Read the end first -------------------------------------------------------

function EndFirst({ lines, log, onPick, narrow }: {
  lines: readonly LogLine[]; log: string; onPick: (n: number) => void;
  narrow: boolean;
}): JSX.Element {
  const rc = exitCodeOf(log);
  const meaning = rc !== null ? EXIT_MEANING[rc] : undefined;
  const first = (id: string): LogLine | undefined =>
    lines.find((l) => l.via === "marker" && l.marker?.id === id);
  const div = first("divergenceBlock") ?? first("divergenceNone");
  const divBody = div && div.marker?.id === "divergenceBlock"
    ? blockLines(lines, "divergenceBlock").filter((l) =>
      /^\s*(-|requested:|solved:|reason:)/.test(l.text)) : [];
  const cav = first("caveatsBlock") ?? first("caveatsNone");
  const cavItems = cav && cav.marker?.id === "caveatsBlock"
    ? blockLines(lines, "caveatsBlock").filter((l) => /^\s+- /.test(l.text)).length
    : 0;
  const failed = lines.find((l) => l.marker?.failure && l.via === "marker");
  const errLine = first("error");
  const refusal = refusalOf(log);

  const Row = ({ q, children }: { q: string; children: React.ReactNode }) => (
    <Box style={{ display: "grid",
      gridTemplateColumns: narrow ? "1fr" : "minmax(0, 11em) 1fr",
      gap: narrow ? 2 : 10, alignItems: "baseline" }}>
      <Text size="xs" c="dimmed" fw={700} tt="uppercase">{q}</Text>
      <Box style={{ minWidth: 0 }}>{children}</Box>
    </Box>
  );
  const Jump = ({ l }: { l: LogLine }) => (
    <UnstyledButton onClick={() => onPick(l.n)}
      style={{ display: "inline", textAlign: "left" }}>
      <Mono c="accent">{l.text.trim()}</Mono>
    </UnstyledButton>
  );

  return (
    <Stack gap={6} px="sm" py={8}
      style={{ border: `1px solid ${GRID}`, borderRadius: 4 }}>
      <Text size="xs" c="dimmed" fw={700} tt="uppercase">
        read the end first — lifted out of this run
      </Text>
      <Row q="exit code">
        {rc === null ? <Text size="sm" c="dimmed">not reported</Text> : (
          <Group gap={8} wrap="wrap">
            <Badge color={rc === 0 ? "teal" : rc === 1 ? "orange" : "red"}>
              {rc}</Badge>
            <Text size="sm">{meaning?.says ?? "not a code the engine documents"}</Text>
            {meaning && <Mono c="dimmed">{citeText(CITES[meaning.cite])}</Mono>}
          </Group>
        )}
      </Row>
      {errLine && (
        <Row q="refused">
          <UnstyledButton onClick={() => onPick(errLine.n)}
            style={{ display: "block", textAlign: "left" }}>
            <Text size="xs" ff="monospace" c="red"
              style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {refusal}
            </Text>
          </UnstyledButton>
        </Row>
      )}
      {failed && <Row q="did it converge?"><Jump l={failed} /></Row>}
      <Row q="which problem?">
        {div ? (
          <Stack gap={2}>
            <Jump l={div} />
            {divBody.map((l) => <Mono key={l.n}>{l.text.trim()}</Mono>)}
          </Stack>
        ) : <Text size="sm" c="dimmed">not printed — the run stopped before
          the end, so there is no answer to qualify</Text>}
      </Row>
      <Row q="what qualifies it?">
        {cav ? (
          <Stack gap={2}>
            <Jump l={cav} />
            {cav.marker?.id === "caveatsBlock" && (
              <Text size="xs" c="dimmed">{cavItems} item(s) in the block</Text>
            )}
          </Stack>
        ) : <Text size="sm" c="dimmed">not printed — at verbosity 0, or the
          run stopped before the end</Text>}
      </Row>
    </Stack>
  );
}

// ---- The page ---------------------------------------------------------------

/** The steps' buttons: a run, and the marker whose line to select. */
interface Show { readonly run: RunId; readonly marker: string;
  readonly label: string }

const SHOWS: { readonly [step: number]: readonly Show[] } = {
  2: [{ run: "flash", marker: "banner", label: "flash01's header" },
    { run: "recycle", marker: "plan", label: "a [plan] line" }],
  3: [{ run: "flash", marker: "rrNewton", label: "flash01's Newton" },
    { run: "flash", marker: "flashResult", label: "its verdict" }],
  4: [{ run: "verdict", marker: "fiveNumbers", label: "flash13's five numbers" }],
  5: [{ run: "recycle", marker: "recycleLoop", label: "the recycle loop" },
    { run: "recycle", marker: "finalPass", label: "the final pass" },
    { run: "capped", marker: "recycleFailed", label: "the exit-1 run" }],
  6: [{ run: "flash", marker: "reportMass", label: "flash01's balances" },
    { run: "divergence", marker: "divergenceBlock", label: "a divergence block" },
    { run: "quiet", marker: "caveatsNone", label: "\"none raised\"" }],
  7: [{ run: "flash", marker: "psat", label: "an advisory" },
    { run: "divergence", marker: "divergenceBlock", label: "a divergence" },
    { run: "refused", marker: "error", label: "a refusal" },
    { run: "capped", marker: "recycleFailed", label: "exit 1" }],
};

export function RunLogTool(): JSX.Element {
  const step = lessonStepper(RUN_LOG_STEPS);
  const narrow = useNarrowViewport();

  const [runId, setRunId] = useState<RunId>("flash");
  const [verbosity, setVerbosity] = useState<Verbosity>(3);
  const run = RUNS.find((r) => r.id === runId) ?? RUNS[0]!;

  const [buildErr, setBuildErr] = useState<string | null>(null);
  const state = useCaseFilesRun(() => {
    try {
      const f = filesToCaseFiles(run.case, witnessRaw(run, verbosity));
      setBuildErr(null);
      return f;
    } catch (e) {
      setBuildErr(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, `${run.id}@${verbosity}`, "choupoSolve");

  const log = state.result?.log ?? state.log ?? "";
  const lines = useMemo(() => (log ? classifyLog(log) : []), [log]);
  const counts = useMemo(() => kindCounts(lines), [lines]);

  const [filter, setFilter] = useState<Kind | null>(null);
  //  This app's own lines ([adapter], [worker]) open every browser log and
  //  are none of the engine's business: hidden until asked for, counted on
  //  their chip, and shown again whenever one is picked.
  const [showApp, setShowApp] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  //  A step's button asks for a line of a run that may not be loaded yet.
  //  The request waits for THAT run: it is armed when the run starts (busy)
  //  and served when it ends -- never answered from the previous run's
  //  lines, which are still on screen during the hook's debounce.
  const [focus, setFocus] = useState<{ marker: string; armed: boolean } | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  //  A new run clears the selection; a pending focus (from a step's button)
  //  selects its line as soon as the run that prints it arrives.
  useEffect(() => { setSelected(null); setFilter(null); }, [runId, verbosity]);
  useEffect(() => {
    if (!focus) return;
    if (state.busy) {
      if (!focus.armed) setFocus({ ...focus, armed: true });
      return;
    }
    if (!focus.armed || lines.length === 0) return;
    const l = lines.find((x) => x.via === "marker" && x.marker?.id === focus.marker);
    setFocus(null);
    if (l) pickLine(l.n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, state.busy, lines]);

  const scrollToLine = (n: number): void => {
    const box = boxRef.current;
    const el = box?.querySelector(`[data-line="${n}"]`) as HTMLElement | null;
    //  The box is `position: relative`, so a row's offsetTop is measured
    //  from the box itself.
    if (box && el) box.scrollTop = Math.max(0, el.offsetTop - 60);
  };
  const pickLine = (n: number): void => {
    setSelected(n);
    setFilter(null);
    if (lines.find((l) => l.n === n)?.stream === "app") setShowApp(true);
    requestAnimationFrame(() => {
      scrollToLine(n);
      if (narrow) cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };
  const show = (s: Show): void => {
    if (s.run === runId && verbosity === 3 && !state.busy && lines.length) {
      const l = lines.find((x) => x.via === "marker" && x.marker?.id === s.marker);
      if (l) pickLine(l.n);
    } else {
      setRunId(s.run);
      setVerbosity(3);
      setFocus({ marker: s.marker, armed: false });
    }
    viewerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const visible = filter ? lines.filter((l) => l.kind === filter)
    : lines.filter((l) => showApp || l.stream !== "app");
  const sel = selected !== null ? lines.find((l) => l.n === selected) ?? null : null;
  const engineLines = lines.filter((l) => !l.blank && l.stream !== "app").length;

  const showsFor = (n: number): JSX.Element | null => {
    const list = SHOWS[n];
    if (!list) return null;
    return (
      <Group gap={6} wrap="wrap">
        <Text size="xs" c="dimmed">Show it in the viewer:</Text>
        {list.map((s) => (
          <Button key={`${s.run}-${s.marker}`} size="compact-xs" variant="light"
            onClick={() => show(s)}>{s.label}</Button>
        ))}
      </Group>
    );
  };

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 1200, margin: "0 auto" }}>

        <Box>
          <Title order={3}>How to read a run&apos;s log</Title>
          <Text size="sm" c="dimmed" mt={4}>
            The previous page showed how the dictionaries assemble a case.
            This one reads what a run SAYS: where its log goes, what each
            part of it is, how to tell a converged answer from a qualified
            one, from an answer to a different question, from no answer at
            all. Every log on this page is a real run of a tutorial case,
            made by the engine in your browser a moment ago — nothing in it
            is typed by this page.
          </Text>
        </Box>

        {step(1)}

        {/* ---------------- THE VIEWER ---------------- */}
        <Box ref={viewerRef} id="run-log-viewer"
          style={{ borderLeft: `3px solid ${ACCENT}`, paddingLeft: 12,
            scrollMarginTop: 8 }}>
          <Title order={4}>A real run, line by line</Title>
          <Text size="sm" mt={4}>
            Pick a run and a verbosity. The run is made on a copy of the case
            in this page&apos;s memory; the case is never changed.
          </Text>
        </Box>

        <Stack gap={8}>
          <Group gap={6} wrap="wrap">
            {RUNS.map((r) => (
              <Button key={r.id} size="compact-sm"
                variant={r.id === runId ? "filled" : "default"}
                color={r.exit === 2 ? "red" : r.exit === 1 ? "orange" : undefined}
                onClick={() => setRunId(r.id)}>
                {r.label}
              </Button>
            ))}
          </Group>
          <Group gap={8} wrap="nowrap" align="center">
            <Text size="xs" c="dimmed">verbosity</Text>
            <SegmentedControl size="xs" value={String(verbosity)}
              onChange={(v) => setVerbosity(Number(v) as Verbosity)}
              data={VERBOSITY_LEVELS.map((v) => ({ value: String(v),
                label: String(v) }))} />
          </Group>
          <Text size="xs" c="dimmed">
            <Mono c="dimmed">tutorials/{run.case}</Mono> — {run.shows}.
          </Text>
        </Stack>

        {buildErr && (
          <Alert color="red" title="The witness case could not be prepared">
            <Text size="sm">{buildErr}</Text>
          </Alert>
        )}
        {state.busy && (
          <Group gap={6}><Loader size="xs" />
            <Text size="xs" c="dimmed">running {run.label}…</Text></Group>
        )}
        {!state.busy && state.err && !log && (
          <Alert color="red" title="The run could not be made">
            <Text size="sm">{state.err}</Text>
          </Alert>
        )}

        {!state.busy && lines.length > 0 && (
          <>
            <EndFirst lines={lines} log={log} onPick={pickLine} narrow={narrow} />

            <Group gap={6} wrap="wrap">
              <Button size="compact-xs" variant={filter === null ? "filled" : "default"}
                onClick={() => setFilter(null)}>engine {engineLines}</Button>
              {([...KIND_ORDER, "unclassified"] as Kind[])
                .filter((k) => k !== "app" && (counts[k] ?? 0) > 0).map((k) => (
                  <Button key={k} size="compact-xs"
                    variant={filter === k ? "filled" : "light"}
                    color={k === "unclassified" ? "pink" : KINDS[k].color}
                    onClick={() => setFilter(filter === k ? null : k)}>
                    {labelOf(k)} {counts[k]}
                  </Button>
                ))}
              {(counts.app ?? 0) > 0 && (
                <Button size="compact-xs" variant="subtle" color="gray"
                  onClick={() => { setFilter(null); setShowApp((v) => !v); }}>
                  {showApp ? "hide" : "show"} this app&apos;s {counts.app} lines
                </Button>
              )}
            </Group>

            <Box style={{ display: "grid", gap: 14,
              gridTemplateColumns: narrow ? "1fr" : "minmax(0, 1.8fr) minmax(0, 1fr)" }}>
              <Box ref={boxRef}
                style={{ border: `1px solid ${GRID}`, borderRadius: 4,
                  ["--run-log-font" as string]: narrow ? "10px" : "11px",
                  maxHeight: narrow ? 460 : 620, overflowY: "auto",
                  overflowX: "hidden", position: "relative", padding: "4px 0" }}>
                {visible.map((l) => (
                  <LineRow key={l.n} line={l} selected={l.n === selected}
                    onPick={pickLine} />
                ))}
              </Box>
              <Box ref={cardRef} style={{ minWidth: 0, alignSelf: "start",
                position: narrow ? undefined : "sticky", top: 8 }}>
                <LineCard line={sel} lines={lines} onPick={pickLine} />
              </Box>
            </Box>
          </>
        )}

        <Box>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>
            what each verbosity adds — measured on flash01
          </Text>
          <Table withTableBorder={false} verticalSpacing={4}
            style={{ tableLayout: "fixed", width: "100%" }}>
            <Table.Tbody>
              {VERBOSITY.map((v) => (
                <Table.Tr key={v.level}
                  style={{ background: v.level === verbosity ? SELECTED : undefined }}>
                  <Table.Td style={{ width: "2.4em", verticalAlign: "top" }}>
                    <Text ff="monospace" fw={700} size="sm"
                      c={v.level === verbosity ? "accent" : undefined}>
                      {v.level}</Text>
                  </Table.Td>
                  <Table.Td style={{ verticalAlign: "top" }}>
                    <Text size="sm">{v.level === 0 ? "" : "adds "}{v.adds}</Text>
                    {v.cite && <Mono c="dimmed">{citeText(CITES[v.cite])}</Mono>}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <PanelNote>
            On flash01 the standard-error announcements ([psat], [cp],
            [unmarked]) are the same at every level: they are not governed by
            the verbosity. The caveat block that repeats them is, from 1 up.
          </PanelNote>
        </Box>

        {step(2)}{showsFor(2)}
        {step(3)}{showsFor(3)}
        {step(4)}{showsFor(4)}
        {step(5)}{showsFor(5)}
        {step(6)}{showsFor(6)}
        {step(7)}{showsFor(7)}

        <LessonLimits limits={RUN_LOG_LIMITS} />
      </Stack>
    </Box>
  );
}
