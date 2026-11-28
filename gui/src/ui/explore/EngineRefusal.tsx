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
  EngineRefusal -- the screen's answer when the engine refuses a run.

  THE USER'S TASK, in one sentence: "my run was refused -- what does that mean
  and what do I do now?"  So the box leads with the plain meaning, then what to
  do next, then ONE button that runs the nearest model that works (visible, a
  choice the student makes by clicking, never a hidden fallback); the engine's
  own text is kept, verbatim, behind a fold.  The reading is
  case/modelApplicability.ts `refusalAdvice`.
\*---------------------------------------------------------------------------*/

import { Alert, Button, Group, Text } from "@mantine/core";

import type { RefusalAdvice } from "../../case/modelApplicability.js";

const WORDS: Record<string, string> = { ideal: "ideal mixing", idealGas: "the ideal gas" };
const say = (m: string) => WORDS[m] ?? m;

export function EngineRefusal({ advice, onTryActivity, onTryEos }: {
  advice: RefusalAdvice;
  /** run this liquid model instead (present only where the lens has one to set) */
  onTryActivity?: (model: string) => void;
  onTryEos?: (model: string) => void;
}) {
  const act = advice.tryActivity && onTryActivity ? advice.tryActivity : null;
  const eos = advice.tryEos && onTryEos ? advice.tryEos : null;
  return (
    <Alert color="red" variant="light" p="xs" title="The engine refused this run" data-testid="engine-refusal">
      <Text size="xs">{advice.plain}</Text>
      <Text size="xs" mt={4}><b>Next:</b> {advice.next}</Text>
      {(act || eos) && (
        <Group gap="xs" mt={6}>
          {act && (
            <Button size="compact-xs" variant="light" onClick={() => onTryActivity!(act)}
              data-testid="engine-refusal-try">Run {say(act)} instead</Button>)}
          {eos && (
            <Button size="compact-xs" variant="light" onClick={() => onTryEos!(eos)}
              data-testid="engine-refusal-try-eos">Run {say(eos)} instead</Button>)}
        </Group>)}
      <details style={{ marginTop: 6 }}>
        <summary style={{ cursor: "pointer", fontSize: 11 }}>The engine&rsquo;s own text</summary>
        <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{advice.raw}</Text>
      </details>
    </Alert>
  );
}
