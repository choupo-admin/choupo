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
  PsychroTool -- "Moist gas, read as a map" (C535 slice S4, chapter "chart").
  Moved verbatim out of MethodsWorkspace.tsx; the page is now a LessonDoc drawn
  by the one renderer (lessonDocument.tsx).  The engine feed is unchanged:
  psychroSpec -> the psychrometricChart op, PsychroPlot only draws it.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Alert, Box, Group, Loader, NumberInput, Select, Stack, Text, Title,
} from "@mantine/core";

import { HandOffFooter, useEngineCsv } from "./engineBench.js";
import { metaByName, type ComponentMeta } from "../../case/catalogue.js";
import type { ExploreSpec } from "../../case/exploreSynth.js";
import { psychroSpec } from "../../case/methodFeeds.js";
import {
  kToDisplay, paToDisplay, parsePressure, parseTemperature,
  pressureLabel, temperatureLabel,
} from "../../state/displayUnits.js";
import { useStore } from "../../state/store.js";
import { PsychroPlot } from "../plotting/PsychroPlot.js";
import { KnobField, KnobNumber } from "./knobPanel.js";
import { LessonDocument, type LessonDoc } from "./lessonDocument.js";
import { OriginMark } from "./origin.js";
import { PSYCHRO_LIMITS, PSYCHRO_QUIZ, PSYCHRO_STEPS } from "./psychroLesson.js";

// ---- Psychrometric chart ----------------------------------------------------
// The SAME engine feed the Explorer used (psychroSpec → the psychrometricChart
// engine op): carrier = lower-Tb of the pair, condensable = higher-Tb; the
// chart CSV arrives fully computed (saturation, RH, adiabatic-saturation and
// true wet-bulb via the Lewis number) and PsychroPlot only draws it.

