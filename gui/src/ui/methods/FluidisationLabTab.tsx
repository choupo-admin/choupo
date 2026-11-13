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
  FluidisationLabTab — the fluidisation laboratory, the `fluidised-beds`
  page's pop-out tab (?fluidlab=1&..., opened by the page's "Open the
  laboratory" button).

  The student's task, in one sentence: "I turn up the gas on a bed of
  particles, I watch what the bed does and I read the instruments, and from
  my own readings I find the velocity at which it fluidises and the one at
  which it is carried away."

  ADDRESSABLE, NOT STASHED (the ?component= precedent): every input rides in
  the URL, so the tab survives F5, a bookmark and a cold browser, and has
  nothing to expire; a URL that does not read REFUSES by name.  The velocity
  is written back to the URL as it moves.  The notebook is kept in this
  tab's sessionStorage (a convenience: it survives F5 in the same tab and is
  never shared); the columns are refilled on a reload.

  Every number is the page's arithmetic, CALLED from case/fluidisedBeds.ts
  through case/fluidisationLab.ts; the drawing is a pure function of the
  computed state and time (labFrame), painted here on a canvas.  The dots
  are decoration and the screen says so.  Record:
  docs/design/fluidisation-virtual-laboratory.md.
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Box, Button, Group, NumberInput, Select, Slider, Stack, Table, Text, Title,
} from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";

import {
  LAB_U_MAX, LAB_U_MIN, columnState, directionOf, encodeLab, gasOf, labFrame, labelOf, nextInventory,
  parseLab, revealOf, type ColumnState, type Frame, type LabColumnSpec, type LabSetup, type Reading,
} from "../../case/fluidisationLab.js";
import { GASES, PARTICLES } from "../../case/fluidisedBedPresets.js";
import { bedPressureDrop, type GeldartGroup } from "../../case/fluidisedBeds.js";
import { Panel, Wide, XYPlot, fmt } from "./AdsorptionIsothermsTool.js";

type XY = readonly [number, number];

/** The page's group colours (FluidisedBedsTool.tsx), for the dots. */
const GROUP_COLOR: Readonly<Record<GeldartGroup, string>> = {
  C: "#9b9b9b", A: "#2a78d6", B: "#1baf7a", D: "#d4572a",
};
const UP = "#2a78d6", DOWN = "#d4572a", PAGE = "#1baf7a";

const fmtU = (u: number): string => (!Number.isFinite(u) ? "—"
  : u < 0.1 ? `${fmt(u * 100, 3)} cm/s` : `${fmt(u, 3)} m/s`);

const CANVAS_H = 300;

// ---- the canvas painter ---------------------------------------------------------------

