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
  dryerDrawings -- the nine schematics of the "Which dryer for which
  product" page (DEV.md 4c C460; flash and agitated vacuum added by C508).

  EVERY DRAWING IS ORIGINAL.  Each one was constructed for this page from a
  written description of how the equipment works (the descriptions in
  dryerSelection.ts, which cite their sources) out of rectangles, circles,
  polygons and arrows in a 200 x 150 box.  None was traced, redrawn from or
  modelled on a figure of any book or catalogue: the books' figures are
  copyrighted, and a schematic of this kind carries no more than the
  arrangement that the words already say -- where the feed goes in, where the
  gas flows, where the product comes out.

  AFTER AN EXPERT REVIEW (2026-11-21) each arrangement was checked against the
  chapter of Mujumdar's Handbook that describes the equipment, and against
  Towler's and Perry's descriptions, and drawn from what the WORDS say:
    rotary    the feed enters the UPPER end and the product leaves the LOWER
              end (Mujumdar p. 151); a burner and combustion chamber at the
              feed end make the gas, which flows co-current; a cyclone sits on
              the exhaust (p. 152).  The shell tilts clockwise in SVG (a
              positive rotate), so its right end is the low one: the test
              reads the transform.
    spray     hot gas at the roof around the atomiser; the exhaust duct leaves
              the cone and runs to a cyclone with a fines outlet (Mujumdar
              Ch. 10, van 't Land Fig. 8.2 described, Towler p. 575).
    fluid bed an overflow weir before the product outlet, a cyclone on the
              exhaust (Towler p. 574; Mujumdar section 8.7.3).
    tray      the air is recirculated past a heater, with fresh air in and a
              small exhaust out (Perry p. 12-39, 80 to 95 percent recirculated).
    belt      the gas passes THROUGH the layer and the belt, between the two
              strands, up in one zone and down in the next, then a cooling
              zone (Towler pp. 572-573; Mujumdar Ch. 17).
    drum      the drum dips into a pan of the feed, the film is carried up and
              over, a knife on the surface scrapes the flakes off, and an arrow
              shows the rotation (Mujumdar Ch. 9, dip feed).

  THE CODE IS FIXED, so a drawing can be read without a legend per picture
  (the page prints one legend): blue is the wet feed and every wet material
  (feed, wet film, wet solids on a tray), red the hot gas (or the heating
  surface), amber the dry product, grey the vapour or exhaust, teal a COLD
  surface (a condenser, the cooling air), so the condenser of a freeze dryer is
  never the colour of the feed.  A material drying along its path changes from
  blue to amber.  Equipment outlines take the page's text colour, so they
  follow the light and the dark theme.  These are SCHEMATICS, not designs:
  they carry no dimension and no proportion that means anything.
\*---------------------------------------------------------------------------*/

import type { DryerId } from "./dryerSelection.js";

export const FEED_COLOR = "#2a78d6";
export const GAS_COLOR = "#c0392b";
export const PRODUCT_COLOR = "#b8893b";
export const VAPOUR_COLOR = "#7f8c8d";
export const COLD_COLOR = "#16a085";
const INK = "var(--mantine-color-text)";

/** An arrow from (x1, y1) to (x2, y2) with a small solid head. */
function Arrow({ x1, y1, x2, y2, color, flow }: {
  x1: number; y1: number; x2: number; y2: number; color: string;
  /** Which stream the arrow belongs to; written with its displacement so a test can read
   *  the direction FROM THE GEOMETRY of the drawing, not from a label. */
  flow?: "gas" | "solid";
}): JSX.Element {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const hx = x2 - ux * 6, hy = y2 - uy * 6;
  const px = -uy * 3, py = ux * 3;
  return (
    <g data-flow={flow} data-dx={flow ? dx : undefined} data-dy={flow ? dy : undefined}>
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

/** A pipe or duct: an open polyline in one colour. */
function Duct({ d, color }: { d: string; color: string }): JSX.Element {
  return <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />;
}

/** A cyclone: a cylinder over a cone, with its inlet on the left, the gas
 *  leaving at the top and the solids at the bottom.  (x, y) is the top-left of
 *  the cylinder; w the width; h the height of the cylinder; ch the cone's. */
function Cyclone({ x, y, w, h, ch }: { x: number; y: number; w: number; h: number; ch: number }):
  JSX.Element {
  const cx = x + w / 2;
  return (
    <path d={`M${x},${y} L${x + w},${y} L${x + w},${y + h} L${cx + 3},${y + h + ch} `
      + `L${cx - 3},${y + h + ch} L${x},${y + h} Z`} {...body} />
  );
}

const body = { fill: "none", stroke: INK, strokeWidth: 1.6, strokeLinejoin: "round" as const };

/** Colour of a material at fraction f (0 = wet, 1 = dry) along its path:
 *  the feed colour first, the product colour at the end. */
const dryness = (f: number): string => (f < 0.34 ? FEED_COLOR : f < 0.67 ? "#7b7f8e" : PRODUCT_COLOR);

function Spray(): JSX.Element {
  const wet: [number, number][] = [[88, 44], [96, 48], [104, 44], [84, 56], [92, 60], [100, 56],
    [108, 60], [90, 70]];
  const dry: [number, number][] = [[80, 84], [96, 88], [108, 84], [92, 98], [100, 102], [88, 108]];
  return (
    <g data-dryer-part="spray">
      {/* roof with the gas distributor around the atomiser */}
      <rect x={62} y={14} width={60} height={10} {...body} />
      <path d="M62,24 L122,24 L122,84 L98,112 L86,112 L62,84 Z" {...body} />
      <Arrow x1={8} y1={19} x2={60} y2={19} color={GAS_COLOR} />
      <Label x={6} y={13}>hot gas</Label>
      <Arrow x1={68} y1={26} x2={68} y2={40} color={GAS_COLOR} />
      <Arrow x1={116} y1={26} x2={116} y2={40} color={GAS_COLOR} />
      {/* feed pipe, atomiser and spray */}
      <line x1={92} y1={4} x2={92} y2={28} stroke={FEED_COLOR} strokeWidth={2.4} />
      <Label x={98} y={9}>liquid feed</Label>
      <rect x={86} y={28} width={12} height={5} fill={INK} />
      <Label x={6} y={34}>atomiser</Label>
      <line x1={44} y1={31} x2={85} y2={31} stroke={INK} strokeWidth={0.8} />
      {wet.map(([x, y], i) => <circle key={`w${i}`} cx={x} cy={y} r={1.7} fill={FEED_COLOR} />)}
      {dry.map(([x, y], i) => <circle key={`d${i}`} cx={x} cy={y} r={1.9} fill={PRODUCT_COLOR} />)}
      {/* powder from the cone, exhaust duct from the cone to the cyclone */}
      <Arrow x1={92} y1={112} x2={92} y2={132} color={PRODUCT_COLOR} />
      <Label x={98} y={130}>powder</Label>
      <Duct d="M112,96 L132,96 L132,52 L142,52" color={VAPOUR_COLOR} />
      <Cyclone x={142} y={44} w={34} h={22} ch={30} />
      <Arrow x1={159} y1={44} x2={159} y2={26} color={VAPOUR_COLOR} />
      <Label x={142} y={20}>exhaust gas</Label>
      <Arrow x1={159} y1={96} x2={159} y2={112} color={PRODUCT_COLOR} />
      <Label x={165} y={110}>fines</Label>
      <Label x={159} y={126} anchor="middle">cyclone</Label>
    </g>
  );
}

/** The rotary shell is drawn level and then rotated: a POSITIVE angle turns it
 *  clockwise in SVG, which drops its right end.  The feed end (left, high) and
 *  the discharge end (right, low) follow from this one number; the test reads
 *  it back. */
export const ROTARY_TILT_DEG = 7;
export const ROTARY_SHELL = { x: 42, y: 56, w: 94, h: 30 } as const;
export const ROTARY_CENTRE = { x: 89, y: 71 } as const;
/** The lowest point of the feed chute (the hopper outlet), above the shell's high end. */
export const ROTARY_HOPPER_BOTTOM_Y = 51;
/** The top of the product arrow under the discharge hood. */
export const ROTARY_PRODUCT_TOP_Y = 112;

/** Where the shell's two end centres land after the tilt (SVG, y down). */
export function rotaryEnds(): { feedEnd: { x: number; y: number }; dischargeEnd: { x: number; y: number } } {
  const a = (ROTARY_TILT_DEG * Math.PI) / 180;
  const at = (x: number): { x: number; y: number } => {
    const dx = x - ROTARY_CENTRE.x, dy = ROTARY_SHELL.y + ROTARY_SHELL.h / 2 - ROTARY_CENTRE.y;
    return { x: ROTARY_CENTRE.x + dx * Math.cos(a) - dy * Math.sin(a),
      y: ROTARY_CENTRE.y + dx * Math.sin(a) + dy * Math.cos(a) };
  };
  return { feedEnd: at(ROTARY_SHELL.x), dischargeEnd: at(ROTARY_SHELL.x + ROTARY_SHELL.w) };
}

function Rotary(): JSX.Element {
  const flights: number[] = [62, 78, 94, 110, 126];
  const grains: [number, number][] = [[52, 66], [60, 76], [70, 64], [82, 74], [94, 68], [104, 77],
    [114, 70], [124, 76], [130, 68]];
  return (
    <g data-dryer-part="rotary">
      <g data-rotary-shell="" transform={`rotate(${ROTARY_TILT_DEG} ${ROTARY_CENTRE.x} ${ROTARY_CENTRE.y})`}>
        <rect x={ROTARY_SHELL.x} y={ROTARY_SHELL.y} width={ROTARY_SHELL.w} height={ROTARY_SHELL.h}
          rx={3} {...body} />
        {flights.map((x) => (
          <g key={x}>
            <line x1={x} y1={ROTARY_SHELL.y + 1} x2={x + 5} y2={ROTARY_SHELL.y + 10} stroke={INK}
              strokeWidth={1.2} />
            <line x1={x} y1={ROTARY_SHELL.y + ROTARY_SHELL.h - 1} x2={x + 5}
              y2={ROTARY_SHELL.y + ROTARY_SHELL.h - 10} stroke={INK} strokeWidth={1.2} />
          </g>
        ))}
        {grains.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y + 8} r={1.7}
            fill={dryness((x - ROTARY_SHELL.x) / ROTARY_SHELL.w)} />
        ))}
        {/* the gas flows with the solids: co-current, left to right */}
        <Arrow x1={48} y1={71} x2={70} y2={71} color={GAS_COLOR} />
        <Arrow x1={104} y1={71} x2={126} y2={71} color={GAS_COLOR} />
      </g>
      {/* burner and combustion chamber at the FEED end */}
      <rect x={6} y={44} width={30} height={36} {...body} />
      <path d="M12,76 Q15,64 19,70 Q21,58 25,66 Q28,60 30,76 Z" fill={GAS_COLOR} />
      <Label x={21} y={92} anchor="middle">burner</Label>
      <Duct d="M36,62 L44,62" color={GAS_COLOR} />
      {/* feed hopper over the UPPER end */}
      <polygon points={`42,24 62,24 56,${ROTARY_HOPPER_BOTTOM_Y} 50,${ROTARY_HOPPER_BOTTOM_Y}`} {...body}
        data-rotary-feed="" />
      <Arrow x1={52} y1={8} x2={52} y2={24} color={FEED_COLOR} />
      <Label x={58} y={14}>wet feed</Label>
      {/* discharge hood at the LOWER end: product down, exhaust to the cyclone */}
      <rect x={136} y={60} width={24} height={52} {...body} />
      <Arrow x1={148} y1={ROTARY_PRODUCT_TOP_Y} x2={148} y2={132} color={PRODUCT_COLOR} />
      <Label x={190} y={142} anchor="end">dry product</Label>
      <Duct d="M148,60 L148,34 L166,34" color={VAPOUR_COLOR} />
      <Cyclone x={166} y={26} w={26} h={16} ch={22} />
      <Arrow x1={179} y1={26} x2={179} y2={10} color={VAPOUR_COLOR} />
      <Label x={190} y={8} anchor="end">exhaust</Label>
      <Label x={179} y={78} anchor="middle">cyclone</Label>
      {/* rollers under the tilted shell */}
      <circle cx={62} cy={89} r={6} {...body} />
      <circle cx={112} cy={95} r={6} {...body} />
      <Label x={8} y={112}>hot gas flows</Label>
      <Label x={8} y={122}>with the solids</Label>
    </g>
  );
}

