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
  CaseAssemblyTool -- how dictionaries assemble a case (DEV.md 4c C53).

  The first page on the "How Choupo works" shelf.  Its witness is the real
  flash01 case, read from the bundled tutorial registry: the file tree, the
  text of every file and the run are that case's, never a copy typed here.

  THREE PANELS, each under the step it serves:

    * THE FILES -- the case's tree; a click shows the file as written, what
      it says in plain words, and which line of the engine reads it and when
      (caseAssembly.FILE_ROLES, every line held to the tree by a test).
    * THE ASSEMBLY -- the moves between `runCase` and the files a run leaves,
      each at its line, beside the lines THIS page's run printed about its
      own assembly.
    * THE BREAKS -- a copy of the case damaged in memory and run by the
      browser engine; the refusal shown is lifted out of the run's log.

  The page runs the engine twice at most: the intact case (on load, for the
  assembly narration and the files a run writes) and the break the reader
  picked (on click).
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Alert, Badge, Box, Button, Group, Loader, Stack, Text, Title, UnstyledButton,
} from "@mantine/core";

import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { useNarrowViewport } from "./methodsChrome.js";
import { PanelNote } from "./knobPanel.js";
import {
  ASSEMBLY, BREAKS, CASE_ASSEMBLY_WITNESS, CITES, FILE_ROLES, FOLDERS,
  applyBreak, breakDiff, citeText, depthOf, narrationOf, refusalOf,
  writtenFiles, type CaseBreak, type FileRole, type FolderId,
} from "./caseAssembly.js";
import {
  CASE_ASSEMBLY_LIMITS, CASE_ASSEMBLY_STEPS,
} from "./caseAssemblyLesson.js";
import { useCaseFilesRun, useMethodRun } from "../../case/methodRun.js";
import { filesToCaseFiles, tutorialByName } from "../../cases/tutorials.js";

const GRID = "var(--mantine-color-default-border)";
const ACCENT = "var(--mantine-color-accent-5)";
const SELECTED = "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-5))";
const REFUSED = "var(--mantine-color-red-6)";

const QUESTION: { [d in Exclude<FolderId, "root">]: string } =
  Object.fromEntries(FOLDERS.map((f) => [f.dir, f.question])) as
    { [d in Exclude<FolderId, "root">]: string };

/** Monospace text that wraps rather than widening the page at 390 px. */
function Mono({ children, c }: { children: React.ReactNode; c?: string }):
  JSX.Element {
  return (
    <Text span ff="monospace" size="xs" c={c}
      style={{ overflowWrap: "anywhere", lineHeight: 1.45 }}>{children}</Text>
  );
}

/** Prose in which a `backticked` span is something you would type in a
 *  file, drawn in the file's typeface. */
function Prose({ text }: { text: string }): JSX.Element {
  return (
    <>
      {text.split("`").map((part, i) => (i % 2 === 1
        ? <Text key={i} span ff="monospace" fz="0.92em">{part}</Text>
        : <span key={i}>{part}</span>))}
    </>
  );
}

/** A whole file, as written, in a box that scrolls inside itself. */
function FileText({ text }: { text: string }): JSX.Element {
  return (
    <Box component="pre" m={0} px="sm" py={6}
      style={{ border: `1px solid ${GRID}`, borderRadius: 4, maxHeight: 340,
        overflow: "auto", fontSize: 11.5, lineHeight: 1.45,
        fontFamily: "var(--mantine-font-family-monospace)",
        whiteSpace: "pre" }}>
      {text.length === 0 ? "(empty file -- zero bytes)" : text}
    </Box>
  );
}

// ---- THE FILES --------------------------------------------------------------

function FileTree({ selected, onSelect }: {
  selected: string; onSelect: (path: string) => void;
}): JSX.Element {
  const rows: JSX.Element[] = [];
  let lastFolder: FolderId | null = null;
  let lastSub = "";
  for (const r of FILE_ROLES) {
    if (r.folder !== lastFolder) {
      lastFolder = r.folder;
      lastSub = "";
      if (r.folder !== "root") {
        const f = FOLDERS.find((x) => x.dir === r.folder)!;
        rows.push(
          <Group key={`dir-${r.folder}`} gap={6} mt={6} pl={9 + 14} wrap="nowrap">
            <Mono>{r.folder}/</Mono>
            <Badge size="xs" variant="light">{f.question}</Badge>
          </Group>);
      }
    }
    //  A sub-folder (constant/components/) gets its own row, once.
    const parts = r.path.split("/");
    const sub = parts.slice(1, -1).join("/");
    if (sub && sub !== lastSub) {
      lastSub = sub;
      rows.push(
        <Box key={`sub-${r.path}`} pl={9 + 28}><Mono>{sub}/</Mono></Box>);
    }
    const name = parts[parts.length - 1]!;
    const on = r.path === selected;
    rows.push(
      <UnstyledButton key={r.path} onClick={() => onSelect(r.path)}
        aria-pressed={on}
        aria-label={`read ${r.path}`}
        style={{ display: "block", width: "100%", borderRadius: 4,
          padding: "2px 6px", paddingLeft: 6 + 14 * (depthOf(r.path) + 1),
          background: on ? SELECTED : undefined,
          borderLeft: `3px solid ${on ? ACCENT : "transparent"}` }}>
        <Mono>{name}</Mono>
      </UnstyledButton>);
  }
  return (
    <Box>
      <Mono c="dimmed">flash01_benzene_toluene/</Mono>
      <Box mt={4}>{rows}</Box>
    </Box>
  );
}