function cssVar(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

/** Paint one frame.  The column is drawn to scale (the same metres per
 *  pixel on both axes); only the dots' size and number are not. */
function paint(cv: HTMLCanvasElement, f: Frame, st: ColumnState): void {
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = cv.clientWidth, ch = cv.clientHeight;
  if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) {
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const text = cssVar(cv, "--mantine-color-text", "#222");
  const body = cssVar(cv, "--mantine-color-body", "#fff");
  const dim = cssVar(cv, "--mantine-color-dimmed", "#888");
  ctx.clearRect(0, 0, cw, ch);
  const pad = 10;
  const s = Math.min((ch - 2 * pad) / f.top, (cw - 2 * pad) / f.width);
  const x0 = (cw - f.width * s) / 2, yb = ch - pad;
  const X = (x: number): number => x0 + x * s;
  const Y = (y: number): number => yb - y * s;
  //  The bed: a faint tint from the distributor to its top.
  if (f.bedTop !== null && f.bedTop > 0) {
    const top = Math.min(f.bedTop, f.top);
    ctx.fillStyle = "rgba(212, 165, 90, 0.20)";
    ctx.fillRect(X(0), Y(top), f.width * s, top * s);
    ctx.save();
    ctx.beginPath(); ctx.rect(X(0), Y(top), f.width * s, top * s); ctx.clip();
    for (const v of f.voids) {
      ctx.beginPath();
      if (v.slug) ctx.rect(X(0), Y(v.y + v.r), f.width * s, 2 * v.r * s);
      else ctx.arc(X(v.x), Y(v.y), Math.max(v.r * s, 0.8), 0, 2 * Math.PI);
      ctx.fillStyle = body; ctx.fill();
      ctx.strokeStyle = dim; ctx.lineWidth = 0.8; ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = text; ctx.lineWidth = 1.2;
    ctx.setLineDash(f.bedTopDashed ? [5, 4] : []);
    ctx.beginPath(); ctx.moveTo(X(0), Y(top)); ctx.lineTo(X(f.width), Y(top)); ctx.stroke();
    ctx.setLineDash([]);
  }
  //  The dots: decoration.
  ctx.fillStyle = GROUP_COLOR[st.group] ?? text;
  const r = 2.2;
  for (const d of f.dots) {
    if (d.y > f.top) continue;
    ctx.beginPath(); ctx.arc(X(d.x), Y(d.y), r, 0, 2 * Math.PI); ctx.fill();
  }
  for (const d of f.flying) {
    if (d.y > f.top) continue;
    ctx.beginPath(); ctx.arc(X(d.x), Y(d.y), r, 0, 2 * Math.PI); ctx.fill();
  }
  //  The column: two walls, an open top, a perforated plate at the bottom.
  ctx.strokeStyle = text; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(X(0), Y(f.top)); ctx.lineTo(X(0), Y(0));
  ctx.moveTo(X(f.width), Y(0)); ctx.lineTo(X(f.width), Y(f.top));
  ctx.stroke();
  ctx.setLineDash([3, 3]); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(f.width), Y(0)); ctx.stroke();
  ctx.setLineDash([]);
}

// ---- one column ------------------------------------------------------------------------

/** One column's canvas.  React only mounts it and repaints it when the
 *  computed state changes; the animation loop paints it every frame through
 *  the shared ref (no React render per frame). */
function ColumnCanvas({ st, k, canvases, timeRef, reduced }: {
  st: ColumnState; k: number; canvases: React.MutableRefObject<(HTMLCanvasElement | null)[]>;
  timeRef: React.MutableRefObject<number>; reduced: boolean;
}): JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    canvases.current[k] = ref.current;
    return () => { canvases.current[k] = null; };
  }, [k, canvases]);
  useEffect(() => {
    if (!ref.current || st.refused) return;
    paint(ref.current, labFrame(st, timeRef.current, reduced), st);
  });
  return (
    <canvas ref={ref} style={{ width: "100%", height: CANVAS_H, display: "block" }}
      role="img" aria-label={`column of ${st.label}: ${st.phase === "empty" ? "empty" : st.regime}`} />
  );
}

// ---- the tab ---------------------------------------------------------------------------

interface Notebook {
  readings: Reading[];
  guessMf: (number | string)[];
  guessOut: (number | string)[];
  shownMf: boolean[];
  shownOut: boolean[];
}

const emptyNotebook = (n: number): Notebook => ({
  readings: [], guessMf: Array(n).fill(""), guessOut: Array(n).fill(""),
  shownMf: Array(n).fill(false), shownOut: Array(n).fill(false),
});

function notebookKey(s: LabSetup): string {
  return `choupo.fluidlab.notebook.${encodeLab({ ...s, u: 1 })}`;
}

function readNotebook(s: LabSetup): Notebook {
  try {
    const raw = window.sessionStorage.getItem(notebookKey(s));
    if (raw) {
      const v = JSON.parse(raw) as Notebook;
      if (Array.isArray(v.readings) && v.shownMf?.length === s.columns.length) return v;
    }
  } catch { /* storage unavailable: a fresh notebook */ }
  return emptyNotebook(s.columns.length);
}

export function FluidisationLabTab(): JSX.Element {
  const parsed = useMemo(() => parseLab(typeof window === "undefined" ? "" : window.location.search), []);
  useEffect(() => { document.title = "Fluidisation laboratory"; }, []);
  if (!parsed.setup) {
    return (
      <Box style={{ padding: 24, maxWidth: 640 }}>
        <Stack gap="xs">
          <Text fw={700} size="lg">This laboratory link does not read</Text>
          <Text size="sm">{parsed.refused}.</Text>
          <Text size="sm" c="dimmed">
            Open the laboratory again from the fluidised-beds page (Methods, the button
            &quot;Open the laboratory&quot;), or use the bare link <code>?fluidlab=1</code> for the
            three default columns.
          </Text>
        </Stack>
      </Box>
    );
  }
  return <Lab initial={parsed.setup} />;
}

