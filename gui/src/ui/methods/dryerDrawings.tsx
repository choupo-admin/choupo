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
  dryerDrawings -- the seven schematics of the "Which dryer for which
  product" page (DEV.md 4c C460).

  EVERY DRAWING IS ORIGINAL.  Each one was constructed for this page from a
  written description of how the equipment works (the descriptions in
  dryerSelection.ts, which cite their sources) out of rectangles, circles,
  polygons and arrows in a 200 x 150 box.  None was traced, redrawn from or
  modelled on a figure of any book or catalogue: the books' figures are
  copyrighted, and a schematic of this kind carries no more than the
  arrangement that the words already say -- where the feed goes in, where the
  gas flows, where the product comes out.

  THE CODE IS FIXED, so a drawing can be read without a legend per picture
  (the page prints one legend): blue is the wet feed, red the hot gas (or the
  heating surface), amber the dry product, grey the vapour or exhaust.  Equipment
  outlines take the page's text colour, so they follow the light and the dark
  theme.  These are SCHEMATICS, not designs: they carry no dimension and no
  proportion that means anything.
\*---------------------------------------------------------------------------*/

import type { DryerId } from "./dryerSelection.js";

export const FEED_COLOR = "#2a78d6";
export const GAS_COLOR = "#c0392b";
export const PRODUCT_COLOR = "#b8893b";
export const VAPOUR_COLOR = "#7f8c8d";
const INK = "var(--mantine-color-text)";

/** An arrow from (x1, y1) to (x2, y2) with a small solid head. */
function Arrow({ x1, y1, x2, y2, color }: {
  x1: number; y1: number; x2: number; y2: number; color: string;
}): JSX.Element {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const hx = x2 - ux * 6, hy = y2 - uy * 6;
  const px = -uy * 3, py = ux * 3;
  return (
    <g>
      <line x1={x1} y1={y1} x2={hx} y2={hy} stroke={color} strokeWidth={2} />
      <polygon points={`${x2},${y2} ${hx + px},${hy + py} ${hx - px},${hy - py}`} fill={color} />
    </g>
  );
}

function Label({ x, y, children, anchor = "start" }: {
  x: number; y: number; children: string; anchor?: "start" | "middle" | "end";
}): JSX.Element {
  return <text x={x} y={y} fontSize={9} textAnchor={anchor} fill={INK}>{children}</text>;
}

const body = { fill: "none", stroke: INK, strokeWidth: 1.6, strokeLinejoin: "round" as const };

function Spray(): JSX.Element {
  const drops: [number, number][] = [[88, 36], [100, 40], [112, 36], [82, 50], [94, 54],
    [106, 54], [118, 50], [90, 66], [110, 66], [100, 72]];
  return (
    <g>
      <path d="M60,26 L140,26 L140,78 L107,122 L93,122 L60,78 Z" {...body} />
      <rect x={92} y={22} width={16} height={5} fill={INK} />
      {drops.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.6} fill={FEED_COLOR} />)}
      <Arrow x1={100} y1={4} x2={100} y2={21} color={FEED_COLOR} />
      <Label x={106} y={12}>liquid feed</Label>
      <Arrow x1={14} y1={36} x2={58} y2={36} color={GAS_COLOR} />
      <Label x={8} y={30}>hot gas</Label>
      <Arrow x1={100} y1={122} x2={100} y2={144} color={PRODUCT_COLOR} />
      <Label x={106} y={140}>powder</Label>
      <path d="M140,100 L162,100" fill="none" stroke={VAPOUR_COLOR} strokeWidth={2} />
      <path d="M160,88 L190,88 L180,112 L170,112 Z" {...body} />
      <Arrow x1={175} y1={88} x2={175} y2={72} color={VAPOUR_COLOR} />
      <Label x={152} y={68}>exhaust gas</Label>
      <Label x={175} y={126} anchor="middle">cyclone</Label>
    </g>
  );
}

