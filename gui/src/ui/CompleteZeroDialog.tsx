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

/*  COMPLETE 0/ -- the dialog behind File > Complete 0/ (DEV.md 4c C200 B').
 *
 *  Opens in three ways, all of them an event so no caller needs a prop:
 *    choupo:complete-zero         the menu item: run the engine's -init0 now
 *    choupo:offer-complete-zero   a run was refused for an incomplete 0/
 *                                 (detail: Incomplete0) -- OFFER, do not run
 *    choupo:offer-complete-zero   also sent by the clipboard bridge after an
 *                                 applied reply that probably leaves 0/ short
 *                                 (detail: { hint: string[] })
 *  The action never runs silently: the dialog lists every file generated and
 *  the engine's own `[init0]` lines, and the Log keeps the same record.  The
 *  materialisation is the engine's (case/completeZero.ts); this file only
 *  asks for it and shows what came back. */

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Code, Group, Modal, ScrollArea, Stack, Text } from "@mantine/core";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";

import { resolveAdapter } from "../adapters/index.js";
import { useStore } from "../state/store.js";
import {
  completeZeroLogLines, harvestInit0, init0Announcements, type Incomplete0,
} from "../case/completeZero.js";

type Phase =
  | { kind: "offer"; missing: string[]; other: string[]; why: string }
  | { kind: "running" }
  | { kind: "done"; generated: string[]; kept: string[]; lines: string[]; ok: boolean; note?: string };

export const EV_COMPLETE_ZERO = "choupo:complete-zero";
export const EV_OFFER_COMPLETE_ZERO = "choupo:offer-complete-zero";
export type OfferDetail = Partial<Incomplete0> & { hint?: string[] };

export function CompleteZeroDialog() {
  const [phase, setPhase] = useState<Phase | null>(null);

  const run = useCallback(async () => {
    setPhase({ kind: "running" });
    const st = useStore.getState();
    const resolved = await resolveAdapter("wasm");
    if (resolved.kind !== "wasm") {
      setPhase({ kind: "done", generated: [], kept: [], lines: [], ok: false,
        note: resolved.fallbackReason ?? "The real (WebAssembly) engine is not available, so 0/ cannot be completed." });
      return;
    }
    let log = "";
    const result = await resolved.adapter.run(st.caseFiles, (c) => { log += c; },
      undefined, undefined, { init0: true });
    const h = harvestInit0(useStore.getState().caseFiles, result.init0Files);
    const lines = init0Announcements(log);
    const ok = result.status === "done";
    if (h.generated.length > 0) {
      useStore.getState().applyCaseFiles(h.next);
      useStore.getState().markGenerated0(
        Object.fromEntries(h.generated.map((p) => [p, h.next.rawFiles![p]!])));
    }
    const logLines = completeZeroLogLines(h, lines);
    if (!ok) logLines.push("[case] Complete 0/: the engine refused -init0 -- its message:",
      ...log.split("\n").filter((l) => /ERROR|refus|RECYCLE|seed/i.test(l)).map((l) => "  " + l));
    useStore.getState().appendLog("\n" + logLines.join("\n") + "\n");
    setPhase({ kind: "done", generated: h.generated, kept: h.kept, lines, ok,
      ...(ok ? {} : { note: log.split("\n").filter((l) => /ERROR|refus|RECYCLE|seed/i.test(l)).join("\n")
        || "choupoSolve -init0 exited with an error; the Log has the engine's message." }) });
  }, []);

  useEffect(() => {
    const onRun = () => { void run(); };
    const onOffer = (e: Event) => {
      const d = ((e as CustomEvent).detail ?? {}) as OfferDetail;
      const missing = d.missing ?? d.hint ?? [];
      setPhase({ kind: "offer", missing, other: d.other ?? [],
        why: d.missing ? "The engine refused the run: 0/ lacks a state file for these graph streams."
                       : "0/ probably lacks a state file for these graph streams." });
    };
    window.addEventListener(EV_COMPLETE_ZERO, onRun);
    window.addEventListener(EV_OFFER_COMPLETE_ZERO, onOffer);
    return () => {
      window.removeEventListener(EV_COMPLETE_ZERO, onRun);
      window.removeEventListener(EV_OFFER_COMPLETE_ZERO, onOffer);
    };
  }, [run]);

  const close = () => setPhase(null);
  return (
    <Modal opened={phase !== null} onClose={close} size="lg"
      title={<Text fw={600}>Complete 0/ (materialise missing streams)</Text>}>
      {phase?.kind === "offer" && (
        <Stack gap="sm">
          <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
            <Text size="sm">{phase.why}</Text>
            <Group gap={6} mt={6}>
              {phase.missing.map((m) => <Badge key={m} variant="light" color="yellow" size="sm"
                styles={{ root: { textTransform: "none" } }}>{m}</Badge>)}
            </Group>
            {phase.other.length > 0 && (
              <Text size="xs" c="dimmed" mt={6}>
                Also reported (not repaired by this action): {phase.other.join("; ")}
              </Text>
            )}
          </Alert>
          <Text size="sm" c="dimmed">
            Runs the engine's own <Code>-init0</Code> (what <Code>bin/choupo-init0</Code> wraps): it
            propagates an initial estimate from your authored inlets and tear seeds, never overwrites a
            file you wrote, and refuses a recycle with no seed. Nothing is solved.
          </Text>
          <Group>
            <Button onClick={() => void run()}>Complete 0/</Button>
            <Button variant="default" onClick={close}>Not now</Button>
          </Group>
        </Stack>
      )}
      {phase?.kind === "running" && <Text size="sm">Running the engine's -init0 …</Text>}
      {phase?.kind === "done" && (
        <Stack gap="sm">
          {phase.ok ? (
            <Alert color="teal" variant="light" icon={<IconCheck size={16} />}
              title={`${phase.generated.length} file(s) generated`}>
              <Group gap={6}>
                {phase.generated.map((p) => <Badge key={p} variant="light" color="teal" size="sm"
                  styles={{ root: { textTransform: "none" } }}>{p}</Badge>)}
              </Group>
              <Text size="xs" c="dimmed" mt={6}>
                Marked <em>generated</em> in the Case tree. They are estimates: edit them or run.
                Download the case (.zip) to keep them.
              </Text>
            </Alert>
          ) : (
            <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}
              title="The engine refused -init0">
              <Text size="xs" style={{ whiteSpace: "pre-wrap" }}>{phase.note}</Text>
            </Alert>
          )}
          {phase.kept.length > 0 && (
            <Text size="xs" c="dimmed">Already in the case, kept: {phase.kept.join(", ")}</Text>
          )}
          {phase.lines.length > 0 && (
            <>
              <Text size="xs" fw={600}>The engine's own lines</Text>
              <ScrollArea.Autosize mah={240}>
                <Code block style={{ fontSize: 11 }}>{phase.lines.join("\n")}</Code>
              </ScrollArea.Autosize>
            </>
          )}
          <Group><Button variant="default" onClick={close}>Close</Button></Group>
        </Stack>
      )}
    </Modal>
  );
}
