/*---------------------------------------------------------------------------*\
  Choupo GUI -- open the PFD sheets of the current run (S2).  The DOM half:
  the layout is case/pfdSheet.ts + case/pfdViews.ts (pure); this reads the
  store, builds the sheets and opens the printable page in a new tab.
  Copyright (C) 2026 Vítor Geraldes
  SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

import type { RunResult } from "../adapters/SolverAdapter.js";
import { engineVersionSnapshot } from "../case/engineVersion.js";
import { pfdHtml, sheetSvg, type PageSizeName, type PfdMeta, type PfdSheet } from "../case/pfdSheet.js";
import { buildPfd } from "../case/pfdViews.js";
import { rootCaseAndPath } from "../cases/tutorials.js";
import { downloadTextFile } from "../case/saveCase.js";
import { useStore } from "../state/store.js";

export interface PfdSet { sheets: PfdSheet[]; meta: PfdMeta }

/** The sheets and title-block facts of the open run; null when the open case
 *  has no flowsheet. */
export function pfdSetOfRun(result: RunResult, forced?: PageSizeName): PfdSet | null {
  const st = useStore.getState();
  const rp = rootCaseAndPath(st.tutorialName);
  const root = rp?.rootFiles.flowsheet ?? st.caseFiles.flowsheet;
  const raw = rp?.rootFiles.rawFiles ?? st.caseFiles.rawFiles ?? {};
  if (!root) return null;
  const eng = result.engine ?? engineVersionSnapshot() ?? undefined;
  const meta: PfdMeta = {
    caseName: (st.tutorialName || "case").split("/").filter(Boolean).pop() ?? "case",
    date: new Date().toISOString().slice(0, 10),
    ...(eng ? { engine: eng } : {}),
  };
  return { sheets: buildPfd(root, raw, result, forced), meta };
}

export function openPfdTab(set: PfdSet): void {
  const url = URL.createObjectURL(new Blob([pfdHtml(set.sheets, set.meta)], { type: "text/html" }));
  const a = document.createElement("a");
  a.href = url; a.target = "_blank"; a.rel = "noopener";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function downloadPfdSvgs(set: PfdSet): void {
  for (const s of set.sheets)
    downloadTextFile(`<?xml version="1.0" encoding="UTF-8"?>\n${sheetSvg(s, set.meta)}\n`,
      `${set.meta.caseName}_pfd_sheet${s.n}of${s.N}.svg`, "image/svg+xml");
}