function Rotary(): JSX.Element {
  const flights: number[] = [62, 80, 98, 116, 134];
  return (
    <g>
      <g transform="rotate(-7 100 80)">
        <rect x={34} y={58} width={132} height={44} rx={4} {...body} />
        {flights.map((x) => (
          <g key={x}>
            <line x1={x} y1={60} x2={x + 7} y2={72} stroke={INK} strokeWidth={1.2} />
            <line x1={x} y1={100} x2={x + 7} y2={88} stroke={INK} strokeWidth={1.2} />
          </g>
        ))}
        {[[70, 80], [90, 78], [110, 82], [128, 79], [148, 81]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={1.7} fill={PRODUCT_COLOR} />
        ))}
      </g>
      <polygon points="6,64 28,64 22,76 12,76" {...body} />
      <Arrow x1={17} y1={44} x2={17} y2={62} color={FEED_COLOR} />
      <Label x={22} y={42}>wet feed</Label>
      <Arrow x1={4} y1={92} x2={36} y2={92} color={GAS_COLOR} />
      <Label x={4} y={108}>hot gas</Label>
      <Arrow x1={178} y1={96} x2={178} y2={128} color={PRODUCT_COLOR} />
      <Label x={150} y={140}>dry product</Label>
      <Arrow x1={170} y1={60} x2={188} y2={46} color={VAPOUR_COLOR} />
      <Label x={150} y={38}>exhaust gas</Label>
      <circle cx={64} cy={118} r={9} {...body} />
      <circle cx={132} cy={111} r={9} {...body} />
    </g>
  );
}

function FluidBed(): JSX.Element {
  const dots: [number, number][] = [[62, 66], [74, 58], [86, 68], [98, 60], [110, 70], [122, 58],
    [134, 66], [68, 74], [92, 76], [116, 76], [140, 74], [80, 50], [104, 52], [128, 50]];
  return (
    <g>
      <rect x={50} y={28} width={100} height={52} {...body} />
      <line x1={50} y1={80} x2={150} y2={80} stroke={INK} strokeWidth={1.6} strokeDasharray="3 2" />
      <path d="M50,80 L150,80 L132,108 L68,108 Z" {...body} />
      {dots.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2} fill={PRODUCT_COLOR} />)}
      {[66, 100, 134].map((x) => <Arrow key={x} x1={x} y1={78} x2={x} y2={58} color={GAS_COLOR} />)}
      <Arrow x1={100} y1={140} x2={100} y2={110} color={GAS_COLOR} />
      <Label x={106} y={134}>hot gas</Label>
      <Arrow x1={8} y1={54} x2={48} y2={62} color={FEED_COLOR} />
      <Label x={6} y={46}>wet feed</Label>
      <Arrow x1={150} y1={70} x2={190} y2={70} color={PRODUCT_COLOR} />
      <Label x={152} y={84}>dry product</Label>
      <Arrow x1={100} y1={28} x2={100} y2={6} color={VAPOUR_COLOR} />
      <Label x={106} y={14}>exhaust gas</Label>
      <Label x={100} y={96} anchor="middle">gas plenum</Label>
    </g>
  );
}

function Tray(): JSX.Element {
  const rows = [40, 62, 84, 106];
  return (
    <g>
      <rect x={52} y={18} width={104} height={104} {...body} />
      {rows.map((y) => (
        <g key={y}>
          <rect x={62} y={y} width={84} height={5} fill={PRODUCT_COLOR} stroke={INK} strokeWidth={1} />
        </g>
      ))}
      {[33, 55, 77, 99].map((y) => (
        <Arrow key={y} x1={58} y1={y} x2={150} y2={y} color={GAS_COLOR} />
      ))}
      <circle cx={28} cy={70} r={11} {...body} />
      <path d="M22,70 L34,70 M28,64 L28,76" stroke={INK} strokeWidth={1.2} />
      <line x1={39} y1={70} x2={52} y2={70} stroke={GAS_COLOR} strokeWidth={2} />
      <Label x={28} y={92} anchor="middle">fan, heater</Label>
      <Arrow x1={156} y1={26} x2={186} y2={14} color={VAPOUR_COLOR} />
      <Label x={158} y={8}>exhaust</Label>
      <Label x={104} y={138} anchor="middle">wet material on trays, one batch</Label>
    </g>
  );
}

function Belt(): JSX.Element {
  const mats: number[] = [58, 70, 82, 94, 106, 118, 130, 142];
  return (
    <g>
      <rect x={26} y={34} width={148} height={84} {...body} />
      <circle cx={42} cy={80} r={8} {...body} />
      <circle cx={158} cy={80} r={8} {...body} />
      <line x1={42} y1={72} x2={158} y2={72} stroke={INK} strokeWidth={1.6} strokeDasharray="2 2" />
      <line x1={42} y1={88} x2={158} y2={88} stroke={INK} strokeWidth={1.6} />
      {mats.map((x) => <circle key={x} cx={x} cy={69} r={2.6} fill={PRODUCT_COLOR} />)}
      <path d="M30,40 L56,40 L48,56 L38,56 Z" {...body} />
      <Arrow x1={43} y1={16} x2={43} y2={38} color={FEED_COLOR} />
      <Label x={50} y={16}>wet feed</Label>
      <Arrow x1={176} y1={80} x2={196} y2={104} color={PRODUCT_COLOR} />
      <Label x={146} y={146}>dry product</Label>
      {[68, 92, 116, 140].map((x) => <Arrow key={x} x1={x} y1={112} x2={x} y2={78} color={GAS_COLOR} />)}
      <Label x={30} y={134}>hot gas through the layer</Label>
      <Arrow x1={104} y1={34} x2={104} y2={12} color={VAPOUR_COLOR} />
      <Label x={110} y={20}>exhaust</Label>
    </g>
  );
}