function Lab({ initial }: { initial: LabSetup }): JSX.Element {
  const [setup, setSetup] = useState<LabSetup>(initial);
  const [inv, setInv] = useState<number[]>(() => initial.columns.map(() => 1));
  const [nb, setNb] = useState<Notebook>(() => readNotebook(initial));
  const reduced = useReducedMotion() ?? false;
  const [running, setRunning] = useState(true);
  const timeRef = useRef(0);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const invRef = useRef(inv);
  invRef.current = inv;

  const gas = gasOf(setup);
  const states = useMemo(() => setup.columns.map((spec, k) => columnState(
    { spec, gas, LmfFull: setup.Lmf, Dt: setup.Dt, orificesPerM2: setup.orificesPerM2, Dg_cm2s: setup.Dg_cm2s },
    setup.u, inv[k] ?? 1)), [setup, inv]);   // eslint-disable-line react-hooks/exhaustive-deps
  const statesRef = useRef(states);
  statesRef.current = states;
  //  A theme switch or a resize repaints the canvases even when the loop is
  //  stopped (paused, reduced motion, hidden): one render repaints them all.
  const [, setRepaint] = useState(0);
  useEffect(() => {
    const bump = (): void => setRepaint((v) => v + 1);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mantine-color-scheme"] });
    window.addEventListener("resize", bump);
    return () => { mo.disconnect(); window.removeEventListener("resize", bump); };
  }, []);

  //  The URL follows the set-up (F5 keeps the velocity and the columns).
  useEffect(() => {
    try { window.history.replaceState(null, "", `${window.location.pathname}?${encodeLab(setup)}`); } catch { /* ignore */ }
  }, [setup]);
  //  The notebook is kept for this tab (sessionStorage), keyed by the set-up.
  useEffect(() => {
    try { window.sessionStorage.setItem(notebookKey(setup), JSON.stringify(nb)); } catch { /* ignore */ }
  }, [nb, setup]);

  //  Reduced motion: no animation; a column above u_t is shown already empty.
  useEffect(() => {
    if (!reduced) return;
    setInv((v) => v.map((x, k) => (statesRef.current[k] && !statesRef.current[k]!.refused
      && statesRef.current[k]!.carriedOut && statesRef.current[k]!.phase !== "cohesive" ? 0 : x)));
  }, [reduced, setup.u]);

  //  The animation loop: stops when the tab is hidden, when paused, and
  //  under reduced motion.  Inventory (decoration) is pushed to React at most
  //  four times a second; the canvases repaint every frame.
  useEffect(() => {
    if (reduced || !running) return;
    let raf = 0, last = performance.now(), lastPush = last;
    let hidden = document.hidden;
    let local = invRef.current.slice();
    let seen = invRef.current;
    const tick = (now: number): void => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      timeRef.current += dt;
      let changed = false;
      //  A refill (or a column added) from React replaces the loop's copy.
      if (invRef.current !== seen) { seen = invRef.current; local = seen.slice(); }
      local = local.map((x, k) => {
        const st = statesRef.current[k];
        if (!st || st.refused || st.phase === "cohesive") return x;
        const y = nextInventory(x, dt, st.u, st.term.u);
        if (y !== x) changed = true;
        return y;
      });
      if (changed && now - lastPush > 250) { lastPush = now; setInv(local.slice()); }
      statesRef.current.forEach((st, k) => {
        const cv = canvases.current[k];
        if (cv && st && !st.refused) paint(cv, labFrame(st, timeRef.current, false), st);
      });
      raf = requestAnimationFrame(tick);
    };
    const onVis = (): void => {
      if (document.hidden && !hidden) { hidden = true; cancelAnimationFrame(raf); }
      else if (!document.hidden && hidden) { hidden = false; last = performance.now(); raf = requestAnimationFrame(tick); }
    };
    document.addEventListener("visibilitychange", onVis);
    if (!hidden) raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", onVis); };
    //  The loop reads the states through a ref; restart only on these.
  }, [reduced, running, setup.columns.length]);   // eslint-disable-line react-hooks/exhaustive-deps

  const setU = (u: number): void => {
    if (!Number.isFinite(u)) return;
    setSetup((s) => ({ ...s, u: Math.min(LAB_U_MAX, Math.max(LAB_U_MIN, u)) }));
  };
  const refill = (): void => setInv(setup.columns.map(() => 1));
  const setColumns = (columns: LabColumnSpec[]): void => {
    setSetup((s) => ({ ...s, columns }));
    setInv(columns.map(() => 1));
    setNb(emptyNotebook(columns.length));
  };
  const kindData = (c: LabColumnSpec): { value: string; label: string }[] => [
    ...PARTICLES.map((p) => ({ value: p.id, label: p.label })),
    ...(c.kind === "own" ? [{ value: "own", label: `your particle, ${c.d_um} µm, ${c.rhoP} kg/m³` }] : []),
  ];
  const chooseKind = (k: number, id: string): void => {
    const x = PARTICLES.find((p) => p.id === id);
    if (!x) return;
    setColumns(setup.columns.map((c, j) => (j === k
      ? { kind: x.id, d_um: x.d_um, rhoP: x.rhoP, eps: x.eps, F: x.F } : c)));
  };
  const record = (): void => {
    setNb((b) => {
      const add: Reading[] = states.map((st, k) => {
        const prev = [...b.readings].reverse().find((r) => r.col === k);
        return { col: k, u: setup.u, dP: st.refused ? NaN : st.dP, H: st.refused ? null : st.H, dir: directionOf(prev, setup.u) };
      });
      return { ...b, readings: [...b.readings, ...add] };
    });
  };
  const logU = Math.log10(setup.u);
  const gasLabel = GASES.find((g) => g.id === setup.gasId)?.label ?? setup.gasId;
  const n = setup.columns.length;

  return (
    <Box style={{ height: "100vh", overflowY: "auto", overflowX: "hidden" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 1100, margin: "0 auto", minWidth: 0 }}>
        <Box>
          <Title order={3}>Fluidisation laboratory</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Turn up the gas, watch what each bed does and read the instruments; record your
            readings, and from your own points find the velocity at which each bed fluidises and
            the one at which it is carried away.  Then compare with what the page computes.
          </Text>
        </Box>

        <Alert color="gray" variant="light" title="What is computed and what is drawn">
          <Text size="sm">
            No particle is simulated: the dots are a drawing.  The bed height, the voids (their
            size at each height, how fast they rise and how many there are), the pressure drop and
            the regime are computed, by the fluidised-beds page&apos;s own arithmetic, in your browser;
            the engine has no fluidised bed.  The number and the size of the dots, the way each
            one moves, where a void appears across the column and how fast a column empties are
            not to scale and not computed.  The column itself is drawn to scale: the same metres
            per pixel across and up.  Time runs at real speed.
          </Text>
        </Alert>

        <Panel title="the gas, shared by every column" origin="assumption"
          originNote="the gas and the column are the ones the page was set to when you opened this tab; the velocity is yours">
          <Text size="sm">
            {gasLabel} at {fmt(setup.T_C, 4)} °C and {fmt(setup.P_bar, 5)} bar, ρ_g = {fmt(gas.rhoG)} kg/m³
            (ideal gas), μ = {fmt(setup.mu_uPas, 4)} µPa s.  Each column is {fmt(setup.Dt, 3)} m wide,
            charged with a bed {fmt(setup.Lmf, 3)} m deep when packed, on a plate with{" "}
            {fmt(setup.orificesPerM2, 4)} orifices per m².
          </Text>
          <Box px={28}>
            <Text size="sm" fw={600} id="lab-u-label">gas velocity u = {fmtU(setup.u)}</Text>
            <Slider aria-labelledby="lab-u-label" min={Math.log10(LAB_U_MIN)} max={Math.log10(LAB_U_MAX)} step={0.005}
              value={logU} onChange={(v) => setU(10 ** v)} label={null}
              marks={[{ value: -4, label: "0.1 mm/s" }, { value: -3 }, { value: -2, label: "1 cm/s" }, { value: -1 },
                { value: 0, label: "1 m/s" }, { value: 1 }]} />
          </Box>
          <Group gap="xs" mt="md" wrap="wrap" align="flex-end">
            <Button size="xs" variant="light" onClick={() => setU(setup.u / 1.1)}>÷ 1.1</Button>
            <Button size="xs" variant="light" onClick={() => setU(setup.u * 1.1)}>× 1.1</Button>
            <NumberInput size="xs" label="u, m/s" value={setup.u} decimalScale={6} w={130}
              min={LAB_U_MIN} max={LAB_U_MAX} onChange={(v) => { const x = Number(v); if (x > 0) setU(x); }} />
            <Button size="xs" onClick={record}>Record this reading</Button>
            <Button size="xs" variant="default" onClick={refill}>Refill the columns</Button>
            {!reduced && (
              <Button size="xs" variant="default" onClick={() => setRunning((r) => !r)}>
                {running ? "Pause the drawing" : "Resume the drawing"}
              </Button>
            )}
          </Group>
          {reduced && (
            <Text size="xs" c="dimmed">
              Your system asks for reduced motion: the columns are drawn as still frames with the
              same computed numbers, and a column above its particles&apos; terminal velocity is shown
              already empty.
            </Text>
          )}
        </Panel>

        <Box style={{ display: "grid", gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: 10 }}>
          {states.map((st, k) => (
            <Box key={k} style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 6, padding: 6, minWidth: 0 }}>
              <Select size="xs" aria-label={`particles in column ${k + 1}`} allowDeselect={false}
                value={st.spec.kind} data={kindData(st.spec)} onChange={(v) => { if (v) chooseKind(k, v); }}
                comboboxProps={{ withinPortal: true }} />
              {st.refused ? (
                <Text size="xs" c="red" mt={6}>Refused: {st.refused}</Text>
              ) : (
                <>
                  <Text size="xs" mt={4}>
                    {st.spec.d_um} µm, {st.spec.rhoP} kg/m³: <b>group {st.group}</b> (the page&apos;s map)
                  </Text>
                  <ColumnCanvas st={st} k={k} canvases={canvases} timeRef={timeRef} reduced={reduced} />
                  <Instruments st={st} revealed={nb.shownMf[k] ?? false} revealedOut={nb.shownOut[k] ?? false} />
                </>
              )}
              {n > 1 && (
                <Button size="compact-xs" variant="subtle" mt={4} aria-label={`remove column ${k + 1}`}
                  onClick={() => setColumns(setup.columns.filter((_, j) => j !== k))}>remove</Button>
              )}
            </Box>
          ))}
        </Box>
        {n < 3 && (
          <Group>
            <Button size="xs" variant="light" onClick={() => {
              const used = new Set(setup.columns.map((c) => c.kind));
              const x = PARTICLES.find((p) => !used.has(p.id)) ?? PARTICLES[0]!;
              setColumns([...setup.columns, { kind: x.id, d_um: x.d_um, rhoP: x.rhoP, eps: x.eps, F: x.F }]);
            }}>Add a column</Button>
          </Group>
        )}

        <Notes states={states} />

        <NotebookPanel states={states} setup={setup} nb={nb} setNb={setNb} />

        <Panel title="what the laboratory does not show" origin="page">
          <Stack gap={2}>
            {NOT_SHOWN.map((x) => <Text key={x} size="sm">• {x}</Text>)}
          </Stack>
        </Panel>
      </Stack>
    </Box>
  );
}

