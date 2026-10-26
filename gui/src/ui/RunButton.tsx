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
  RunButton -- THE case's Run, in one fixed place (DEV.md 4c C172 item 5,
  C168's ruling (2b): "ONE Run control in a fixed place (the top bar), its
  label and scope following the mode on screen").

  It used to have four doors: the flowsheet canvas's own button, the props
  screen's "Run properties" (and its sector variant), the intro's "Open &
  run", and Ctrl+Enter.  Now it is this button plus Ctrl+Enter (MenuBar's
  hotkey), both dispatching the same `choupo:run` the TopBar orchestrates.
  Its LABEL says what it runs -- "Run flowsheet" on a process case, "Run
  workflow" on a properties case (and on a two-mode case shown in its
  Workflow) -- and its title names the binary; its five states (idle /
  running / current / stale / failed) are case/runControl.ts's, the ONE home.
\*---------------------------------------------------------------------------*/

import { Button, Tooltip } from "@mantine/core";
import { IconPlayerPlay, IconPlayerStop } from "@tabler/icons-react";

import { binaryForMode } from "../case/caseModes.js";
import { runControl } from "../case/runControl.js";
import { useStore } from "../state/store.js";
import { useCaseMode } from "../state/useCaseMode.js";
import { useStaleResult } from "../state/useStaleResult.js";

/** What the Run on screen runs: the case's home, and the binary it calls. */
export function runSubject(caseMode: { modes: unknown; mode: "process" | "props"; propsView: boolean },
  application: unknown): { subject: string; binary: string } {
  if (caseMode.propsView) return { subject: "workflow", binary: "choupoProps" };
  return { subject: "flowsheet", binary: binaryForMode("process", application) };
}

export function RunButton({ disabled, disabledReason }: { disabled: boolean; disabledReason?: string }) {
  const caseMode = useCaseMode();
  const application = useStore((s) => s.caseFiles.controlDict?.["application"]);
  const runStatus = useStore((s) => s.runStatus);
  const drawn = useStore((s) => (caseMode.modes && caseMode.propsView ? s.propsRunResult : s.runResult));
  const stale = useStaleResult();
  const { subject, binary } = runSubject(caseMode, application);
  const rc = runControl({
    phase: runStatus,
    haveResult: drawn?.status === "done",
    stale: stale.stale,
    pendingEdits: stale.pendingEdits,
    subject,
    binary,
  });
  const running = rc.state === "running";
  return (
    <Tooltip withArrow multiline w={300} label={disabled && disabledReason ? disabledReason : rc.title}>
      <Button size="compact-sm" color={rc.color} variant={rc.variant} data-run-button={subject}
        disabled={disabled && !running}
        leftSection={running ? <IconPlayerStop size={14} /> : <IconPlayerPlay size={14} />}
        aria-keyshortcuts="Control+Enter"
        onClick={() => window.dispatchEvent(new CustomEvent(running ? "choupo:stop" : "choupo:run"))}
        styles={{ root: { flexShrink: 0 } }}>
        {rc.label}
      </Button>
    </Tooltip>
  );
}
