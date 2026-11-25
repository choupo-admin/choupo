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
  Helpers of chapterOrder.test.ts: the chapter menu of every EduTool is read off the rendered page (chapters.ts),
  so the order of a page's headings IS the order of its menu.  The real defect
  this gate would have caught (Vítor, 2026-11-25, `tool=dryer-selection`: "the
  navigation between the parts is confusing"): the page's parts came as a card,
  a card, a group "steps 9 to 12", then steps 1 to 8 inside a closed drawer; 26
  flat entries, "When each is used, and why" twice.

  Every live tool that the workspace mounts without props is rendered to static
  markup and its <h4>/<h5> headings are read in DOM order.  Per page:
    R1  no chapter without a title;
    R2  no two chapters with the same key (chapterSlug: two identical titles
        make a Find hit and a `&step=` link ambiguous);
    R3  the numbers of the numbered chapters ("n · title", and a part that
        begins with a number or "Part n") ascend in DOM order;
    R4  at most two parts (<h4>) come before the first numbered step.
  A page that fails today is pinned BY NAME in chapterOrderDebt.tsv with the
  rule it breaks.  The ratchet is exact: a page that fails and is not pinned
  fails, and a pinned page that no longer fails fails too, so the file can only
  shrink.  The two tools the workspace mounts with props (mccabe, psychro) and
  any tool whose static render throws are listed in UNRENDERED, and that list
  is pinned the same way.
\*---------------------------------------------------------------------------*/

import { chapterSlug } from "../src/ui/methods/chapters.js";

const decode = (s: string): string => s
  .replace(/<[^>]*>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
  .replace(/\s+/g, " ").trim();

export interface Heading { level: 4 | 5; title: string }

export function headingsOf(html: string): Heading[] {
  const out: Heading[] = [];
  const re = /<h([45])[^>]*>([\s\S]*?)<\/h\1>/g;
  for (let m = re.exec(html); m; m = re.exec(html))
    out.push({ level: m[1] === "4" ? 4 : 5, title: decode(m[2]!) });
  return out;
}

const NUM = /^(?:Part\s+)?(\d+)\s*(?:[·.:)-]|$)/i;

/** The rules R1..R4 on one page's headings; the list of rules it breaks. */
export function breaks(h: readonly Heading[]): string[] {
  const out: string[] = [];
  if (h.some((x) => !x.title)) out.push("R1");
  const seen = new Set<string>();
  let dup = false;
  for (const x of h) {
    if (!x.title) continue;
    const k = chapterSlug(x.title);
    if (seen.has(k)) dup = true;
    seen.add(k);
  }
  if (dup) out.push("R2");
  // Parts and steps are two numberings: "1 · Understand" (a part) and "1 · A solid..." (a step)
  // are both legitimate; each level ascends on its own.
  const last = { 4: 0, 5: 0 };
  let descends = false;
  for (const x of h) {
    const m = NUM.exec(x.title);
    if (!m) continue;
    const n = Number(m[1]);
    if (n <= last[x.level]) descends = true;
    last[x.level] = n;
  }
  if (descends) out.push("R3");
  let parts = 0;
  for (const x of h) {
    if (x.level === 5 && NUM.test(x.title)) break;
    if (x.level === 4) parts++;
  }
  if (parts > 2) out.push("R4");
  return out;
}