function FluidBed(): JSX.Element {
  const wet: [number, number][] = [[50, 62], [58, 54], [54, 72], [64, 66]];
  const mid: [number, number][] = [[72, 58], [82, 68], [78, 50], [90, 60]];
  const dry: [number, number][] = [[100, 56], [96, 72], [108, 66], [110, 52], [86, 76], [74, 74]];
  return (
    <g data-dryer-part="fluidBed">
      <rect x={40} y={26} width={86} height={56} {...body} />
      {/* distributor, plenum */}
      <line x1={40} y1={82} x2={116} y2={82} stroke={INK} strokeWidth={1.6} strokeDasharray="3 2" />
      <path d="M40,82 L116,82 L100,108 L56,108 Z" {...body} />
      {wet.map(([x, y], i) => <circle key={`w${i}`} cx={x} cy={y} r={2} fill={FEED_COLOR} />)}
      {mid.map(([x, y], i) => <circle key={`m${i}`} cx={x} cy={y} r={2} fill="#7b7f8e" />)}
      {dry.map(([x, y], i) => <circle key={`d${i}`} cx={x} cy={y} r={2} fill={PRODUCT_COLOR} />)}
      {[56, 78, 98].map((x) => <Arrow key={x} x1={x} y1={80} x2={x} y2={46} color={GAS_COLOR} />)}
      <Arrow x1={78} y1={140} x2={78} y2={110} color={GAS_COLOR} />
      <Label x={84} y={134}>hot gas</Label>
      <Label x={78} y={96} anchor="middle">plenum</Label>
      {/* feed in at the bed level */}
      <Arrow x1={6} y1={56} x2={40} y2={62} color={FEED_COLOR} />
      <Label x={4} y={48}>wet feed</Label>
      {/* overflow weir, and the product outlet behind it */}
      <line x1={116} y1={58} x2={116} y2={82} stroke={INK} strokeWidth={3} />
      <path d="M118,82 L118,90 M124,82 L124,90" fill="none" stroke={INK} strokeWidth={1.6} />
      <Arrow x1={121} y1={90} x2={121} y2={110} color={PRODUCT_COLOR} />
      <Label x={126} y={122} anchor="middle">dry product</Label>
      <line x1={130} y1={63} x2={117} y2={63} stroke={INK} strokeWidth={0.8} />
      <Label x={131} y={66}>weir</Label>
      {/* exhaust through a cyclone */}
      <Duct d="M84,26 L84,14 L146,14 L146,40 L152,40" color={VAPOUR_COLOR} />
      <Cyclone x={152} y={32} w={30} h={18} ch={28} />
      <Arrow x1={167} y1={32} x2={167} y2={18} color={VAPOUR_COLOR} />
      <Label x={190} y={8} anchor="end">exhaust gas</Label>
      <Arrow x1={167} y1={78} x2={167} y2={94} color={PRODUCT_COLOR} />
      <Label x={172} y={92}>fines</Label>
      <Label x={167} y={108} anchor="middle">cyclone</Label>
    </g>
  );
}

