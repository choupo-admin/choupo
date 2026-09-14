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
  WegsteinCobweb — the picture of the METHOD, one variable at a time.

  THE IDENTITY THIS FIGURE EXISTS TO SHOW, and it is exact rather than
  suggestive:

      THE SECANT THROUGH THE LAST TWO VISITED POINTS CROSSES THE 45-DEGREE
      DIAGONAL AT THE NEXT WEGSTEIN ITERATE.

  Proof, in the page's own symbols.  Wegstein takes
  `x^{k+1} = q x^k + (1-q) g^k` with `q = s/(s-1)` and
  `s = (g^k - g^{k-1})/(x^k - x^{k-1})`.  The secant through the two visited
  points (x^{k-1}, g^{k-1}) and (x^k, g^k) is `y = g^k + s (x - x^k)`; setting
  `y = x` gives `x = (g^k - s x^k)/(1 - s)`.  Substituting
  `1 - q = -1/(s-1)` into Wegstein's formula gives `[s x^k - g^k]/(s-1)`,
  which is the same number.  Verified numerically on the COUPLED map
  (c = 0.30) at relative difference 0 before this file was written.

  So `q` stops being a coefficient a student takes on faith and becomes a
  place on a drawing.

  WHY THERE IS NOT ALWAYS A CURVE, and the absence is the lesson rather than a
  gap.  A cobweb in the textbook sense needs a ONE-dimensional map.  This toy
  is two-dimensional: `g_0` depends on `x_1` as well as `x_0` through the
  coupling `c` (wegsteinMath.ts `toyG`).  When `c = 0` the map separates and
  `g_i(x_i)` IS a function -- a straight line through the fixed point with
  slope `a` or `b` -- so it is drawn.  When `c != 0` no such function exists
  and NONE is drawn: what is plotted instead is the set of points the
  iteration actually visited, which is exact either way.

  That conditional is not a limitation being apologised for.  It is the
  answer to the owner's question: Wegstein never needed a one-dimensional
  map, because it only ever looks at two points it has already visited, one
  variable at a time.  A figure that drew a curve through a coupled map would
  be teaching a fixed point that does not exist.

  WHAT THE CLAMP LOOKS LIKE.  `qmin`/`qmax` (the `recycleWegsteinQmin` and
  `Qmax` keys of a case's `system/solverDict`) bound `q` before it is used.
  When the clamp bites, the secant still crosses the diagonal where it
  crosses -- but the iteration does NOT go there, and the figure marks both
  points so the distance between them IS the clamp.  A page that drew only
  the crossing would be describing an accelerator the engine does not run.
\*---------------------------------------------------------------------------*/

import { lazy, Suspense, type ComponentProps } from "react";
import { Box, Loader, Text } from "@mantine/core";
import type { DisplayUnits, Iterate, ToyMap } from "./wegsteinMath.js";
import { TOY_F_STAR, TOY_T_STAR, toyG } from "./wegsteinMath.js";

export interface CobwebProps {
  iterates: readonly Iterate[];
  /** 0 = the molar flow, 1 = the temperature.  The two are drawn separately
   *  because Wegstein treats them separately; putting them on one axis would
   *  be the very confusion the page exists to remove. */
  varIndex: 0 | 1;
  units: DisplayUnits;
  map: ToyMap;
  /** Which step to open the secant on.  Clamped by the caller to a step that
   *  HAS a predecessor: there is no secant through one point. */
  k: number;
}

/** value_display = m*v + o, per variable — the same transform `rescale` makes
 *  on a whole vector, applied to one coordinate.  Not a second home: it reads
 *  the same DisplayUnits record. */
const disp = (v: number, u: DisplayUnits, i: 0 | 1): number =>
  v * (u.scale[i] ?? 1) + (u.offset[i] ?? 0);

const Figure = lazy(async () => {
  const { Plot, PLOT_CONFIG, PLOT_COLORS, darkLayout } =
    await import("../plotting/plotly.js");
  type PlotData = ComponentProps<typeof Plot>["data"];

  function Cobweb({ iterates, varIndex, units, map, k }: CobwebProps) {
    const i = varIndex;
    const name = i === 0 ? "F" : "T";
    const unit = units.names[i] ?? "";
    const star = i === 0 ? TOY_F_STAR : TOY_T_STAR;
    const slope = i === 0 ? map.a : map.b;
    const separable = map.c === 0;

    //  The visited points, in display units.  `x` is where the sweep started
    //  and `gx` is what one pass round the loop returned -- the two numbers
    //  the secant is built from, and nothing else.
    const xs = iterates.map((it) => disp(it.x[i], units, i));
    const gs = iterates.map((it) => disp(it.gx[i], units, i));

    //  Axis span: the visited points and the fixed point, with a margin.  A
    //  fixed [0,1] would be meaningless here -- these are a molar flow and a
    //  temperature, not mole fractions.
    const all = [...xs, ...gs, disp(star, units, i)];
    const lo = Math.min(...all), hi = Math.max(...all);
    const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.1 || 1;
    const a0 = lo - pad, a1 = hi + pad;

    const kk = Math.min(Math.max(k, 1), iterates.length - 1);
    const prev = iterates[kk - 1], cur = iterates[kk];
    const step = cur?.vars[i];

    const traces: Record<string, unknown>[] = [
      { type: "scatter", mode: "lines", name: "y = x  (the fixed point lies here)",
        x: [a0, a1], y: [a0, a1],
        line: { color: PLOT_COLORS.accent2, width: 1, dash: "dot" },
        hoverinfo: "skip" },
    ];

    //  THE MAP, drawn only when it IS a map of this variable alone.
    if (separable) {
      //  The line is `toyG` ITSELF, asked one variable at a time -- never a
      //  re-derivation of its algebra, which would be a second home for the
      //  map.  The other coordinate is held at its fixed point, and with
      //  `c = 0` (the only branch that reaches here) it cannot influence the
      //  answer, so what is drawn is exactly the function the iteration runs.
      const gAt = (xv: number) => {
        const raw = (xv - (units.offset[i] ?? 0)) / (units.scale[i] ?? 1);
        const probe: [number, number] =
          i === 0 ? [raw, TOY_T_STAR] : [TOY_F_STAR, raw];
        return disp(toyG(map, probe)[i], units, i);
      };
      traces.push({
        type: "scatter", mode: "lines",
        name: `one sweep: g(${name}) — slope ${slope.toFixed(2)}`,
        x: [a0, a1], y: [gAt(a0), gAt(a1)],
        line: { color: PLOT_COLORS.accent, width: 2.5 },
        hovertemplate: `${name}=%{x:.4g}<br>g=%{y:.4g}<extra>one sweep</extra>`,
      });
    }

    //  The trajectory actually visited — exact whether or not the map
    //  separates, which is why it is always drawn.
    traces.push({
      type: "scatter", mode: "markers+text",
      name: "sweeps taken",
      x: xs, y: gs,
      //  Only the sweeps this figure is ABOUT are labelled: the seed, and the
      //  two the secant is drawn through.  A converging trajectory crowds its
      //  last points into one place, and fifteen indices stacked there is a
      //  black clot that hides the very marks the lesson is pointing at.
      text: iterates.map((it) =>
        (it.k === 0 || it.k === kk || it.k === kk - 1) ? String(it.k) : ""),
      textposition: "top center",
      marker: { color: PLOT_COLORS.warm2, size: 7 },
      textfont: { size: 10 },
      hovertemplate: `k=%{text}<br>${name}=%{x:.5g}<br>g=%{y:.5g}<extra></extra>`,
    });

    if (prev && cur && step && step.s !== null) {
      const s = step.s;
      const xk = disp(cur.x[i], units, i), gk = disp(cur.gx[i], units, i);
      //  THE SECANT, extended across the whole axis so the crossing is
      //  visibly a crossing and not an endpoint.
      traces.push({
        type: "scatter", mode: "lines",
        name: `secant  s = ${s.toFixed(4)}`,
        x: [a0, a1], y: [gk + s * (a0 - xk), gk + s * (a1 - xk)],
        line: { color: PLOT_COLORS.warm, width: 2, dash: "dash" },
        hovertemplate: `secant<extra></extra>`,
      });
      //  Where it cuts the diagonal.  THIS IS THE NEXT WEGSTEIN ITERATE when
      //  q is not clamped -- see the header for the proof.
      const cross = (gk - s * xk) / (1 - s);
      if (Number.isFinite(cross)) {
        //  WHICH COEFFICIENT BELONGS ON THIS MARK.  The crossing is where the
        //  UNCLAMPED coefficient points; labelling it with the clamped `q`
        //  the iteration actually used would name this place after a number
        //  that did not produce it.  So when the clamp bit, the crossing
        //  carries `qRaw` and says it was refused, and the mark below carries
        //  the `q` that was used.
        const crossLabel = step.why === "clamped" && step.qRaw !== null
          ? `q = ${step.qRaw.toFixed(3)} — refused by the clamp`
          : `q = ${step.q.toFixed(3)}`;
        traces.push({
          type: "scatter", mode: "markers+text",
          name: "secant meets y = x",
          x: [cross], y: [cross],
          //  The label is placed AWAY from the nearer axis edge.  A crossing
          //  in the right half of the picture -- which is where an accurate
          //  secant puts it, because the fixed point is there -- takes its
          //  label to the left, or the sentence runs off the plot and the
          //  reader sees "q = -5..." and nothing else.
          text: [crossLabel],
          textposition: cross > (a0 + a1) / 2 ? "bottom left" : "bottom right",
          marker: { color: PLOT_COLORS.warm, size: 12, symbol: "x" },
          textfont: { size: 11 },
          hovertemplate: `next ${name} = %{x:.5g}<extra>secant</extra>`,
        });
      }
      //  WHERE THE ITERATION ACTUALLY WENT.  Equal to the crossing whenever
      //  the secant branch ran; DIFFERENT when qmin/qmax bit, and then the
      //  gap between the two marks is exactly what the clamp did.
      const nxt = disp(step.next, units, i);
      if (!Number.isFinite(cross) || Math.abs(nxt - cross) >
          1e-9 * Math.max(Math.abs(nxt), Math.abs(cross))) {
        traces.push({
          type: "scatter", mode: "markers+text",
          name: `where it went (${step.why})`,
          x: [nxt], y: [nxt],
          text: [`q = ${step.q.toFixed(3)} (${step.why})`],
          textposition: nxt > (a0 + a1) / 2 ? "top left" : "top right",
          marker: { color: PLOT_COLORS.series[4], size: 12, symbol: "diamond" },
          textfont: { size: 10 },
          hovertemplate: `next ${name} = %{x:.5g}<extra>${step.why}</extra>`,
        });
      }
      //  What PLAIN substitution would have done from the same point: up to
      //  the sweep's answer, across to the diagonal.  Faint, because it is
      //  the comparison and not the subject.
      traces.push({
        type: "scatter", mode: "lines", name: "direct substitution would go",
        x: [xk, xk, gk], y: [xk, gk, gk],
        line: { color: PLOT_COLORS.series[5], width: 1.5, dash: "dot" },
        hoverinfo: "skip",
      });
    }

    return (
      <Plot
        data={traces as PlotData}
        layout={{
          ...darkLayout,
          title: {
            text: `${name}: one sweep against its own input — and where the secant says to go next`,
            font: { ...darkLayout.font, size: 13 },
          },
          //  BOTH axes carry `constrain: "domain"`.  `scaleanchor` makes
          //  Plotly satisfy the 1:1 ratio by WIDENING a range unless it is
          //  told to shrink the drawing area instead -- and a widened x range
          //  puts `y = x` at some angle that is not 45 degrees, which would
          //  make every claim on this page about "crossing the diagonal" a
          //  claim about a line that is not the diagonal.
          xaxis: { ...darkLayout.xaxis, range: [a0, a1], constrain: "domain",
            title: { text: `${name} into the sweep  [${unit}]` } },
          yaxis: { ...darkLayout.yaxis, range: [a0, a1], scaleanchor: "x",
            scaleratio: 1, constrain: "domain",
            title: { text: `g(${name}) out of the sweep  [${unit}]` } },
          legend: { ...darkLayout.legend, x: 0.02, y: 0.98 },
          showlegend: true,
        }}
        config={PLOT_CONFIG}
        style={{ width: "100%", height: 420 }}
        useResizeHandler
      />
    );
  }
  return { default: Cobweb };
});

export function WegsteinCobweb(props: CobwebProps) {
  return (
    <Box>
      <Suspense fallback={<Loader size="sm" />}>
        <Figure {...props} />
      </Suspense>
      {props.map.c === 0 && (
        <Text size="xs" c="dimmed" mt={4}>
          With the coupling at zero the secant lies ON the map line, and that
          is the lesson rather than a redundancy: a straight map has the same
          slope everywhere, so two visited points measure it exactly and the
          crossing is the true fixed point. Turn the coupling up and the two
          lines separate — the secant then measures the slope along the path
          the iteration happened to take, which is not the same thing.
        </Text>
      )}
      {props.map.c !== 0 && (
        <Text size="xs" c="dimmed" mt={4}>
          No curve is drawn because the coupling is {props.map.c.toFixed(2)}:
          with the two variables coupled, g({props.varIndex === 0 ? "F" : "T"})
          is not a function of {props.varIndex === 0 ? "F" : "T"} alone, so
          there is no curve to draw. The points are the sweeps actually taken,
          and the secant through the last two is exactly what Wegstein uses —
          it never needed the curve.
        </Text>
      )}
    </Box>
  );
}