function FileCard({ role, text }: { role: FileRole; text: string | undefined }):
  JSX.Element {
  return (
    <Stack gap={8} style={{ minWidth: 0 }}>
      <Group gap={8} wrap="wrap">
        <Mono>{role.path}</Mono>
        {role.folder !== "root" && (
          <Badge size="xs" variant="light">{QUESTION[role.folder]}</Badge>
        )}
      </Group>
      <Box>
        <Text size="xs" c="dimmed" fw={700} tt="uppercase">what it says</Text>
        <Text size="sm" mt={2}><Prose text={role.says} /></Text>
      </Box>
      <Box>
        <Text size="xs" c="dimmed" fw={700} tt="uppercase">
          who reads it, and when
        </Text>
        <Stack gap={6} mt={4}>
          {role.readers.map((rd, i) => (
            <Box key={i} pl={8} style={{ borderLeft: `2px solid ${GRID}` }}>
              <Text size="sm">
                <Text span fw={600}>{rd.who}</Text>
                {" — "}<Prose text={rd.when} />
              </Text>
              <Mono c="dimmed">{citeText(CITES[rd.cite])}</Mono>
            </Box>
          ))}
        </Stack>
      </Box>
      <Box>
        <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>
          the file, as it is
        </Text>
        {text === undefined
          ? <Alert color="red">This file is not in the bundled case.</Alert>
          : <FileText text={text} />}
      </Box>
    </Stack>
  );
}

// ---- The page ---------------------------------------------------------------

