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
  StaleFitBanner -- A STALE FIT, REFUSED, AND ITS REMEDY AS A BUTTON
  (DEV.md 4c C151/C152).

  A Process-mode run of a two-mode case that meets a fitted record no longer
  matching what fitted it REFUSES (src/thermo/membrane/FittedRecord.cpp) and
  names the remedy: re-run the fit in Properties mode.  Over the canvas, that
  remedy is one click -- the switch to Properties & data -- beside the
  engine's own sentence, never a command to copy.  Nothing shows otherwise.
\*---------------------------------------------------------------------------*/

import { Alert, Button, Group, Text } from "@mantine/core";

import { staleFitRefusal } from "../case/caseModes.js";
import { useStore } from "../state/store.js";
import { useCaseMode } from "../state/useCaseMode.js";

export function StaleFitBanner() {
  const runStatus = useStore((s) => s.runStatus);
  const runLog = useStore((s) => s.runLog);
  const setCaseMode = useStore((s) => s.setCaseMode);
  const { modes, propsView } = useCaseMode();
  const refusal = modes && !propsView && runStatus === "error" ? staleFitRefusal(runLog) : null;
  if (!refusal) return null;
  return (
    <Alert color="grape" variant="filled" p="xs" data-stale-fit=""
      style={{ position: "absolute", top: 44, left: "50%", transform: "translateX(-50%)",
               zIndex: 20, maxWidth: "min(720px, calc(100% - 32px))" }}>
      <Group gap="sm" wrap="nowrap" align="center">
        <Text size="xs" style={{ flex: 1 }} lineClamp={3}>{refusal}</Text>
        <Button size="xs" color="dark" variant="white" onClick={() => setCaseMode("props")}>
          Re-fit in Properties &amp; data
        </Button>
      </Group>
    </Alert>
  );
}