function Tray(): JSX.Element {
  const rows = [48, 64, 80, 96, 112];
  return (
    <g data-dryer-part="tray">
      {/* the insulated cabinet */}
      <rect x={40} y={12} width={116} height={116} {...body} />
      {/* five trays of wet material */}
      {rows.map((y) => (
        <rect key={y} x={80} y={y} width={44} height={5} fill={FEED_COLOR} stroke={INK}
          strokeWidth={1} />
      ))}
      {/* hot air across the trays */}
      {rows.map((y) => (
        <Arrow key={y} x1={72} y1={y - 4} x2={132} y2={y - 4} color={GAS_COLOR} />
      ))}
      {/* the heater in the left-hand plenum */}
      <path d="M46,46 L64,46 L46,58 L64,70 L46,82 L64,94 L46,106 L64,106" fill="none"
        stroke={GAS_COLOR} strokeWidth={2} />
      <Label x={55} y={120} anchor="middle">heater</Label>
      {/* the recirculation duct over the trays, with its fan */}
      <Duct d="M146,108 L146,24 L58,24 L58,40" color={VAPOUR_COLOR} />
      <Arrow x1={58} y1={30} x2={58} y2={42} color={VAPOUR_COLOR} />
      <circle cx={146} cy={68} r={7} fill="var(--mantine-color-body)" stroke={INK} strokeWidth={1.4} />
      <path d="M141,68 L151,68 M146,63 L146,73" stroke={INK} strokeWidth={1.2} />
      <Label x={146} y={86} anchor="middle">fan</Label>
      <Label x={64} y={36}>recirculated air</Label>
      {/* fresh air in, a small exhaust out */}
      <Arrow x1={4} y1={24} x2={54} y2={24} color={GAS_COLOR} />
      <Label x={4} y={18}>fresh air</Label>
      <Arrow x1={130} y1={24} x2={130} y2={1} color={VAPOUR_COLOR} />
      <Label x={136} y={8}>small exhaust</Label>
      <Label x={98} y={142} anchor="middle">wet material on trays, one batch</Label>
    </g>
  );
}

