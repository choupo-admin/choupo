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
  ClipboardBridge -- the UNIVERSAL agent path: the student's OWN claude.ai via
  the clipboard.  No install, any OS (Windows / macOS / Linux / Chromebook), no
  backend.  Knowledge ships in the tool (docs/ai is bundled and travels in the
  copied context), so the student's claude.ai is "born taught".

  COPY: assemble {role + the rules + docs/ai guide + the open case's files + the
  request + a strict return format} -> clipboard -> paste into claude.ai.
  APPLY: paste claude.ai's reply -> parse the "=== FILE: <path> ===" blocks ->
  validate the dict ones -> update the in-memory case (GUI reflects it) AND
  download each changed file (dicts on disk stay the source of truth).
\*---------------------------------------------------------------------------*/

import { useState } from "react";
import { Alert, Badge, Box, Button, Group, Modal, Stack, Tabs, Text, Textarea } from "@mantine/core";
import { IconClipboardCopy, IconClipboardCheck, IconCheck, IconAlertTriangle, IconDownload } from "@tabler/icons-react";

import { useStore } from "../state/store.js";
import { buildGuideContext, buildRequestContext, parseClaudeReply, applyEdits } from "../agent/clipboardContext.js";
import { downloadCaseFile, downloadCaseZip } from "../case/saveCase.js";