/** Listed on the screen and in the design record. */
export const NOT_SHOWN: readonly string[] = [
  "the hysteresis of a first fluidisation: the small overshoot of the pressure drop on the way up, and the lower curve on the way down after the bed has been fluidised once",
  "channelling, and the plug a cohesive powder lifts as",
  "slugging in a narrow column (a computed bubble wider than the column is drawn across it and flagged, never modelled)",
  "a mixed bed: several kinds of particle in one column, their segregation and the mixture's own minimum fluidisation velocity",
  "the structure of the turbulent and transport regimes: the page computes no bed height or voids of its own there",
  "how fast particles are carried out: the page computes no elutriation rate",
  "the distributor's own pressure drop, the wall's friction and the jets above the orifices",
  "anything the page's arithmetic does not compute",
];

function Instruments({ st, revealed, revealedOut }: { st: ColumnState; revealed: boolean; revealedOut: boolean }): JSX.Element {
  const top = st.bubbleBed?.profile[st.bubbleBed.profile.length - 1];
  const rows: [string, string][] = [
    ["ΔP", st.phase === "empty" ? "0 kPa" : `${fmt(st.dP / 1000, 4)} kPa`],
    ["bed height", st.H === null ? "not computed" : `${fmt(st.H, 4)} m${st.Hfrom === "two-phase bed, outside its regime" ? " (dashed: outside its regime)" : ""}`],
    ["regime", st.phase === "empty" ? "column empty" : st.regime],
    ["u/u_mf", revealed ? fmt(st.u / st.mf.u, 4) : "after your prediction"],
    ["u_t", revealedOut ? fmtU(st.term.u) : "after your prediction"],
  ];
  if (st.phase === "bubbling" && top && st.bubbleBed) {
    rows.push(["d_b at the top", `${fmt(top.db * 100, 3)} cm`]);
    rows.push(["u_b at the top", fmtU(top.ub)]);
    rows.push(["mean bubble fraction", fmt(st.bubbleBed.deltaMean, 3)]);
  }
  if (st.phase === "particulate" && st.H !== null) {
    rows.push(["expansion", `H/L_mf = ${fmt(st.H / st.Lmf, 4)}`]);
  }
  return (
    <Box mt={4}>
      {rows.map(([a, b]) => (
        <Text key={a} size="xs" style={{ overflowWrap: "anywhere" }}><span style={{ color: "var(--mantine-color-dimmed)" }}>{a}:</span> {b}</Text>
      ))}
      {st.phase === "bubbling" && st.rise && (
        <Text size="xs" c="dimmed" style={{ overflowWrap: "anywhere" }}>
          {fmt(st.rise.wanted, 3)} voids in the bed on average
          {st.rise.wanted > 60 ? `; one in ${Math.ceil(st.rise.wanted / 60)} is drawn` : ""}
        </Text>
      )}
    </Box>
  );
}