function Belt(): JSX.Element {
  const mats: number[] = [50, 60, 70, 80, 90, 100, 110, 120, 130, 140];
  return (
    <g data-dryer-part="belt">
      {/* cabinet, the two strands of the belt and its end rollers */}
      <rect x={22} y={30} width={154} height={86} {...body} />
      <circle cx={38} cy={72} r={12} {...body} />
      <circle cx={162} cy={72} r={12} {...body} />
      <line x1={38} y1={60} x2={162} y2={60} stroke={INK} strokeWidth={1.6} />
      <line x1={38} y1={84} x2={162} y2={84} stroke={INK} strokeWidth={1.6} strokeDasharray="3 2" />
      {/* the layer, wet at the feed end, dry at the discharge end */}
      {mats.map((x, i) => (
        <g key={x}>
          <circle cx={x} cy={56} r={2.6} fill={dryness(i / (mats.length - 1))} />
          <circle cx={x + 4} cy={53} r={2.2} fill={dryness(i / (mats.length - 1))} />
        </g>
      ))}
      {/* zone partitions, broken where the belt passes */}
      {[92, 128].map((x) => (
        <g key={x}>
          <line x1={x} y1={30} x2={x} y2={48} stroke={INK} strokeWidth={1} strokeDasharray="2 2" />
          <line x1={x} y1={68} x2={x} y2={116} stroke={INK} strokeWidth={1} strokeDasharray="2 2" />
        </g>
      ))}
      {/* zone 1: up through the belt and the layer; the arrows stop between the strands */}
      {[62, 78].map((x) => <Arrow key={x} x1={x} y1={78} x2={x} y2={40} color={GAS_COLOR} />)}
      {/* zone 2: down through the layer and the belt */}
      {[104, 118].map((x) => <Arrow key={x} x1={x} y1={40} x2={x} y2={78} color={GAS_COLOR} />)}
      {/* zone 3: cooling air */}
      {[136, 146].map((x) => <Arrow key={x} x1={x} y1={78} x2={x} y2={40} color={COLD_COLOR} />)}
      <Label x={70} y={108} anchor="middle">up</Label>
      <Label x={110} y={108} anchor="middle">down</Label>
      <Label x={142} y={108} anchor="middle">cooler</Label>
      {/* feed hopper, product, exhaust */}
      <polygon points="24,22 46,22 42,34 28,34" {...body} />
      <Arrow x1={35} y1={6} x2={35} y2={22} color={FEED_COLOR} />
      <Label x={41} y={12}>wet feed</Label>
      <Arrow x1={168} y1={72} x2={190} y2={108} color={PRODUCT_COLOR} />
      <Label x={198} y={128} anchor="end">dry product</Label>
      <Arrow x1={104} y1={30} x2={104} y2={12} color={VAPOUR_COLOR} />
      <Label x={110} y={16}>exhaust</Label>
      <Label x={24} y={136}>hot gas through the layer and the belt,</Label>
      <Label x={24} y={146}>up in zone 1, down in zone 2, then cooling</Label>
    </g>
  );
}