export function CaseAssemblyTool(): JSX.Element {
  const step = lessonStepper(CASE_ASSEMBLY_STEPS);
  const narrow = useNarrowViewport();

  const entry = tutorialByName(CASE_ASSEMBLY_WITNESS);
  const raw = entry?.files.rawFiles;

  const [selected, setSelected] = useState("system/controlDict");
  const role = FILE_ROLES.find((r) => r.path === selected) ?? FILE_ROLES[0]!;

  //  The intact case, run once: its log narrates the assembly (step 3) and
  //  its result lists the files a run writes (step 5).
  const authored = useMethodRun(raw ? CASE_ASSEMBLY_WITNESS : null, [],
    "as-authored", "choupoSolve");
  const narration = useMemo(
    () => narrationOf(authored.result?.log ?? authored.log ?? ""),
    [authored.result, authored.log]);
  const written = authored.result ? writtenFiles(authored.result) : [];
  const vOverF = authored.result?.kpis?.["flash01"]?.["V_over_F"];

  //  The break the reader picked, run on a damaged COPY.
  const [breakId, setBreakId] = useState<CaseBreak["id"] | null>(null);
  const brk = BREAKS.find((b) => b.id === breakId) ?? null;
  const broken = useCaseFilesRun(
    raw && brk
      ? () => filesToCaseFiles(CASE_ASSEMBLY_WITNESS, applyBreak(raw, brk))
      : null,
    brk?.id ?? "", "choupoSolve");
  const refusal = refusalOf(broken.log);
  const [showLog, setShowLog] = useState(false);

  //  From the assembly list: open the file and bring the files panel into
  //  view.  From the tree on a phone, where the card sits BELOW the tree:
  //  bring the card into view, or the click appears to do nothing.
  const pick = (path: string): void => {
    setSelected(path);
    if (typeof document !== "undefined")
      document.getElementById(narrow ? "case-assembly-card" : "case-assembly-files")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const choose = (path: string): void => {
    if (narrow) pick(path); else setSelected(path);
  };

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>

        <Box>
          <Title order={3}>How dictionaries assemble a case</Title>
          <Text size="sm" c="dimmed" mt={4}>
            The other pages use Choupo to teach chemical engineering. This one
            is about Choupo itself: what a case is on disk, which file says
            what, in which order the engine reads them, what it writes back,
            and what it says when a file is wrong. The case on this page is
            the real flash01 — the first case a new user runs — read from the
            tutorials this app ships, not retyped.
          </Text>
        </Box>

        {!raw && (
          <Alert color="red" title="The witness case is not in this build">
            tutorials/{CASE_ASSEMBLY_WITNESS} was not bundled, so there is no
            case to show. This is a build problem, not something you did.
          </Alert>
        )}

        {step(1)}

        {/* ---------------- THE FILES ---------------- */}
        <Box id="case-assembly-files"
          style={{ borderLeft: `3px solid ${ACCENT}`, paddingLeft: 12 }}>
          <Title order={4}>The files of flash01</Title>
          <Text size="sm" mt={4}>
            Click a file. You get what it says, the line of the engine that
            reads it and when, and the file itself exactly as it is on disk.
          </Text>
        </Box>
        {raw && (
          <Box style={{ display: "grid", gap: 16,
            gridTemplateColumns: narrow ? "1fr" : "minmax(200px, 250px) 1fr" }}>
            <Box>
              <FileTree selected={selected} onSelect={choose} />
            </Box>
            <Box id="case-assembly-card" style={{ minWidth: 0 }}>
              <FileCard role={role} text={raw[role.path]} />
            </Box>
          </Box>
        )}

        {step(2)}
        {step(3)}

        {/* ---------------- THE ASSEMBLY ---------------- */}
        <Box style={{ borderLeft: `3px solid ${ACCENT}`, paddingLeft: 12 }}>
          <Title order={4}>The assembly, move by move</Title>
          <Text size="sm" mt={4}>
            The numbered list is what happens between <Mono>runCase</Mono> and
            the files a run leaves behind, with the line that does each move;
            a file name opens that file above. Beside it (below it on a
            narrow screen) are the lines the engine printed about its own
            assembly when this page ran flash01 a moment ago.
          </Text>
        </Box>
        <Box style={{ display: "grid", gap: 16,
          gridTemplateColumns: narrow ? "1fr" : "minmax(0, 1.15fr) minmax(0, 1fr)" }}>
          <Stack gap={6}>
            {ASSEMBLY.map((m, i) => (
              <Group key={i} gap={8} wrap="nowrap" align="flex-start">
                <Text size="xs" ff="monospace" c="dimmed" w={18}
                  style={{ flexShrink: 0 }}>{i + 1}</Text>
                <Box style={{ minWidth: 0 }}>
                  <Text size="sm"><Prose text={m.what} /></Text>
                  <Box>
                    {m.reads && (
                      <UnstyledButton onClick={() => pick(m.reads!)}
                        aria-label={`open ${m.reads}`}
                        style={{ display: "inline", marginRight: 10 }}>
                        <Mono c="accent">{m.reads}</Mono>
                      </UnstyledButton>
                    )}
                    <Mono c="dimmed">{citeText(CITES[m.cite])}</Mono>
                  </Box>
                </Box>
              </Group>
            ))}
          </Stack>
          <Box px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
            <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={6}>
              what the run said about itself
            </Text>
            {authored.busy && (
              <Group gap={6}><Loader size="xs" />
                <Text size="xs" c="dimmed">running flash01…</Text></Group>
            )}
            {!authored.busy && authored.err && (
              <Alert color="red" title="The run did not finish">
                <Text size="sm">{authored.err}</Text>
              </Alert>
            )}
            <Stack gap={8}>
              {narration.map(({ mark, line }) => (
                <Box key={mark.id}>
                  <Mono>{line}</Mono>
                  <Text size="xs" c="dimmed">
                    <Prose text={mark.means} />
                    {mark.answers ? <> — <Mono c="dimmed">{mark.answers}</Mono></> : null}
                  </Text>
                </Box>
              ))}
            </Stack>
          </Box>
        </Box>

        {step(4)}
        {step(5)}

        {/* ---------------- WHAT IT WROTE ---------------- */}
        <Box style={{ borderLeft: `3px solid ${ACCENT}`, paddingLeft: 12 }}>
          <Title order={4}>What this page's run wrote</Title>
          <Text size="sm" mt={4}>
            The same run, read back: the files it handed back, by folder.
            Nothing here is listed by hand.
          </Text>
        </Box>
        <Stack gap={8}>
          {authored.result && (
            <Group gap="xs" wrap="wrap">
              <Badge variant="light" color="teal">converged</Badge>
              {typeof vOverF === "number" && (
                <Badge variant="light">
                  flash01: V/F = {vOverF.toFixed(4)}
                </Badge>
              )}
            </Group>
          )}
          {written.map((g) => (
            <Box key={g.folder}>
              <Mono>{g.folder === "." ? "(case root)" : `${g.folder}/`}</Mono>
              <Box pl={14}>
                {g.files.map((f) => (
                  <Box key={f}><Mono c="dimmed">
                    {g.folder === "." ? f : f.slice(g.folder.length + 1)}
                  </Mono></Box>
                ))}
              </Box>
            </Box>
          ))}
          {authored.result && !written.some((g) => g.folder === "design") && (
            <PanelNote>
              No design/: flash01 declares no system/postDict, so no sizing
              pass ran and the engine wrote no specification sheet.
            </PanelNote>
          )}
          {authored.result && (
            <PanelNote>
              The browser hands back converged/ and the CSV reports. A run
              from a terminal leaves the same files on disk, plus the
              spreadsheet the controlDict asks for (reports/report.ods)
              and the log file runCase saves (log.choupoSolve).
            </PanelNote>
          )}
          {(authored.result?.log ?? authored.log) && (
            <Box>
              <Button size="xs" variant="default"
                onClick={() => setShowLog((s) => !s)}>
                {showLog ? "hide" : "show"} this run&apos;s log
              </Button>
              {showLog && (
                <Box mt={6}>
                  <FileText text={authored.result?.log ?? authored.log ?? ""} />
                </Box>
              )}
            </Box>
          )}
        </Stack>

        {step(6)}

        {/* ---------------- THE BREAKS ---------------- */}
        <Box style={{ borderLeft: `3px solid ${REFUSED}`, paddingLeft: 12 }}>
          <Title order={4}>Break a copy of flash01</Title>
          <Text size="sm" mt={4}>
            Pick one. The copy lives in this page&apos;s memory only; the case
            is never changed.
          </Text>
        </Box>
        <Group gap="xs" wrap="wrap">
          {BREAKS.map((b) => (
            <Button key={b.id} size="xs"
              variant={b.id === breakId ? "filled" : "default"}
              color={b.id === breakId ? "red" : undefined}
              onClick={() => setBreakId(b.id === breakId ? null : b.id)}>
              {b.label}
            </Button>
          ))}
        </Group>
        {brk && <BreakView brk={brk} busy={broken.busy}
          refusal={refusal} ran={broken.result !== null}
          err={broken.err} />}

        <LessonLimits limits={CASE_ASSEMBLY_LIMITS} />
      </Stack>
    </Box>
  );
}

