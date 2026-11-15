/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/* SPDX-License-Identifier: GPL-3.0-or-later */
/**
 * The internal loop of a column at TOTAL REFLUX, drawn inside the column's
 * own node card (DEV.md 4c C404; the model and its rules are in
 * case/totalRefluxLoop.ts).
 *
 * THREE ARROWS, NOT THREE STREAMS.  The vapour rising to the condenser and
 * the boilup are drawn in the vapour colour, the reflux returning in the
 * liquid colour, both read from the same palette the wires use
 * (ui/plotting/palette.ts), so a student who has learned "blue is liquid"
 * on the other cases finds it here.  They are DASHED and sit in a dashed
 * frame, as the energy wires are dashed: this is not material that crosses
 * the unit's boundary, and the frame says so in its tooltip.
 *
 * BEFORE A RUN the frame shows what the case dict declares: the composition
 * at the specified end.  AFTER a run it shows the numbers the engine
 * published, unconverted (loopRows).  Never a number the GUI worked out.
 *
 * The detail chip (`showDetails`) hides the numbers and keeps the label and
 * the arrows, as it hides the parameter lines on every node.
 */

import { Text, Tooltip, useComputedColorScheme } from "@mantine/core";

import { phaseColor } from "./plotting/palette.js";
import {
  PUBLISHED,
  loopRows,
  type LoopArrow,
  type TotalRefluxLoop as Loop,
} from "../case/totalRefluxLoop.js";
import { formatSig, type DisplayPrefs } from "../state/displayUnits.js";

const TITLE: Record<LoopArrow, string> = {
  vapour: "vapour to condenser",
  reflux: "reflux",
  boilup: "boilup",
};

const HEIGHT = 112;

export function TotalRefluxLoop({ loop, prefs, showDetails }: {
  loop: Loop;
  prefs: DisplayPrefs;
  showDetails: boolean;
}) {
  const ui = useComputedColorScheme("light");
  const vap = phaseColor("vapour", prefs.colorScheme, ui);
  const liq = phaseColor("liquid", prefs.colorScheme, ui);
  const arrows: LoopArrow[] = ["vapour", "reflux", "boilup"];
  //  The composition belongs to the arrow at the end the case specifies it.
  const declaredOn: LoopArrow | null = loop.declared
    ? (loop.declared.end === "reboiler" ? "boilup" : "reflux") : null;
  const dash = { strokeDasharray: "5 3", strokeWidth: 2.4, fill: "none", strokeLinecap: "round" as const };

  return (
    <Tooltip
      multiline w={280} withArrow
      label="An internal loop of the column, drawn from the case and the run.  It is not a stream of the flowsheet: nothing enters or leaves the unit."
    >
      <div data-testid="total-reflux-loop"
        style={{
          display: "flex", gap: 8, marginTop: 8, padding: "6px 8px",
          border: "1.5px dashed var(--mantine-color-gray-5)", borderRadius: 6,
        }}>
        <svg width={52} height={HEIGHT} viewBox={`0 0 52 ${HEIGHT}`} aria-hidden
             style={{ flex: "none", color: "var(--mantine-color-text)" }}>
          <rect x={14} y={12} width={24} height={72} rx={4}
                fill="none" stroke="currentColor" strokeWidth={1.6} />
          {/* vapour rises on the left, reflux returns on the right */}
          <path d="M 6 78 L 6 22" stroke={vap} {...dash} />
          <polygon points="6,12 1,23 11,23" fill={vap} />
          <path d="M 46 18 L 46 74" stroke={liq} {...dash} />
          <polygon points="46,84 41,73 51,73" fill={liq} />
          {/* the boilup enters the base */}
          <path d="M 26 106 L 26 92" stroke={vap} {...dash} />
          <polygon points="26,86 21,95 31,95" fill={vap} />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between",
                      minHeight: HEIGHT, flex: 1, minWidth: 0 }}>
          <Text size="11px" fw={700} data-testid="total-reflux-label">{loop.label}</Text>
          {arrows.map((a) => {
            const rows = showDetails ? loopRows(loop, a, prefs) : [];
            const shown = showDetails && declaredOn === a && loop.declared;
            return (
              <div key={a} data-testid={`total-reflux-${a}`}>
                <Text size="11px" fw={600} c={a === "reflux" ? liq : vap}>{TITLE[a]}</Text>
                {shown && loop.declared && (
                  <Text size="11px" ff="monospace" c="dimmed">
                    {`specified at ${loop.declared.end}: `
                      + loop.declared.composition
                        .map((c) => `${c.component} ${formatSig(c.x, prefs.sigFigs)}`).join(", ")}
                  </Text>
                )}
                {rows.map((r) => (
                  <Text key={r.key} size="11px" ff="monospace" c="dimmed" data-key={r.key}>
                    {r.label} = {r.text}
                  </Text>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </Tooltip>
  );
}

//  The keys the drawing may read, re-exported so a test can hold the
//  component to the model's list without a second copy.
export const LOOP_KEYS = PUBLISHED;