/** A point on a circle, in SVG degrees measured clockwise from +x. */
const onCircle = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

/** An arc from `from` to `to` degrees (clockwise in SVG) with an arrowhead at its end. */
function ArcArrow({ cx, cy, r, from, to, color }: {
  cx: number; cy: number; r: number; from: number; to: number; color: string;
}): JSX.Element {
  const [x1, y1] = onCircle(cx, cy, r, from);
  const [x2, y2] = onCircle(cx, cy, r, to);
  const a = (to * Math.PI) / 180;
  const tx = -Math.sin(a), ty = Math.cos(a);
  const bx = x2 - tx * 5, by = y2 - ty * 5;
  return (
    <g>
      <path d={`M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}`} fill="none" stroke={color} strokeWidth={1.4} />
      <polygon points={`${x2 + tx * 2},${y2 + ty * 2} ${bx - ty * 3},${by + tx * 3} ${bx + ty * 3},${by - tx * 3}`}
        fill={color} />
    </g>
  );
}

function Drum(): JSX.Element {
  const cx = 96, cy = 62, r = 34;
  // the drum turns clockwise (increasing SVG angle): it enters the pan at the
  // right, leaves it at the left, carries the film over the top and past the
  // knife, and meets the pan again
  const rf = r + 2.5;
  const [x0, y0] = onCircle(cx, cy, rf, 128);
  const [x1, y1] = onCircle(cx, cy, rf, 250);
  const [x2, y2] = onCircle(cx, cy, rf, 380);
  const [kx, ky] = onCircle(cx, cy, r, 20);
  return (
    <g data-dryer-part="drum">
      {/* the pan of feed, the drum dipping into it */}
      <rect x={52} y={90} width={88} height={30} fill={FEED_COLOR} opacity={0.3} />
      <path d="M52,86 L52,120 L140,120 L140,86" {...body} />
      <circle cx={cx} cy={cy} r={r} fill="var(--mantine-color-body)" stroke={INK} strokeWidth={1.6} />
      <circle cx={cx} cy={cy} r={r - 3} fill="none" stroke={GAS_COLOR} strokeWidth={2} />
      {/* the film: wet where it leaves the pan, dry by the knife */}
      <path d={`M${x0},${y0} A${rf},${rf} 0 0 1 ${x1},${y1}`} fill="none" stroke={FEED_COLOR}
        strokeWidth={3.2} />
      <path d={`M${x1},${y1} A${rf},${rf} 0 0 1 ${x2},${y2}`} fill="none" stroke={PRODUCT_COLOR}
        strokeWidth={3.2} />
      {/* rotation arrow and the steam label */}
      <ArcArrow cx={cx} cy={cy} r={19} from={205} to={335} color={INK} />
      <Label x={cx} y={cy + 4} anchor="middle">steam</Label>
      {/* the knife on the surface, the flakes falling to a trough */}
      <line x1={kx + 14} y1={ky - 6} x2={kx} y2={ky} stroke={INK} strokeWidth={2.4} />
      <Label x={kx + 16} y={ky - 8}>knife</Label>
      <rect x={146} y={100} width={30} height={10} {...body} />
      <Arrow x1={kx + 6} y1={ky + 6} x2={154} y2={98} color={PRODUCT_COLOR} />
      <Label x={146} y={124}>dry flakes</Label>
      {/* feed to the pan and the vapour hood */}
      <Arrow x1={6} y1={104} x2={52} y2={104} color={FEED_COLOR} />
      <Label x={4} y={98}>wet feed</Label>
      <path d="M52,38 L62,12 L130,12 L140,38" {...body} />
      <Arrow x1={96} y1={12} x2={96} y2={0} color={VAPOUR_COLOR} />
      <Label x={102} y={9}>vapour hood</Label>
    </g>
  );
}

