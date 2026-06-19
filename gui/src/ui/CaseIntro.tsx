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
  CaseIntro -- the guided first screen of a TUTORIAL: the Choupo manifesto in
  executable form.  It must PROVE the philosophy, not just say "nothing is
  hidden".  Four visible proofs:

    1. The case is a FOLDER of plain-text dictionaries (files first, GUI second
       -- the case files are the source of truth).  Shown as the case's REAL
       tree + a dict excerpt.
    2. Running is an INSPECTABLE PIPELINE, not a magic button: read dicts ->
       model -> equation -> Newton -> write.  Shown as the real sequence.
    3. The solver SHOWS ITS WORK: K-values + every Newton iteration.  Shown as a
       REAL excerpt of this case's log.
    4. Because the case is plain text, an AI ASSISTANT edits the real files --
       it does not float on a black box.  The student ALIGNS the assistant with
       the designer's intent; the dicts stay the source of truth.

  Numerical honesty (the credo): the tree + dict are the case's REAL files; the
  trace is a REAL log excerpt (per flagship case) or an honest generic promise.
  NEVER fabricated numbers, no WASM run on mount.  The full app menu is hidden
  here (MenuBar) so it reads as a lesson, not an IDE.
\*---------------------------------------------------------------------------*/

import { Badge, Box, Button, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { IconArrowLeft, IconFolderCode, IconPlayerPlay, IconRobot, IconRoute, IconTerminal2 } from "@tabler/icons-react";

import { useStore } from "../state/store.js";

const APP_LABEL: { [k: string]: string } = {
  choupoSolve: "Steady-state",
  choupoBatch: "Batch",
  choupoCtrl: "Dynamic / control",
  choupoProps: "Properties",
};

// Per-flagship REAL specifics (captured from an actual run -- the numbers are
// the engine's own).  Cases without an entry fall back to honest generics.
const FLASH01 = "steady/flash/flash01_benzene_toluene";
const ADIAB01 = "steady/flash/adiabaticFlash01_benzene_toluene";
const GUIDE: { [id: string]: { model: string; sequence: string; trace: string } } = {
  [FLASH01]: {
    model:
      "Raoult VLE,  γ = ideal\n"
      + "Kᵢ = γ · Psatᵢ(T) / P\n"
      + "flash residual:  R(V/F) = Σ zᵢ(Kᵢ−1) / [1 + (V/F)(Kᵢ−1)] = 0\n"
      + "→ Newton on the vapour fraction V/F",
    sequence:
      "read the dicts (system/, constant/)\n"
      + "  → check units & components\n"
      + "  → load benzene / toluene data\n"
      + "  → build the property model (Raoult, ideal γ)\n"
      + "  → compute Kᵢ = Psatᵢ(T) / P\n"
      + "  → assemble the flash residual R(V/F) = 0\n"
      + "  → Newton iterations on V/F\n"
      + "  → write streams, log, report",
    trace:
      "K-values  (γ = ideal, φ = idealGas)\n"
      + "  benzene   Psat 1.6514 bar   K = 1.6514\n"
      + "  toluene   Psat 0.6735 bar   K = 0.6735\n"
      + "\n"
      + "Rachford-Rice (Newton):\n"
      + "  it     V           g(V)\n"
      + "  0   0.5000000   -3.76e-02\n"
      + "  1   0.3000186    7.82e-04\n"
      + "  2   0.3039807    5.66e-07\n"
      + "  3   0.3039836    2.95e-13   ✓\n"
      + "\n"
      + "V/F = 0.3040   (two-phase)",
  },
  // Adiabatic flash: Q = 0 by definition (the honest default -- Q is never an
  // input key on a flash), so the T drop and the vapour fraction are RESULTS
  // of the energy balance, not settings.  Watch vf and T_out in the streams,
  // and note the flowsheet shows NO duty stub -- there is no heat to draw.
  [ADIAB01]: {
    model:
      "Raoult VLE,  γ = ideal,   Q = 0  (adiabatic — by definition, not an input)\n"
      + "Kᵢ = Psatᵢ(T) / P\n"
      + "energy balance:  H_out(T, V/F) = H_in   (the flash cools itself)\n"
      + "→ outer Newton on T, inner Rachford-Rice flash at each T",
    sequence:
      "read the dicts (system/, constant/)\n"
      + "  → check units & components\n"
      + "  → load benzene / toluene data\n"
      + "  → build the property model (Raoult, ideal γ)\n"
      + "  → expand the feed 3 bar → 1 atm with Q = 0\n"
      + "  → outer Newton on T to close H_out = H_in\n"
      + "  → inner Rachford-Rice flash at each T\n"
      + "  → write streams, log, report",
    trace:
      "Outer Newton in T (energy balance):\n"
      + "   it       T [K]       H_out−Hreq\n"
      + "  0     380.0000     3.17088e+04\n"
      + "  1     365.0000    -2.22540e+03\n"
      + "  2     380.0000     3.17088e+04\n"
      + "  3     372.5000     1.83628e+04\n"
      + "  4     369.0596     1.77921e+03\n"
      + "  5     368.6723     7.08286e-02   ✓\n"
      + "\n"
      + "T_out = 368.67 K   (ΔT drop 11.33 K — no duty, the vapour pays for itself)\n"
      + "V/F  = 0.0534   (two-phase)",
  },
};

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function modelOf(block: unknown): string | undefined {
  return asString((block as { model?: unknown } | undefined)?.model);
}

// The case's REAL file tree (the simulation files only -- not teaching/agent
// artefacts), so the student sees Choupo is a folder of plain-text dicts.
function caseTree(rawFiles: { [p: string]: string }, caseName: string): string {
  const keep = (p: string) =>
    /\.cho$/.test(p) || p.startsWith("system/") || p.startsWith("constant/");
  const paths = Object.keys(rawFiles).filter(keep).sort();
  const top: string[] = [];
  const folders: { [f: string]: string[] } = {};
  for (const p of paths) {
    const i = p.indexOf("/");
    if (i < 0) top.push(p);
    else { const f = p.slice(0, i); (folders[f] = folders[f] || []).push(p.slice(i + 1)); }
  }
  const lines = [caseName + "/"];
  const dirNames = Object.keys(folders).sort();
  const entries = [
    ...top.sort().map((name) => ({ dir: false, name, children: [] as string[] })),
    ...dirNames.map((name) => ({ dir: true, name, children: folders[name]!.sort() })),
  ];
  entries.forEach((e, idx) => {
    const last = idx === entries.length - 1;
    lines.push("  " + (last ? "└─ " : "├─ ") + e.name + (e.dir ? "/" : ""));
    if (e.dir) {
      e.children.forEach((c, j) => {
        const clast = j === e.children.length - 1;
        lines.push("  " + (last ? "    " : "│  ") + (clast ? "└─ " : "├─ ") + c);
      });
    }
  });
  return lines.join("\n");
}

function inputExcerpt(raw: string | undefined, max: number): string {
  if (!raw) return "";
  const noBlock = raw.replace(/\/\*[\s\S]*?\*\//g, "");
  const lines = noBlock
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").replace(/\s+$/, ""))
    .filter((l) => l.trim().length > 0);
  const head = lines.slice(0, max);
  if (lines.length > max) head.push("…");
  return head.join("\n");
}

const PANEL: React.CSSProperties = {
  background: "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-7))",
  border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
  borderRadius: 8,
  padding: "10px 12px",
  fontFamily: "var(--mantine-font-family-monospace)",
  fontSize: 12,
  lineHeight: 1.5,
  whiteSpace: "pre",
  overflowX: "auto",
  color: "light-dark(var(--mantine-color-gray-8), var(--mantine-color-gray-3))",
};

function StepHead({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <Group gap={8} align="center">
      <Box style={{
        width: 22, height: 22, borderRadius: 11, flexShrink: 0,
        background: "light-dark(var(--mantine-color-accent-6), var(--mantine-color-accent-9))", color: "light-dark(var(--mantine-color-white), var(--mantine-color-accent-3))",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 700,
      }}>{n}</Box>
      <Text fw={600} c="var(--mantine-color-text)" size="sm">{children}</Text>
    </Group>
  );
}

export function CaseIntro() {
  const caseFiles = useStore((s) => s.caseFiles);
  const tutorialName = useStore((s) => s.tutorialName);
  const dismissIntro = useStore((s) => s.dismissIntro);
  const goHome = useStore((s) => s.goHome);

  const cd = caseFiles.controlDict ?? {};
  const tp = (caseFiles.thermoPackage ?? {}) as Record<string, unknown>;
  const raw = caseFiles.rawFiles ?? {};

  const fileId = tutorialName.split("/").pop() ?? tutorialName;
  const description = asString(cd["description"]) ?? fileId;
  const application = asString(cd["application"]) ?? "choupoSolve";
  const appLabel = APP_LABEL[application] ?? application;
  const activity = modelOf(tp["activityModel"]);
  const eos = modelOf(tp["equationOfState"]);
  const isProps = application === "choupoProps" || (!caseFiles.flowsheet && !!caseFiles.propsDict);

  const tree = caseTree(raw, fileId);
  const inputText =
    inputExcerpt(raw["system/flowsheetDict"], 12) ||
    inputExcerpt(raw["system/propsDict"], 12) ||
    "(no input dict found)";

  const guide = GUIDE[tutorialName];
  const sequence = guide
    ? guide.sequence
    : isProps
    ? "read the dicts → check units & components → build the property model →\nevaluate each property → write the results table + plots"
    : "read the dicts → check units & components → build the property model →\nassemble the residuals F(x) = 0 → Newton iterations → write streams, log, report";
  const modelPath = guide
    ? guide.model
    : (activity || eos
        ? `activity: ${activity ?? "—"},  EoS: ${eos ?? "—"}`
        : "the thermodynamic models declared in constant/thermoPackage");
  const trace = guide
    ? guide.trace
    : isProps
    ? "Each property is evaluated and printed point by point —\nK-values, Psat, γ, Z — with the exact formula it used.\n\nPress “Open & run” to watch it."
    : "Newton on F(x) = 0.  Every K-value, every iteration and its\nshrinking residual prints to the Log — live, as it solves.\n\nNothing is hidden behind a spinner.";

  const proceed = () => dismissIntro();
  const proceedRun = () => {
    dismissIntro();
    setTimeout(() => window.dispatchEvent(new CustomEvent("choupo:run")), 60);
  };

  return (
    <Box style={{
      width: "100%", height: "100%", overflow: "auto",
      display: "flex", justifyContent: "center",
      padding: "36px 32px", background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))",
    }}>
      <Stack gap="xl" style={{ maxWidth: 760, width: "100%" }}>
        <Text size="xs" c="dimmed" style={{ cursor: "pointer", width: "fit-content" }} onClick={goHome}>
          <IconArrowLeft size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
          Back to welcome
        </Text>

        {/* Hero -- subject first, the manifesto framing, run action right here */}
        <Stack gap={8}>
          <Text size="xs" tt="uppercase" fw={700} c="accent" style={{ letterSpacing: 1.5 }}>
            Glass-box tutorial
          </Text>
          <Title order={2} c="var(--mantine-color-text)" fw={800} style={{ letterSpacing: -0.3, lineHeight: 1.15 }}>
            {description}
          </Title>
          <Group gap={8}>
            <Text size="xs" c="dimmed" ff="monospace">{fileId}</Text>
            <Badge size="xs" variant="light" color="gray">{appLabel}</Badge>
          </Group>
          <Text c="dimmed" size="sm" maw={640} mt={2}>
            A tiny case, deliberately transparent. The case is a <b>folder of
            plain-text dictionaries</b>; the solver reads them, shows the
            equations, and prints every Newton step.
          </Text>
          <Group gap="md" align="center" mt={6}>
            <Button color="accent" size="md" leftSection={<IconPlayerPlay size={18} />} onClick={proceedRun}>
              Open &amp; run — watch Newton converge
            </Button>
            <Text size="xs" c="dimmed" td="underline" style={{ cursor: "pointer" }} onClick={proceed}>
              Just open the files
            </Text>
          </Group>
        </Stack>

        {/* Light proof summary -- the three ideas at a glance; the detail is below */}
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          {[
            { icon: <IconFolderCode size={18} />, t: "Case folder", d: "Plain-text dictionaries are the source of truth." },
            { icon: <IconRoute size={18} />, t: "Simulation path", d: "dicts → model → equation → Newton → report." },
            { icon: <IconTerminal2 size={18} />, t: "Solver trace", d: "Every K-value and iteration is printed." },
          ].map((c) => (
            <Paper key={c.t} withBorder p="sm" radius="md" style={{ background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))" }}>
              <Group gap={6} mb={4}>
                <Box style={{ color: "light-dark(var(--mantine-color-accent-6), var(--mantine-color-accent-4))" }}>{c.icon}</Box>
                <Text size="sm" fw={700} c="var(--mantine-color-text)">{c.t}</Text>
              </Group>
              <Text size="xs" c="dimmed">{c.d}</Text>
            </Paper>
          ))}
        </SimpleGrid>

        {/* 1. The case folder -- the dictionaries are the source of truth */}
        <Stack gap={8}>
          <StepHead n={1}>The case folder — the dictionaries are the source of truth</StepHead>
          <Group align="stretch" grow gap="sm" wrap="wrap">
            <Box style={{ ...PANEL, minWidth: 240 }}>{tree}</Box>
            <Box style={{ ...PANEL, minWidth: 240 }}>{inputText}</Box>
          </Group>
          <Text size="sm" c="dimmed">
            Not a binary project file. The GUI <b>reads</b> these dicts, the solver
            <b> runs</b> them, and the AI assistant <b>edits</b> them. Files first,
            GUI second.
          </Text>
        </Stack>

        {/* 2. The pipeline + model path -- not a magic button */}
        <Stack gap={8}>
          <StepHead n={2}>Press Run — an inspectable pipeline, not a magic button</StepHead>
          <Box style={PANEL}>{sequence}</Box>
          <Box style={{ ...PANEL, color: "light-dark(var(--mantine-color-gray-8), var(--mantine-color-gray-2))" }}>{modelPath}</Box>
          <Text size="sm" c="dimmed">
            The model is a <b>choice you can see the evidence for</b> — swap one,
            re-run, watch the result change. All models are wrong; some are useful.
          </Text>
        </Stack>

        {/* 3. The run trace -- the solver shows its work (REAL log) */}
        <Stack gap={8}>
          <StepHead n={3}>Watch it solve — every K-value, every iteration</StepHead>
          <Box style={PANEL}>{trace}</Box>
          <Text size="xs" c="dimmed">
            {guide
              ? "A real excerpt of this case's log — press Open & run to watch it stream live."
              : "This streams live in the Log when you press Open & run."}
          </Text>
        </Stack>

        {/* 4. AI-assisted authoring -- it edits the real files; you align it */}
        <Box style={{
          border: "1px solid light-dark(var(--mantine-color-accent-3), var(--mantine-color-accent-9))", borderRadius: 10,
          background: "light-dark(color-mix(in srgb, var(--mantine-color-accent-6) 10%, transparent), color-mix(in srgb, var(--mantine-color-accent-9) 18%, transparent))",
          padding: "14px 16px",
        }}>
          <Group gap={8} mb={6}>
            <IconRobot size={18} style={{ color: "light-dark(var(--mantine-color-accent-6), var(--mantine-color-accent-4))" }} />
            <Text fw={700} c="var(--mantine-color-text)" size="sm">AI-assisted authoring — you set the intent and approve</Text>
          </Group>
          <Text size="sm" c="dimmed" mb={8}>
            You describe the process <b>intent</b>. The assistant drafts the
            dictionaries, explains the changes, and can show the <b>exact diff</b>
            before applying. <b>You</b> approve the assumptions, the model, and the
            run. It is not a chatbot on a black box — it works on transparent,
            plain-text files, and the dicts remain the source of truth.
          </Text>
          <Stack gap={2}>
            {[
              "explain what a dictionary does",
              "change the feed composition",
              "switch the thermodynamic model (Raoult → NRTL) and re-run",
              "add a sensitivity sweep",
              "check the units before running",
            ].map((t) => (
              <Text key={t} size="xs" c="dimmed">— {t}</Text>
            ))}
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}