function BreakView({ brk, busy, refusal, ran, err }: {
  brk: CaseBreak; busy: boolean; refusal: string | null; ran: boolean;
  err: string | null;
}): JSX.Element {
  const d = breakDiff(brk);
  return (
    <Stack gap={10}>
      <Box px="sm" py={6}
        style={{ border: `1px solid ${GRID}`, borderRadius: 4 }}>
        <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>
          the edit, in the copy of <Mono c="dimmed">{d.file}</Mono>
        </Text>
        {d.kept.map((l) => (
          <Box key={` ${l}`}><Mono c="dimmed">{"  "}{l}</Mono></Box>
        ))}
        {d.removed.map((l) => (
          <Box key={`-${l}`}><Mono c="red">- {l}</Mono></Box>
        ))}
        {d.added.map((l) => (
          <Box key={`+${l}`}><Mono c="teal">+ {l}</Mono></Box>
        ))}
      </Box>
      <Text size="sm">
        <Text span fw={600}>The rule: </Text><Prose text={brk.rule} />
      </Text>
      <Text size="sm">
        <Text span fw={600}>Where it stops: </Text>{brk.stopsAt}, at{" "}
        <Mono>{citeText(CITES[brk.site])}</Mono>.
      </Text>
      {busy && (
        <Group gap={6}><Loader size="xs" />
          <Text size="xs" c="dimmed">running the damaged copy…</Text></Group>
      )}
      {!busy && refusal && (
        <Alert color="red" title="Choupo refused the case — its own words">
          <Text size="xs" ff="monospace"
            style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {refusal}
          </Text>
        </Alert>
      )}
      {!busy && !refusal && ran && (
        <Alert color="yellow" title="The engine did NOT refuse this copy">
          <Text size="sm">
            The damaged case ran to the end. That contradicts what this page
            says the engine does, and the page is what is wrong — please
            report it.
          </Text>
        </Alert>
      )}
      {!busy && !refusal && !ran && err && (
        <Alert color="orange" title="The run did not finish">
          <Text size="sm">{err}</Text>
        </Alert>
      )}
    </Stack>
  );
}
