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
  workflowSteps -- THE WORKFLOW'S OUTLINE: A CASE'S STUDIES AND THEIR
  NUMBERED STEPS (DEV.md 4c C172 slice 3; docs/design/one-app-two-homes.md
  item 3).

  A properties case is a SEQUENCE: choupoProps runs `operations ( ... )` in
  declared order, and the engine refuses an operation that reads what a later
  one writes (src/propertyOps/PropsPlan.{H,cpp}).  This module turns that
  order into the outline a reader navigates by -- never a canvas, never an
  editor:

    STUDIES  the case's declared `studies` (case/propsStudies.ts), in their
             order, lettered A, B, C... by POSITION.  A case that declares
             none has ONE implicit study, the workflow itself, and its steps
             are numbered 1, 2, 3.  Operations no declared study claims follow
             in a last group of their own, lettered after the others.
    STEPS    a study's operations in DECLARED order (the run's order, not the
             study's list order), numbered within the study: B.1, B.2.  A SET
             OF RUNS is ONE step: consecutive operations of one type that a
             declared view draws TOGETHER as one series (`ops ( ... )` in a
             view of the propsDict) -- the five feed points of one dye, the
             six node counts of a grid study.  Nothing is guessed from names:
             the grouping is the case's own declaration, read where the case
             makes it.

  A step's id is the id of its FIRST operation (`op:<name>`), so a step and
  the calculation map, the verdict rows and every older link that names an
  operation select the same thing.  Pure (no React).
\*---------------------------------------------------------------------------*/

import type { JsonDict, JsonValue } from "../dict/index.js";
import { declaredStudies, type Study } from "./propsStudies.js";

export interface WorkflowStep {
  /** `op:<first op>` -- the map's member id of its first run */
  id: string;
  /** "B.2", or "2" in a case with no declared study */
  number: string;
  /** the operations it runs, in declared order (one, or a set of runs) */
  ops: string[];
  /** their type (one type per step by construction) */
  type: string;
  /** the declared position of its first operation in `operations ( ... )` */
  position: number;
}

export interface WorkflowStudy {
  /** `study:<name>`; `study:` for a case's one implicit study; `study:-`
   *  for the operations no declared study claims */
  id: string;
  /** the declared name ("" implicit, "-" unclaimed) */
  name: string;
  /** "A", "B" ... by position; "" for the one implicit study */
  letter: string;
  title: string;
  /** the declared purpose word, "" none (case/propsStudies.ts says it) */
  purpose: string;
  summary: string;
  declared: boolean;
  steps: WorkflowStep[];
}

const isDict = (v: unknown): v is JsonDict => !!v && typeof v === "object" && !Array.isArray(v);

interface DeclaredOp { name: string; type: string; position: number }

function declaredOps(propsDict: JsonDict | null | undefined): DeclaredOp[] {
  const list = propsDict?.["operations"];
  if (!Array.isArray(list)) return [];
  const out: DeclaredOp[] = [];
  list.forEach((o, i) => {
    if (!isDict(o) || typeof o["name"] !== "string" || !o["name"]) return;
    out.push({ name: o["name"], type: typeof o["type"] === "string" ? o["type"] : "", position: i });
  });
  return out;
}

/** Every `ops ( ... )` list of two or more operations a declared view draws
 *  as one series: the case's own statement that those runs belong together. */
export function declaredRunSets(propsDict: JsonDict | null | undefined): string[][] {
  const out: string[][] = [];
  const walk = (v: JsonValue) => {
    if (Array.isArray(v)) { for (const x of v) walk(x); return; }
    if (!isDict(v)) return;
    for (const [k, x] of Object.entries(v)) {
      if (k === "ops" && Array.isArray(x)) {
        const names = x.filter((s): s is string => typeof s === "string");
        if (names.length >= 2) out.push(names);
      } else walk(x);
    }
  };
  walk((propsDict?.["views"] ?? null) as JsonValue);
  return out;
}

/** The steps of a list of operations (already in declared order): a run of
 *  consecutive operations of one type that one declared run set holds is ONE
 *  step; everything else is a step of its own. */
function stepsOf(ops: DeclaredOp[], runSets: string[][], prefix: string): WorkflowStep[] {
  const together = (a: string, b: string) => runSets.some((s) => s.includes(a) && s.includes(b));
  const steps: WorkflowStep[] = [];
  let lastPosition = -2;
  for (const op of ops) {
    const last = steps[steps.length - 1];
    if (last && last.type === op.type && lastPosition === op.position - 1 && together(last.ops[0]!, op.name))
      last.ops.push(op.name);
    else
      steps.push({ id: `op:${op.name}`, number: "", ops: [op.name], type: op.type, position: op.position });
    lastPosition = op.position;
  }
  steps.forEach((s, i) => { s.number = prefix ? `${prefix}.${i + 1}` : String(i + 1); });
  return steps;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const letterAt = (i: number) => (i < LETTERS.length ? LETTERS[i]! : String(i + 1));

/** The Workflow's outline: the declared studies (or the one implicit study)
 *  and their numbered steps, in the case's order. */
export function workflowOutline(propsDict: JsonDict | null | undefined): WorkflowStudy[] {
  const ops = declaredOps(propsDict);
  const runSets = declaredRunSets(propsDict);
  const studies: Study[] = declaredStudies(propsDict);
  if (studies.length === 0) {
    if (ops.length === 0) return [];
    return [{ id: "study:", name: "", letter: "", title: "Workflow", purpose: "", summary: "",
      declared: false, steps: stepsOf(ops, runSets, "") }];
  }
  const claimed = new Set<string>();
  const out: WorkflowStudy[] = studies.map((st, i) => {
    const mine = ops.filter((o) => st.ops.includes(o.name) && !claimed.has(o.name));
    for (const o of mine) claimed.add(o.name);
    const letter = letterAt(i);
    return { id: `study:${st.name}`, name: st.name, letter, title: st.title, purpose: st.purpose,
      summary: st.summary, declared: true, steps: stepsOf(mine, runSets, letter) };
  });
  const loose = ops.filter((o) => !claimed.has(o.name));
  if (loose.length > 0) {
    const letter = letterAt(out.length);
    out.push({ id: "study:-", name: "-", letter, title: "Steps in no declared study", purpose: "",
      summary: "", declared: false, steps: stepsOf(loose, runSets, letter) });
  }
  return out;
}

/** The step that runs an operation, and its study. */
export function stepOfOp(outline: readonly WorkflowStudy[], op: string):
  { study: WorkflowStudy; step: WorkflowStep } | null {
  for (const study of outline)
    for (const step of study.steps)
      if (step.ops.includes(op)) return { study, step };
  return null;
}

/** The step a selection id names: a step's own id, or any operation of it. */
export function stepOfId(outline: readonly WorkflowStudy[], id: string):
  { study: WorkflowStudy; step: WorkflowStep } | null {
  return id.startsWith("op:") ? stepOfOp(outline, id.slice(3)) : null;
}

/** The step's label in the outline: its one operation's name, or the set's
 *  first and last runs. */
export function stepLabel(step: WorkflowStep): string {
  if (step.ops.length === 1) return step.ops[0]!;
  return `${step.ops[0]} … ${step.ops[step.ops.length - 1]}`;
}