export function PsychroTool({ catalogue, componentFiles }: {
  catalogue: ComponentMeta[];
  componentFiles: Record<string, string>;
}): JSX.Element {
  const prefs = useStore((s) => s.displayPrefs);
  const Tu = prefs.temperature, Pu = prefs.pressure;
  const [carrier, setCarrier] = useState("N2");
  const [condensable, setCondensable] = useState("water");
  const [tFrom, setTFrom] = useState(290);    // K
  const [tTo, setTTo] = useState(380);        // K
  const [P, setP] = useState(101325);         // Pa
  const [rhFrom, setRhFrom] = useState(10);
  const [rhTo, setRhTo] = useState(90);
  const [rhStep, setRhStep] = useState(20);
  const [wbStep, setWbStep] = useState(10);   // °C between saturation anchor lines
  const [yMax, setYMax] = useState(0);        // kg/kg cap; 0 = auto

  const carrierNames = useMemo(
    () => catalogue.filter((m) => m.isPermanentGas).map((m) => m.name).sort(),
    [catalogue]);
  const condensableNames = useMemo(
    () => catalogue.filter((m) => m.vleAble && !m.isPermanentGas).map((m) => m.name).sort(),
    [catalogue]);

  const pairOk = carrier !== condensable
    && !!metaByName(carrier, catalogue) && !!metaByName(condensable, catalogue);
  const spec = useMemo<ExploreSpec | null>(() => pairOk
    ? psychroSpec({
        pair: [carrier, condensable], catalogue, P,
        TminK: tFrom, TmaxK: tTo, gridN: 60,
        rhFrom, rhTo, rhStep, wbStepC: wbStep,
        componentFiles: Object.keys(componentFiles).length > 0 ? componentFiles : undefined,
      })
    : null,
  [pairOk, carrier, condensable, catalogue, P, tFrom, tTo, rhFrom, rhTo, rhStep, wbStep, componentFiles]);

  const { csv, err, busy, advisories, diags } = useEngineCsv(spec);

  const alerts: React.ReactNode[] = [];
  if (err) alerts.push(<Alert key="err" color="red" variant="light">{err}</Alert>);
  if (!pairOk) alerts.push(
    <Alert key="pair" color="yellow" variant="light" title="Pick a humid-gas pair">
      The chart needs a carrier gas plus a different condensable with a vapour-pressure model.
    </Alert>);
  if (advisories.length > 0) alerts.push(
    <Alert key="adv" color="yellow" variant="light" title="Solver advisory">
      {advisories.map((a) => <Text key={a} size="xs">{a}</Text>)}
    </Alert>);

  const num = (v: number | string, fallback: number) => {
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };

  // ONE plot pane, wherever the page puts it — the layout moves chrome around
  // the chart, never a second copy of it.
  const plotPane = (
    <Box style={{ minWidth: 0, height: 520, position: "relative" }}>
      {csv ? (
        <PsychroPlot csv={csv} yMax={yMax} />
      ) : (
        <Box style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {busy
            ? <Group gap={8}><Loader size="sm" /><Text size="sm" c="dimmed">computing the chart…</Text></Group>
            : <Text size="sm" c="dimmed" ta="center" maw={460}>
                Psychrometric chart at P — humidity ratio Y vs dry-bulb T for
                the carrier + condensable pair, fully computed by the engine.
              </Text>}
        </Box>
      )}
    </Box>
  );

  const setupRail = (
      <>
        <KnobField label="carrier gas">
          <Select size="xs" searchable data={carrierNames} value={carrier} w="100%"
            onChange={(v) => setCarrier(v ?? carrier)} allowDeselect={false} />
        </KnobField>
        <KnobField label="condensable">
          <Select size="xs" searchable data={condensableNames} value={condensable} w="100%"
            onChange={(v) => setCondensable(v ?? condensable)} allowDeselect={false} />
        </KnobField>
        <KnobNumber label={`T from (${temperatureLabel(Tu)})`} step={5}
          value={Number(kToDisplay(tFrom, Tu).toFixed(1))}
          onChange={(v) => setTFrom(parseTemperature(v, Tu))} />
        <KnobNumber label={`T to (${temperatureLabel(Tu)})`} step={5}
          value={Number(kToDisplay(tTo, Tu).toFixed(1))}
          onChange={(v) => setTTo(parseTemperature(v, Tu))} />
        <KnobNumber label={`P (${pressureLabel(Pu)})`} value={paToDisplay(P, Pu)}
          onChange={(v) => setP(parsePressure(v, Pu))} />
        <KnobField label="RH % — from / to / step">
          <Group gap={4} wrap="nowrap">
            <NumberInput size="xs" value={rhFrom} min={0} max={99} style={{ flex: 1, minWidth: 0 }}
              onChange={(v) => setRhFrom(num(v, rhFrom))} />
            <NumberInput size="xs" value={rhTo} min={1} max={99} style={{ flex: 1, minWidth: 0 }}
              onChange={(v) => setRhTo(num(v, rhTo))} />
            <NumberInput size="xs" value={rhStep} min={1} max={50} style={{ flex: 1, minWidth: 0 }}
              onChange={(v) => setRhStep(num(v, rhStep))} />
          </Group>
        </KnobField>
        <KnobNumber label="ΔT between saturation anchor lines (°C)" value={wbStep}
          min={5} max={50} step={5} onChange={setWbStep} />
        <KnobNumber label="Y max, kg/kg (0 = auto)" value={yMax} min={0} step={0.05}
          decimals={3} onChange={setYMax} />
        {busy && (
          <Group gap={6} wrap="nowrap">
            <Loader size="xs" /><Text size="xs" c="dimmed">computing…</Text>
          </Group>
        )}
      </>
  );

  // THE LE READOUT, a card of step 3 (it is the number that separates the two
  // temperatures that step defines), so it sits right after that step.
  const leCard = (
    <Box>
      <Title order={5}>Read the Lewis number of the pair on the chart</Title>
      <Text size="sm" mt={4}>
        Change the pair above: a pair whose Lewis number is far from one pulls
        the two families — dashed (adiabatic saturation) and dotted (true wet
        bulb) — visibly apart.
      </Text>
      {/*  THE NUMBER THAT SEPARATES THE TWO FAMILIES, on screen.  The engine
           has always published it; a reader who sees a gap between the
           dashed and dotted lines needs the value that produced it.  */}
      {diags && Number.isFinite(diags["Lewis_last"]) && (
        <Text size="sm" mt={6}>
          For the pair on the chart right now, the engine reports{" "}
          <Text span ff="monospace">Le = {diags["Lewis_last"]!.toFixed(4)}
          </Text>.  Read it against the “Le ≈ 1” of the textbooks: at{" "}
          {diags["Lewis_last"]!.toFixed(2)} the engine scales the wet-bulb
          slope by Le^(2/3) (Chilton-Colburn), so the two slopes differ by
          about {Math.abs(1 - Math.pow(diags["Lewis_last"]!, 2 / 3)) * 100 < 1
            ? "less than a per cent"
            : `${(Math.abs(1 - Math.pow(diags["Lewis_last"]!, 2 / 3)) * 100).toFixed(1)} %`}
          {" "}— which is the whole distance between the adiabatic-saturation
          family and the true wet-bulb family you are looking at.
        </Text>
      )}
    </Box>
  );

  const doc: LessonDoc = {
    title: "Moist gas, read as a map",
    question: "The densest diagram you will use, and it rewards being read the "
      + "way a map is: every point is a state, and every process is a line "
      + "on it with a direction that means something.",
    steps: PSYCHRO_STEPS, quiz: PSYCHRO_QUIZ, limits: PSYCHRO_LIMITS,
    sections: {
      question: [
        { kind: "bench", node: (
          <Box>
            <Title order={5}>In ten minutes</Title>
            <Text size="sm" mt={4}>
              <b>The question.</b> How do you read, from one picture, how
              humid a gas is and what heating, cooling or wetting it will do
              to it?
            </Text>
            <Text size="sm" mt={4}>
              <b>The one idea.</b> Two numbers fix the state of moist gas: its
              temperature on an ordinary thermometer (dry bulb) and its
              humidity ratio Y, the kilograms of vapour per kilogram of dry
              gas.  Everything else (relative humidity, dew point, wet bulb)
              is read off that point, and every process is a move along a
              direction on the map.
            </Text>
            <Text size="sm" mt={4}>
              <b>One worked number.</b> Air at 60 °C and 1 atm can carry at
              most Y = 0.1525 kg of water vapour per kg of dry air (the top of
              the chart at 60 °C); the same chart drawn for nitrogen reads
              0.1576, because nitrogen is lighter than air (step 1).
            </Text>
          </Box>
        ) },
        { kind: "step", n: 1 },
      ],
      try: [
        { kind: "bench", node: (
          <>
        <Box>
          <Title order={5}>Now read one</Title>
          <Text size="sm" mt={4}>
            The engine computes the whole chart at your pressure — the
            saturation ceiling, the relative-humidity family, the
            adiabatic-saturation lines and, where the transport data allow it,
            the true wet-bulb lines beside them.  The default pair, nitrogen
            with water, gives a chart of the printed shape with every humidity
            ratio about 3.4 % above a printed air chart (pick air to land on
            it).
          </Text>
        </Box>
        <Box style={{ display: "grid", gap: 14, marginTop: 14,
          gridTemplateColumns: "minmax(220px, 260px) 1fr" }}>
          <Stack gap={8}>
            <OriginMark of="assumption" note="the pair, the T range and P you choose" />
            {setupRail}
          </Stack>
          <Box style={{ minWidth: 0 }}>
            <OriginMark of="engine"
              note="every line of the chart, and Le, is a choupoProps run in this browser" />
            {plotPane}
          </Box>
        </Box>
          </>
        ) },
        { kind: "bench", node: <HandOffFooter spec={spec} alerts={[]} /> },
      ],
      see: [{ kind: "step", n: 2 }, { kind: "step", n: 3 },
        { kind: "bench", node: leCard }, { kind: "step", n: 4 }],
      why: [{ kind: "step", n: 5 }],
    },
  };
  return <LessonDocument tool="psychro" doc={doc} alerts={alerts} />;
}