export function ClipboardBridge({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const caseFiles = useStore((s) => s.caseFiles);
  const tutorialName = useStore((s) => s.tutorialName);
  const applyCaseFiles = useStore((s) => s.applyCaseFiles);

  const [question, setQuestion] = useState("");
  const [copied, setCopied] = useState(false);
  const [guideCopied, setGuideCopied] = useState(false);
  const [reply, setReply] = useState("");
  const [applied, setApplied] = useState<{ changed: string[]; errors: string[] } | null>(null);
  // On the HOSTED site (a remote hostname) the copy-paste dance does not belong:
  // authoring is done LOCALLY with the student's own agent on the downloaded case
  // (born-taught -- the rules are in ai/).  Only on localhost do we show the
  // paste-based clipboard bridge (a fallback for someone with no local agent).
  const isLocalHost = typeof location !== "undefined"
    && (location.hostname === "localhost" || location.hostname === "127.0.0.1");

  const copyRequest = async () => {
    const ctx = buildRequestContext(caseFiles, tutorialName, question);
    try { await navigator.clipboard.writeText(ctx); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { /* clipboard blocked */ }
  };
  const copyGuide = async () => {
    try { await navigator.clipboard.writeText(buildGuideContext()); setGuideCopied(true); setTimeout(() => setGuideCopied(false), 2500); }
    catch { /* */ }
  };

  const applyReply = () => {
    const edits = parseClaudeReply(reply);
    if (edits.length === 0) { setApplied({ changed: [], errors: ["No \"=== FILE: … ===\" blocks found in the reply."] }); return; }
    const { next, changed, errors } = applyEdits(caseFiles, edits);
    if (changed.length) {
      applyCaseFiles(next);
      for (const p of changed) downloadCaseFile(p, next.rawFiles![p]!, tutorialName);
    }
    setApplied({ changed, errors });
  };

  return (
    <Modal opened={opened} onClose={onClose} size={isLocalHost ? "xl" : "lg"} title={
      <Group gap={6}><IconClipboardCopy size={17} /><Text fw={600}>
        {isLocalHost ? "Ask your Claude (clipboard bridge)" : "Author with AI — on your PC"}
      </Text></Group>
    }>
      {!isLocalHost ? (
        <Stack gap="sm">
          <Alert color="cyan" variant="light">
            <Text size="sm" fw={600} mb={4}>This site RUNS cases. To AUTHOR with AI, work on your PC.</Text>
            <Text size="xs">
              Download this case and open the folder with your OWN agent — it is
              <strong> born taught</strong>: the Choupo rules live in
              <code> ai/choupo-authoring.md</code> inside the case (offline, no copy-paste).
              Any agent that reads <code>CLAUDE.md</code> / <code>AGENTS.md</code> (Claude Code,
              Cursor, Aider, …) is led straight to <code>ai/</code>.
            </Text>
          </Alert>
          <Text size="sm" c="dimmed">
            1. Download the case (.zip) below.&nbsp; 2. Unzip + open the folder with your agent
            — it reads the brief and the skills in <code>ai/</code> and is ready.&nbsp;
            3. Describe what you want in plain language; then re-open the case here
            (<strong>File → Open Case</strong>) to run it.
          </Text>
          <Group>
            <Button leftSection={<IconDownload size={16} />} color="accent"
              onClick={() => downloadCaseZip(caseFiles, tutorialName)}>
              Download case (.zip)
            </Button>
            <Text size="xs" c="dimmed">nothing installed on the site · the agent runs on your PC</Text>
          </Group>
        </Stack>
      ) : (
      <Tabs defaultValue="copy">
        <Tabs.List>
          <Tabs.Tab value="copy" leftSection={<IconClipboardCopy size={14} />}>1 · Copy for Claude</Tabs.Tab>
          <Tabs.Tab value="apply" leftSection={<IconClipboardCheck size={14} />}>2 · Apply the reply</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="copy" pt="sm">
          <Stack gap="xs">
            <Alert color="cyan" variant="light" p="xs">
              <Text size="xs">
                <strong>One-time setup:</strong> create a Project in your own
                <strong> claude.ai</strong>, and paste the Choupo guide into its knowledge
                ONCE.  After that, every request below is just this case + your ask (small).
                <em> (Have a local <code>claude</code>? Use the 🤖 console instead — no copy-paste.)</em>
              </Text>
              <Button mt={6} size="xs" variant="default"
                leftSection={guideCopied ? <IconCheck size={14} /> : <IconClipboardCopy size={14} />}
                onClick={copyGuide}>
                {guideCopied ? "Guide copied — paste into a claude.ai Project (once)" : "Copy the Choupo guide (one-time, ~97 KB)"}
              </Button>
            </Alert>

            <Text size="sm" c="dimmed">
              Then: type your request, copy <strong>request + case</strong> (small — just
              <code> {tutorialName}</code>'s files + your ask), paste it in the Project, and
              bring the reply to tab 2.  You decide; it enacts.
            </Text>
            <Textarea
              label="Your request"
              placeholder='e.g. "Use NRTL in the flash" · "Promote the order-2 Arrhenius fit (Ea in kJ/mol) into the reactor"'
              autosize minRows={2} maxRows={6}
              value={question} onChange={(e) => setQuestion(e.currentTarget.value)}
            />
            <Group>
              <Button leftSection={copied ? <IconCheck size={16} /> : <IconClipboardCopy size={16} />}
                color={copied ? "teal" : "accent"} onClick={copyRequest}>
                {copied ? "Copied — paste into your Project" : "Copy request + case"}
              </Button>
              <Text size="xs" c="dimmed">no install · any OS · uses your own Claude</Text>
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="apply" pt="sm">
          <Stack gap="xs">
            <Text size="sm" c="dimmed">
              Paste Claude's reply.  Each edited file it returned (as
              <code> === FILE: … ===</code> blocks) is validated, applied to the case here,
              and downloaded so you can drop it into the case on disk (the source of truth).
            </Text>
            <Textarea placeholder="Paste claude.ai's reply here…" autosize minRows={5} maxRows={14}
              value={reply} onChange={(e) => setReply(e.currentTarget.value)} styles={{ input: { fontFamily: "monospace", fontSize: 12 } }} />
            <Group>
              <Button leftSection={<IconDownload size={16} />} onClick={applyReply} disabled={!reply.trim()}>
                Apply to case
              </Button>
            </Group>
            {applied && (
              <Box>
                {applied.changed.length > 0 && (
                  <Alert color="teal" variant="light" icon={<IconCheck size={16} />} title={`Applied ${applied.changed.length} file(s)`}>
                    <Group gap={6}>{applied.changed.map((p) => <Badge key={p} variant="light" color="teal" size="sm" styles={{ root: { textTransform: "none" } }}>{p}</Badge>)}</Group>
                    <Text size="xs" c="dimmed" mt={4}>Downloaded — copy each into the case dir and reload to make it permanent.</Text>
                  </Alert>
                )}
                {applied.errors.length > 0 && (
                  <Alert color="red" variant="light" mt="xs" icon={<IconAlertTriangle size={16} />} title="Some blocks did not apply">
                    {applied.errors.map((e, i) => <Text key={i} size="xs">{e}</Text>)}
                  </Alert>
                )}
              </Box>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>
      )}
    </Modal>
  );
}
