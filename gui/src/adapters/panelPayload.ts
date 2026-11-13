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
  THE OPERATOR PANEL as the engine reported it (DEV.md 4c C371, slice S1):
  the result JSON's top-level `"panel"` block, written by choupoBatch after
  the time loop when the case declares `system/panelDict`
  (src/postProcessing/panel/PanelPass.cpp; record
  docs/design/operator-panel-in-the-case.md, section 5).

  The block has four lists -- `elements`, `facts`, `messages`, `summary` --
  each record carrying an `"id"` and its strings under `"text"`.  This file
  holds their TYPES and the one function that polices them.

  NOTHING IS COMPUTED HERE.  No fact is derived, no interval is found, no
  limit is compared with a value: a record whose id is not a string is
  dropped, a number that is not finite is left out (never defaulted to
  zero, because a zero would read as a value the engine published), and
  every fact the engine wrote is carried whatever its kind -- including kinds
  this file does not name, so a fact added to the engine is not lost on the
  way to the page.
\*---------------------------------------------------------------------------*/

/** One element of the panel, as the engine read it and measured it. */
export interface PanelElementReport {
  /** `element:<name>` */
  id: string;
  name: string;
  kind: string;
  /** The published column the element resolves to (`rig.U_V`). */
  column: string;
  referenceColumn?: string;
  /** 1 when the column is published, 0 when it is not (fact `notPublished`). */
  published: boolean;
  rangeMin?: number; rangeMax?: number;
  limitLow?: number; limitHigh?: number;
  alarmOn?: string; alarmDelay?: number;
  min?: number; max?: number; first?: number; last?: number;
  n?: number;
  violated?: number;
  closestApproach?: number;
  closestApproachFraction?: number;
  /** The instants the element's alarm is active, [t0, t1] on the write grid,
   *  as the engine resolved them (the delay applied).  Absent when the element
   *  declares no alarm. */
  intervals?: [number, number][];
  authored?: string;
  place?: { column: number; row: number; width: number; height: number };
  text: { [k: string]: string };
}

/** One fact: `<kind>:<element>` or a panel-wide id such as `alarmsActive`. */
export interface PanelFactReport {
  id: string;
  /** The part before the colon (`violated`, `constant`, `alarmsActive`). */
  kind: string;
  /** The element the fact is about, "" for a panel-wide fact. */
  element: string;
  numbers: { [k: string]: number };
  explanation: string;
}

export interface PanelMessageReport {
  id: string;
  name: string;
  fired: boolean;
  t?: number;
  on: string;
  from?: string;
  text: string;
}

export interface PanelSummaryReport {
  elements?: number; facts?: number; messages?: number;
  alarms?: number; alarmsMax?: number; alarmsMaxAt?: number;
  instants?: number; locked: boolean;
  /** The grid the elements are placed on (`grid { columns; rows; }`). */
  gridColumns?: number; gridRows?: number;
}

export interface PanelReport {
  elements: PanelElementReport[];
  facts: PanelFactReport[];
  messages: PanelMessageReport[];
  summary: PanelSummaryReport | null;
}

type Rec = { [k: string]: unknown };

const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const list = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter(isRec) : []);
const strings = (v: unknown): { [k: string]: string } => {
  const out: { [k: string]: string } = {};
  if (isRec(v)) for (const [k, s] of Object.entries(v)) if (typeof s === "string") out[k] = s;
  return out;
};
const num = (r: Rec, k: string): number | undefined => (fin(r[k]) ? r[k] as number : undefined);
const str = (r: Rec, k: string): string | undefined => (typeof r[k] === "string" ? r[k] as string : undefined);

/** Police the TYPES of the engine's `panel` block; null when it is absent or
 *  carries no element.  Nothing is computed. */
export function shapePanel(raw: unknown): PanelReport | null {
  if (!isRec(raw)) return null;
  const elements: PanelElementReport[] = [];
  for (const r of list(raw["elements"])) {
    const id = str(r, "id");
    if (!id || !id.startsWith("element:")) continue;
    const e: PanelElementReport = {
      id, name: id.slice("element:".length),
      kind: str(r, "kind") ?? "",
      column: str(r, "column") ?? "",
      published: r["published"] === 1 || r["published"] === true,
      text: strings(r["text"]),
    };
    const copy = ["rangeMin", "rangeMax", "limitLow", "limitHigh", "alarmDelay", "min", "max",
      "first", "last", "n", "violated", "closestApproach", "closestApproachFraction"] as const;
    for (const k of copy) { const v = num(r, k); if (v !== undefined) e[k] = v; }
    const ref = str(r, "referenceColumn"); if (ref) e.referenceColumn = ref;
    const on = str(r, "alarmOn"); if (on) e.alarmOn = on;
    const au = str(r, "authored"); if (au) e.authored = au;
    if (Array.isArray(r["intervals"])) {
      e.intervals = (r["intervals"] as unknown[])
        .filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && fin(p[0]) && fin(p[1]))
        .map((p) => [p[0], p[1]]);
    }
    const pc = num(r, "placeColumn"), pr = num(r, "placeRow"), pw = num(r, "placeWidth"), ph = num(r, "placeHeight");
    if (pc !== undefined && pr !== undefined && pw !== undefined && ph !== undefined)
      e.place = { column: pc, row: pr, width: pw, height: ph };
    elements.push(e);
  }
  const facts: PanelFactReport[] = [];
  for (const r of list(raw["facts"])) {
    const id = str(r, "id");
    if (!id) continue;
    const colon = id.indexOf(":");
    const numbers: { [k: string]: number } = {};
    for (const [k, v] of Object.entries(r)) if (fin(v)) numbers[k] = v;
    facts.push({
      id, kind: colon < 0 ? id : id.slice(0, colon), element: colon < 0 ? "" : id.slice(colon + 1),
      numbers, explanation: strings(r["text"])["explanation"] ?? "",
    });
  }
  const messages: PanelMessageReport[] = [];
  for (const r of list(raw["messages"])) {
    const id = str(r, "id");
    if (!id || !id.startsWith("message:")) continue;
    const m: PanelMessageReport = {
      id, name: id.slice("message:".length),
      fired: r["fired"] === 1 || r["fired"] === true,
      on: str(r, "on") ?? "", text: strings(r["text"])["text"] ?? "",
    };
    const t = num(r, "t"); if (t !== undefined) m.t = t;
    const from = str(r, "from"); if (from) m.from = from;
    messages.push(m);
  }
  const s = list(raw["summary"])[0];
  const summary: PanelSummaryReport | null = s
    ? {
      locked: s["locked"] === 1 || s["locked"] === true,
      ...Object.fromEntries((["elements", "facts", "messages", "alarms", "alarmsMax", "alarmsMaxAt", "instants", "gridColumns", "gridRows"] as const)
        .flatMap((k) => (fin(s[k]) ? [[k, s[k] as number]] : []))),
    }
    : null;
  if (elements.length === 0) return null;
  return { elements, facts, messages, summary };
}