function Freeze(): JSX.Element {
  const shelves = [48, 70, 92];
  return (
    <g data-dryer-part="freeze">
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
      {/* the condenser is a COLD surface, never the colour of the feed */}
      <rect x={128} y={44} width={34} height={56} rx={3} {...body} />
      <path d="M134,52 L156,58 L134,64 L156,70 L134,76 L156,82 L134,88 L156,94" fill="none"
        stroke={COLD_COLOR} strokeWidth={1.6} />
      <Label x={145} y={120} anchor="middle">ice condenser</Label>
      <line x1={162} y1={72} x2={169} y2={72} stroke={VAPOUR_COLOR} strokeWidth={2.4} />
      <circle cx={178} cy={72} r={9} {...body} />
      <Label x={181} y={92} anchor="middle">vacuum</Label>
      <Label x={181} y={102} anchor="middle">pump</Label>
    </g>
  );
}

/** Flash (pneumatic-conveying) dryer, C508.  Read from the words of van 't Land section 7.1 (a long
 *  duct carrying a gas at high velocity, a fan, a feeder that disperses the solid in the gas, a
 *  cyclone for the final recovery), Perry p. 12-67 (feed by a screw into a venturi throat,
 *  the drying column, a cyclone) and Towler p. 574 (feed dispersed into an upward-flowing stream
 *  of hot gas).  The solid is blue where the feed enters and amber at the top: it dries as it is
 *  carried.  ORIGINAL, as the others. */
function Flash(): JSX.Element {
  const col: [number, number, number][] = [[46, 98, 0], [53, 90, 0], [47, 80, 0.2], [52, 72, 0.3],
    [46, 62, 0.5], [53, 54, 0.6], [47, 44, 0.8], [52, 36, 0.9], [47, 28, 1]];
  return (
    <g data-dryer-part="flash">
      {/* the drying duct: gas and solid go UP together */}
      <rect x={40} y={22} width={18} height={86} {...body} />
      {col.map(([x, y, f]) => <circle key={y} cx={x} cy={y} r={2} fill={dryness(f)} />)}
      <Arrow x1={49} y1={142} x2={49} y2={112} color={GAS_COLOR} flow="gas" />
      <Label x={55} y={136}>hot gas</Label>
      {/* the feeder disperses the wet feed into the gas at the foot of the duct */}
      <rect x={10} y={84} width={20} height={16} {...body} />
      <path d="M13,88 L27,88 M13,92 L27,92 M13,96 L27,96" fill="none" stroke={INK} strokeWidth={1} />
      <Arrow x1={30} y1={92} x2={40} y2={92} color={FEED_COLOR} />
      <Label x={20} y={78} anchor="middle">feeder</Label>
      <Arrow x1={20} y1={66} x2={20} y2={82} color={FEED_COLOR} />
      <Label x={20} y={60} anchor="middle">wet feed</Label>
      {/* the duct bends into a cyclone: dry solid and humid gas leave together */}
      <Duct d="M49,22 L49,12 L112,12 L112,40 L118,40" color={VAPOUR_COLOR} />
      <Cyclone x={118} y={32} w={30} h={18} ch={28} />
      <Arrow x1={133} y1={32} x2={133} y2={18} color={VAPOUR_COLOR} />
      <Label x={140} y={16}>exhaust gas</Label>
      <Arrow x1={133} y1={80} x2={133} y2={100} color={PRODUCT_COLOR} />
      <Label x={133} y={112} anchor="middle">dry product</Label>
      <Label x={133} y={70} anchor="middle">cyclone</Label>
      <Label x={64} y={62}>drying</Label>
      <Label x={64} y={72}>duct</Label>
    </g>
  );
}

/** Agitated vacuum dryer, C508: a closed vessel with a heated jacket (the heated surface is the
 *  colour of hot gas, the code's "hot gas or heated surface"), a stirrer, a vapour line through a
 *  dust filter to a cold condenser (teal) and a vacuum pump.  Read from Perry p. 12-46/47 (jacket,
 *  vacuum, condenser, dust filter on the vapour line) and van 't Land Fig. 3.10.  ORIGINAL. */