function Drum(): JSX.Element {
  return (
    <g>
      <circle cx={100} cy={72} r={38} {...body} />
      <circle cx={100} cy={72} r={3} fill={INK} />
      <Label x={100} y={68} anchor="middle">steam</Label>
      <path d="M100,110 A38,38 0 1 1 138,72" fill="none" stroke={FEED_COLOR} strokeWidth={4}
        opacity={0.75} />
      <path d="M66,118 L134,118 L128,136 L72,136 Z" {...body} />
      <path d="M72,124 L128,124" stroke={FEED_COLOR} strokeWidth={3} opacity={0.75} />
      <Arrow x1={14} y1={128} x2={70} y2={128} color={FEED_COLOR} />
      <Label x={8} y={144}>liquid or paste feed</Label>
      <line x1={146} y1={66} x2={164} y2={80} stroke={INK} strokeWidth={2} />
      <Arrow x1={160} y1={86} x2={180} y2={112} color={PRODUCT_COLOR} />
      <Label x={146} y={128}>dry flakes</Label>
      <path d="M62,38 Q100,10 138,38" {...body} />
      <Arrow x1={100} y1={22} x2={100} y2={6} color={VAPOUR_COLOR} />
      <Label x={106} y={12}>vapour hood</Label>
    </g>
  );
}

function Freeze(): JSX.Element {
  const shelves = [48, 70, 92];
  return (
    <g>
      <rect x={14} y={24} width={94} height={96} rx={4} {...body} />
      {shelves.map((y) => (
        <g key={y}>
          <line x1={24} y1={y} x2={98} y2={y} stroke={GAS_COLOR} strokeWidth={2.4} />
          {[30, 42, 54, 66, 78, 90].map((x) => (
            <rect key={x} x={x - 3} y={y - 10} width={6} height={10} fill="none"
              stroke={FEED_COLOR} strokeWidth={1.2} />
          ))}
        </g>
      ))}
      <Label x={61} y={136} anchor="middle">shelves with vials</Label>
      <line x1={108} y1={72} x2={128} y2={72} stroke={VAPOUR_COLOR} strokeWidth={2.4} />
      <rect x={128} y={44} width={34} height={56} rx={3} {...body} />
      <path d="M134,52 L156,58 L134,64 L156,70 L134,76 L156,82 L134,88 L156,94" fill="none"
        stroke={FEED_COLOR} strokeWidth={1.4} />
      <Label x={140} y={120} anchor="middle">ice condenser</Label>
      <line x1={162} y1={72} x2={169} y2={72} stroke={VAPOUR_COLOR} strokeWidth={2.4} />
      <circle cx={178} cy={72} r={9} {...body} />
      <Label x={181} y={92} anchor="middle">vacuum</Label>
      <Label x={181} y={102} anchor="middle">pump</Label>
    </g>
  );
}

const DRAWINGS: Readonly<Record<DryerId, () => JSX.Element>> = {
  spray: Spray, rotary: Rotary, fluidBed: FluidBed, tray: Tray, belt: Belt, drum: Drum, freeze: Freeze,
};

export function DryerDrawing({ id, label }: { id: DryerId; label: string }): JSX.Element {
  const Draw = DRAWINGS[id];
  return (
    <svg viewBox="0 0 200 150" width="100%" role="img" aria-label={`Schematic of a ${label}`}
      data-dryer-drawing={id} style={{ display: "block", maxWidth: 260 }}>
      <Draw />
    </svg>
  );
}

/** The one legend of the code of colours, printed once under the grid. */
export function DrawingLegend(): JSX.Element {
  const items: [string, string][] = [
    [FEED_COLOR, "wet feed"], [GAS_COLOR, "hot gas or heated surface"],
    [PRODUCT_COLOR, "dry product"], [VAPOUR_COLOR, "vapour or exhaust gas"],
  ];
  return (
    <div data-dryer-legend="" style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12 }}>
      {items.map(([c, t]) => (
        <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 4, background: c, display: "inline-block" }} />
          {t}
        </span>
      ))}
    </div>
  );
}
