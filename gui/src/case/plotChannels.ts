/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * plotChannels -- no two series of one figure told apart by colour alone
 * (DEV.md 4c C168 slice 2, ruling (d) and the audit's AC8).
 *
 * WHY.  The audit found NanoFiltran's Fig. 3 drawing Na+, Mg2+ and Cl- as
 * three solid lines and three open squares that differ ONLY in colour, and
 * membrane24's parity figure the same for its four salts: a colour-blind
 * reader, or a greyscale print, cannot tell which curve is which ion.
 *
 * THE RULE, applied once in the shared <Plot> wrapper (ui/plotting/
 * plotly.ts) so every figure gets it: traces of one figure that share their
 * whole non-colour look -- the same mode, the same marker symbol, the same
 * line dash -- are given a second channel: the marker SHAPE for a trace that
 * draws markers, the line DASH for one that draws only lines.  A declared
 * dash is never overwritten (a figure that says "the other program" with a
 * dashed line keeps it -- a group of lines sharing a DECLARED dash gets a
 * sparse marker shape along each line instead); a marker shape the whole group shares is varied but
 * its FILL is kept (an open marker stays open, so "open = the other
 * program" survives); and the cycle skips every shape and dash the figure
 * already uses elsewhere, so an assigned one never collides with a declared
 * meaning.  The first trace of each group keeps its look; the legend shows
 * the shape or the dash beside the name.
 *
 * PURE: data in, data out, nothing mutated.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const SYMBOLS = ["circle", "square", "diamond", "triangle-up", "x", "cross", "triangle-down",
  "star", "hexagon", "pentagon"];
const DASHES = ["solid", "dash", "dot", "dashdot", "longdash", "longdashdot"];

function rawModeOf(t: any): string {
  if (t.mode) return String(t.mode);
  return (t.type ?? "scatter") === "scatter" ? "lines+markers" : "";
}

/** A marker drawn in a fully transparent colour is not SEEN (a figure may
 *  keep invisible markers to hover on): it says nothing, so the trace is
 *  read as the lines it shows. */
function invisibleMarker(t: any): boolean {
  const c = t.marker?.color;
  if (typeof c !== "string") return false;
  const k = c.replace(/\s+/g, "");
  return k.toLowerCase() === "transparent" || /^rgba\(.*,0(\.0+)?\)$/.test(k);
}

/** The mode as SEEN. */
function modeOf(t: any): string {
  const m = rawModeOf(t);
  return invisibleMarker(t) ? (m.replace(/\+?markers/, "") || "lines") : m;
}

function isSeries(t: any): boolean {
  const type = t.type ?? "scatter";
  return (type === "scatter" || type === "scattergl") && t.visible !== false;
}

/** The look of a trace with its colour taken away. */
function signature(t: any): string {
  const m = modeOf(t);
  const sym = /markers/.test(m) ? String(t.marker?.symbol ?? "circle") : "-";
  const dash = /lines/.test(m) ? String(t.line?.dash ?? "solid") : "-";
  return `${t.type ?? "scatter"}|${m}|${sym}|${dash}|${t.xaxis ?? "x"}${t.yaxis ?? "y"}`;
}

/** The traces with a second channel added where only colour told them apart. */
export function withSecondChannel(data: readonly any[]): any[] {
  if (!Array.isArray(data) || data.length < 2) return data as any[];
  const usedSym = new Set<string>();
  const usedDash = new Set<string>();
  for (const t of data) {
    if (!t || !isSeries(t)) continue;
    if (t.marker?.symbol !== undefined) usedSym.add(String(t.marker.symbol).replace(/-open(-dot)?$|-dot$/, ""));
    if (t.line?.dash !== undefined) usedDash.add(String(t.line.dash));
  }
  const groups = new Map<string, number[]>();
  data.forEach((t, i) => {
    if (!t || !isSeries(t) || Array.isArray(t.marker?.symbol)) return;
    const k = signature(t);
    const g = groups.get(k);
    if (g) g.push(i); else groups.set(k, [i]);
  });
  const out = data.slice();
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    const m = modeOf(data[idx[0]!]);
    const markers = /markers/.test(m);
    const lines = /lines/.test(m);
    if (markers) {
      const base = String(data[idx[0]!].marker?.symbol ?? "circle");
      const suffix = (base.match(/-open(-dot)?$|-dot$/) ?? [""])[0];
      const root = base.slice(0, base.length - suffix.length);
      const pool = SYMBOLS.filter((s) => s !== root && !usedSym.has(s));
      idx.slice(1).forEach((i, n) => {
        const t = data[i];
        const s = pool[n % Math.max(1, pool.length)];
        if (!s) return;
        out[i] = { ...t, marker: { ...(t.marker ?? {}), symbol: s + suffix } };
      });
    } else if (lines) {
      const declared = idx.some((i) => data[i].line?.dash !== undefined);
      if (!declared) {
        const pool = DASHES.filter((d) => d !== "solid" && !usedDash.has(d));
        idx.slice(1).forEach((i, n) => {
          const d = pool[n % Math.max(1, pool.length)];
          if (!d) return;
          out[i] = { ...data[i], line: { ...(data[i].line ?? {}), dash: d } };
        });
      } else {
        //  The group DECLARES its dash (it means something -- "this program's
        //  curves"), so the dash stays and the second channel is a marker
        //  SHAPE drawn sparsely along each line (Plotly's `maxdisplayed`).
        const pool = SYMBOLS.filter((s) => !usedSym.has(s));
        idx.slice(1).forEach((i, n) => {
          const t = data[i];
          const s = pool[n % Math.max(1, pool.length)];
          if (!s) return;
          //  in the line's own colour, so a hover-only (invisible) marker
          //  becomes one the reader sees
          out[i] = { ...t, mode: `${modeOf(t)}+markers`,
            marker: { ...(t.marker ?? {}), symbol: s, size: (t.marker?.size as number | undefined) ?? 7, maxdisplayed: 12,
              color: t.line?.color ?? t.marker?.line?.color ?? t.marker?.color } };
        });
      }
    }
  }
  return out;
}