function AgitatedVacuum(): JSX.Element {
  const bulk: [number, number, string][] = [[34, 76, FEED_COLOR], [46, 84, "#7b7f8e"],
    [58, 78, PRODUCT_COLOR], [70, 84, FEED_COLOR], [40, 68, PRODUCT_COLOR], [64, 66, "#7b7f8e"],
    [76, 72, PRODUCT_COLOR], [52, 92, FEED_COLOR]];
  return (
    <g data-dryer-part="agitatedVacuum">
      {/* the jacket is the heated surface */}
      <path d="M20,34 L20,86 L46,114 L64,114 L90,86 L90,34" fill="none" stroke={GAS_COLOR}
        strokeWidth={2.6} strokeLinejoin="round" />
      <path d="M26,30 L84,30 L84,84 L61,108 L49,108 L26,84 Z" {...body} />
      {bulk.map(([x, y, c], i) => <circle key={i} cx={x} cy={y} r={2} fill={c} />)}
      {/* the stirrer: a shaft with its drive, and two blades */}
      <rect x={48} y={4} width={14} height={9} {...body} />
      <line x1={55} y1={13} x2={55} y2={100} stroke={INK} strokeWidth={2} />
      <path d="M55,96 L36,72 M55,86 L76,60" fill="none" stroke={INK} strokeWidth={2} />
      <Label x={4} y={118}>jacket</Label>
      <Label x={4} y={128}>(steam or</Label>
      <Label x={4} y={138}>hot water)</Label>
      <Arrow x1={4} y1={36} x2={26} y2={40} color={FEED_COLOR} />
      <Label x={4} y={28}>charge</Label>
      <Arrow x1={55} y1={116} x2={55} y2={130} color={PRODUCT_COLOR} />
      <Label x={62} y={132}>discharge</Label>
      {/* the vapour line: dust filter, a cold condenser, the vacuum pump */}
      <Duct d="M78,30 L78,20 L108,20 L108,40" color={VAPOUR_COLOR} />
      <rect x={88} y={15} width={10} height={10} {...body} />
      <Label x={93} y={10} anchor="middle">dust filter</Label>
      <rect x={96} y={40} width={34} height={46} rx={3} {...body} />
      <path d="M102,48 L124,54 L102,60 L124,66 L102,72 L124,78" fill="none" stroke={COLD_COLOR}
        strokeWidth={1.6} />
      <Label x={136} y={46}>condenser</Label>
      <Arrow x1={113} y1={86} x2={113} y2={104} color={COLD_COLOR} />
      <Label x={113} y={116} anchor="middle">solvent</Label>
      <line x1={130} y1={62} x2={158} y2={62} stroke={VAPOUR_COLOR} strokeWidth={2.4} />
      <circle cx={168} cy={62} r={9} {...body} />
      <Label x={168} y={84} anchor="middle">vacuum</Label>
      <Label x={168} y={94} anchor="middle">pump</Label>
    </g>
  );
}