function Notes({ states }: { states: ColumnState[] }): JSX.Element | null {
  const all = states.flatMap((st, k) => (st.refused ? [] : st.notes.map((x) => `${k + 1}. ${labelOf(st.spec)}: ${x}`)));
  if (all.length === 0) return null;
  return (
    <Panel title="what the columns say at this velocity" origin="page">
      <Stack gap={4}>{all.map((x) => <Text key={x} size="sm">{x}</Text>)}</Stack>
    </Panel>
  );
}

function NotebookPanel({ states, setup, nb, setNb }: {
  states: ColumnState[]; setup: LabSetup; nb: Notebook; setNb: (f: (b: Notebook) => Notebook) => void;
}): JSX.Element {
  const setAt = <K extends "guessMf" | "guessOut" | "shownMf" | "shownOut">(key: K, k: number, v: Notebook[K][number]): void =>
    setNb((b) => ({ ...b, [key]: (b[key] as unknown[]).map((x, j) => (j === k ? v : x)) }));
  return (
    <Panel title="your laboratory notebook" origin={["assumption", "page"]}
      originNote="your readings are the page's computed instruments at the velocities you chose; the reveal is the page's arithmetic">
      <Text size="sm">
        Each press of &quot;Record this reading&quot; writes the velocity, the pressure drop and the bed
        height of every column.  Go up, then come down.  When you can read a velocity off your
        own points, type it and only then ask for the page&apos;s.  A point recorded coming down
        at a velocity already recorded going up is drawn over it: the page computes no
        hysteresis, so the two coincide unless the bed was carried out in between.
      </Text>
      {nb.readings.length > 0 && (
        <Group><Button size="xs" variant="default" onClick={() => setNb(() => emptyNotebook(setup.columns.length))}>Clear the notebook</Button></Group>
      )}
      <Box style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        {states.map((st, k) => {
          if (st.refused) return null;
          const rs = nb.readings.filter((r) => r.col === k);
          const pts = (dir: "up" | "down"): XY[] => rs.filter((r) => r.dir === dir && r.dP > 0).map((r): XY => [r.u, r.dP / 1000]);
          const mfR = revealOf(nb.guessMf[k] ?? "", st.mf.u);
          const outR = revealOf(nb.guessOut[k] ?? "", st.term.u);
          const shownMf = nb.shownMf[k] ?? false, shownOut = nb.shownOut[k] ?? false;
          const curve: XY[] = [];
          if (shownMf) {
            const lo = Math.max(LAB_U_MIN, st.mf.u / 30), hi = Math.min(LAB_U_MAX, st.mf.u * 30);
            for (let j = 0; j <= 60; j++) {
              const u = lo * (hi / lo) ** (j / 60);
              curve.push([u, bedPressureDrop(u, st.p, st.gas, st.spec.eps, st.LmfFull, st.mf.u) / 1000]);
            }
          }
          const series = [
            { name: "going up", color: UP, points: pts("up") },
            { name: "coming down", color: DOWN, points: pts("down") },
            ...(shownMf ? [{ name: "the page's ΔP for the full charge", color: PAGE, dash: "6 4", line: curve }] : []),
          ];
          return (
            <Box key={k} style={{ minWidth: 0 }}>
              <Text size="sm" fw={600}>{k + 1}. {labelOf(st.spec)} (group {st.group})</Text>
              {rs.length === 0 && !shownMf ? (
                <Text size="xs" c="dimmed">No reading yet.</Text>
              ) : (series.some((s) => (s.points?.length ?? 0) > 0 || (s.line?.length ?? 0) > 0)) ? (
                <XYPlot ariaLabel={`your pressure drop readings for column ${k + 1}`} xLabel="u, m/s (log)" yLabel="ΔP, kPa" xlog series={series} />
              ) : <Text size="xs" c="dimmed">No reading with a pressure drop yet.</Text>}
              {rs.length > 0 && (
                <Wide>
                  <Table fz="xs" striped withTableBorder style={{ minWidth: 260 }}>
                    <Table.Thead><Table.Tr><Table.Th>u</Table.Th><Table.Th>ΔP, kPa</Table.Th><Table.Th>H, m</Table.Th><Table.Th></Table.Th></Table.Tr></Table.Thead>
                    <Table.Tbody>
                      {rs.map((r, j) => (
                        <Table.Tr key={j}><Table.Td>{fmtU(r.u)}</Table.Td><Table.Td>{fmt(r.dP / 1000, 4)}</Table.Td>
                          <Table.Td>{r.H === null ? "—" : fmt(r.H, 4)}</Table.Td><Table.Td>{r.dir}</Table.Td></Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Wide>
              )}
              <Group gap="xs" align="flex-end" mt={6} wrap="wrap">
                <NumberInput size="xs" label="your u_mf, m/s" value={nb.guessMf[k] ?? ""} w={130} min={0} decimalScale={6}
                  onChange={(v) => setAt("guessMf", k, v)} disabled={shownMf} />
                <Button size="xs" variant="light" disabled={!mfR.ok || shownMf} onClick={() => setAt("shownMf", k, true)}>Reveal u_mf</Button>
              </Group>
              {shownMf && mfR.ok && (
                <Text size="xs" mt={4}>
                  The page computes u_mf = <b>{fmtU(st.mf.u)}</b> (Ergun equal to the bed&apos;s weight);
                  Wen and Yu&apos;s correlation gives {fmtU(st.mf.wenYu.u)}.  Yours, {fmtU(mfR.guess)}, is{" "}
                  {mfR.diffPct >= 0 ? "+" : ""}{fmt(mfR.diffPct, 3)} % from the page&apos;s.
                  {st.group === "C" ? "  For this cohesive powder the page's own text says the bed does not fluidise cleanly: this number is Ergun's balance, not what the powder would do." : ""}
                </Text>
              )}
              <Group gap="xs" align="flex-end" mt={6} wrap="wrap">
                <NumberInput size="xs" label="your carry-away u, m/s" value={nb.guessOut[k] ?? ""} w={150} min={0} decimalScale={6}
                  onChange={(v) => setAt("guessOut", k, v)} disabled={shownOut} />
                <Button size="xs" variant="light" disabled={!outR.ok || shownOut} onClick={() => setAt("shownOut", k, true)}>Reveal u_t</Button>
              </Group>
              {shownOut && outR.ok && (
                <Text size="xs" mt={4}>
                  The page computes the terminal velocity u_t = <b>{fmtU(st.term.u)}</b> (the drag
                  balance, Re_t = {fmt(st.term.Re, 3)}).  Yours, {fmtU(outR.guess)}, is{" "}
                  {outR.diffPct >= 0 ? "+" : ""}{fmt(outR.diffPct, 3)} % from the page&apos;s.
                </Text>
              )}
              {!mfR.ok && !shownMf && <Text size="xs" c="dimmed">{mfR.reason}.</Text>}
            </Box>
          );
        })}
      </Box>
    </Panel>
  );
}