const DRAWINGS: Readonly<Record<DryerId, () => JSX.Element>> = {
  spray: Spray, rotary: Rotary, fluidBed: FluidBed, tray: Tray, belt: Belt, drum: Drum, freeze: Freeze,
  flash: Flash, agitatedVacuum: AgitatedVacuum,
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
    [FEED_COLOR, "wet feed or wet material"], [GAS_COLOR, "hot gas or heated surface"],
    [PRODUCT_COLOR, "dry product"], [VAPOUR_COLOR, "vapour or exhaust gas"],
    [COLD_COLOR, "cold surface or cooling air"],
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


/*---------------------------------------------------------------------------*\
  THE THREE ARRANGEMENTS (DEV.md 4c C465, Vitor 2026-11-21): the gas and the
  solid of a continuous convective dryer, drawn once for each way the gas can
  meet the solid.  ORIGINAL, as the seven above: a duct (rectangle), a bed of
  solid in four segments that change from the feed's blue to the product's
  amber as it dries, and arrows.  The gas colour fades from the hot red to the
  exhaust's grey WHERE THE GAS IS USED UP, so the picture says which end of
  the solid meets the hot gas.  Where the arrows point is held by the test from
  the arrows' own coordinates (data-dx), not from the captions.
\*---------------------------------------------------------------------------*/

export const ARRANGEMENT_IDS = ["cocurrent", "countercurrent", "crossflow"] as const;
export type ArrangementId = typeof ARRANGEMENT_IDS[number];

const usedUp = (f: number): string => (f < 0.34 ? GAS_COLOR : f < 0.67 ? "#a0675f" : VAPOUR_COLOR);
const DUCT = { x: 24, y: 40, w: 152, h: 70 } as const;
const BED_SEGMENTS = [0, 1, 2] as const;

function Bed({ y, h }: { y: number; h: number }): JSX.Element {
  const w = (DUCT.w - 16) / BED_SEGMENTS.length;
  return (
    <g data-bed="">
      {BED_SEGMENTS.map((k) => (
        <rect key={k} x={DUCT.x + 8 + k * w} y={y} width={w} height={h}
          fill={dryness(k / (BED_SEGMENTS.length - 1))} opacity={0.9} />
      ))}
    </g>
  );
}

/** Gas along the bed: three arrows, hot where the gas enters, grey where it leaves. */
function AlongArrows({ dir }: { dir: 1 | -1 }): JSX.Element {
  const starts = [34, 82, 130];
  return (
    <g>
      {starts.map((x0, k) => {
        const f = dir === 1 ? k / 2 : 1 - k / 2;
        const a = dir === 1 ? x0 : x0 + 38;
        const b = dir === 1 ? x0 + 38 : x0;
        return <Arrow key={x0} x1={a} y1={54} x2={b} y2={54} color={usedUp(f)} flow="gas" />;
      })}
    </g>
  );
}

function Cocurrent(): JSX.Element {
  return (
    <g data-arrangement="cocurrent">
      <rect x={DUCT.x} y={DUCT.y} width={DUCT.w} height={DUCT.h} rx={3} {...body} />
      <Bed y={72} h={12} />
      <AlongArrows dir={1} />
      <Arrow x1={2} y1={78} x2={DUCT.x + 8} y2={78} color={FEED_COLOR} flow="solid" />
      <Arrow x1={DUCT.x + DUCT.w - 8} y1={78} x2={198} y2={78} color={PRODUCT_COLOR} flow="solid" />
      <Arrow x1={2} y1={54} x2={DUCT.x + 8} y2={54} color={GAS_COLOR} flow="gas" />
      <Arrow x1={DUCT.x + DUCT.w - 8} y1={54} x2={198} y2={54} color={VAPOUR_COLOR} flow="gas" />
      <Label x={2} y={34}>hot gas in</Label>
      <Label x={198} y={34} anchor="end">humid exhaust</Label>
      <Label x={2} y={124}>wet solid in</Label>
      <Label x={198} y={124} anchor="end">dry solid out</Label>
      <Label x={100} y={140} anchor="middle">gas and solid go the same way</Label>
    </g>
  );
}

function Countercurrent(): JSX.Element {
  return (
    <g data-arrangement="countercurrent">
      <rect x={DUCT.x} y={DUCT.y} width={DUCT.w} height={DUCT.h} rx={3} {...body} />
      <Bed y={72} h={12} />
      <AlongArrows dir={-1} />
      <Arrow x1={2} y1={78} x2={DUCT.x + 8} y2={78} color={FEED_COLOR} flow="solid" />
      <Arrow x1={DUCT.x + DUCT.w - 8} y1={78} x2={198} y2={78} color={PRODUCT_COLOR} flow="solid" />
      <Arrow x1={198} y1={54} x2={DUCT.x + DUCT.w - 8} y2={54} color={GAS_COLOR} flow="gas" />
      <Arrow x1={DUCT.x + 8} y1={54} x2={2} y2={54} color={VAPOUR_COLOR} flow="gas" />
      <Label x={2} y={34}>humid exhaust</Label>
      <Label x={198} y={34} anchor="end">hot gas in</Label>
      <Label x={2} y={124}>wet solid in</Label>
      <Label x={198} y={124} anchor="end">dry solid out</Label>
      <Label x={100} y={140} anchor="middle">gas and solid go opposite ways</Label>
    </g>
  );
}

function Crossflow(): JSX.Element {
  const xs = [44, 72, 100, 128, 156];
  return (
    <g data-arrangement="crossflow">
      <rect x={DUCT.x} y={DUCT.y} width={DUCT.w} height={DUCT.h} rx={3} {...body} />
      <path d="M30,110 L170,110 L178,122 L22,122 Z" {...body} />
      <Bed y={72} h={12} />
      {xs.map((x) => (
        <g key={x}>
          <Arrow x1={x} y1={112} x2={x} y2={87} color={GAS_COLOR} flow="gas" />
          <Arrow x1={x} y1={69} x2={x} y2={44} color={VAPOUR_COLOR} flow="gas" />
        </g>
      ))}
      <Arrow x1={2} y1={78} x2={DUCT.x + 8} y2={78} color={FEED_COLOR} flow="solid" />
      <Arrow x1={DUCT.x + DUCT.w - 8} y1={78} x2={198} y2={78} color={PRODUCT_COLOR} flow="solid" />
      <Label x={100} y={34} anchor="middle">exhaust, mixed from every element</Label>
      <Label x={100} y={134} anchor="middle">fresh hot gas to every element</Label>
      <Label x={2} y={96}>wet</Label>
      <Label x={198} y={96} anchor="end">dry</Label>
      <Label x={100} y={146} anchor="middle">gas crosses the bed, solid goes along</Label>
    </g>
  );
}

const ARRANGEMENT_DRAWINGS: Readonly<Record<ArrangementId, () => JSX.Element>> = {
  cocurrent: Cocurrent, countercurrent: Countercurrent, crossflow: Crossflow,
};

export function ArrangementDrawing({ id, label }: { id: ArrangementId; label: string }): JSX.Element {
  const Draw = ARRANGEMENT_DRAWINGS[id];
  return (
    <svg viewBox="0 0 200 150" width="100%" role="img" aria-label={`Schematic of ${label} flow`}
      data-arrangement-drawing={id} style={{ display: "block", maxWidth: 300 }}>
      <Draw />
    </svg>
  );
}
