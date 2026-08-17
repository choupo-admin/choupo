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
  exposure.mjs -- the arm that stops the occlusion check from being VACUOUS.

  THE PROBLEM IT EXISTS FOR, stated by the harness itself.  checkGui's proof
  that it can see the defect it was built for is a sabotage: put `position:
  absolute; inset: 0` back on a tool's root and watch the harness find a
  covered control.  When that defect first shipped it covered the whole left
  tool rail.  The rail has since moved into the top bar, ABOVE the workspace's
  positioned container -- out of the blast radius -- and the same sabotage now
  covers exactly ONE control, the Theory-Guide link in the shared caption
  strip.  The proof still passes, and it passes by GEOMETRIC LUCK: the day
  that link moves too, the sabotage covers NOTHING, the harness reports twelve
  clean pages, and a genuinely broken layout ships under a green run.

  Nothing in the DOM announces that.  It is a silent loss of a gate's power,
  which is the exact failure this project retired a gate for once already
  (check_true_ions: PASS on every run while both its inputs had been deleted).

  WHAT THIS MODULE ASSERTS.  For each page: how many interactive controls
  would a rogue `inset: 0` tool root actually cover?  That number is the
  sabotage's REACH.  A reach of zero means the sabotage proves nothing on that
  page, and the harness must REFUSE rather than pass.

  IT MEASURES, IT DOES NOT REASON.  A count of "controls that look like they
  are in the region" is a model of the browser's paint order, and a model can
  be wrong in exactly the direction that flatters the gate.  So this probe
  PERFORMS the defect: it puts the offending CSS on the live element, asks
  `elementFromPoint` who would now receive each click, counts what changed,
  and restores the element.  The number reported is an observation of Blink,
  not an inference about it.  (Measuring rather than counting was not
  academic: the static count over-estimated the reach by more than 2x on the
  two setup-bar tools -- 25 "in the region" against 11 actually covered.)

  THE TARGET IS THE CONTAINER'S LAST ELEMENT CHILD, and that is a choice with
  a consequence.  An `inset: 0` on an EARLIER sibling is painted over by the
  later ones and covers nothing at all -- measured: 0 on six of the twelve
  pages.  The element that does damage is the one that paints last, which is
  where the tool's own content is mounted, which is where the real defect was.
  So the last child is the faithful target and the earlier siblings are a
  stated blind spot, not an oversight.

  WHAT IT CANNOT SEE.  It probes ONE candidate element per page, in the page's
  default state.  A tool that goes `inset: 0` only after a control is clicked,
  or a workspace other than EduTools, is outside it -- as is any covering that
  a stacking context, not geometry, would decide differently for some third
  element.
\*---------------------------------------------------------------------------*/

import { INTERACTIVE_SELECTOR } from "./occlusion.mjs";

/** THE ONE HOME for "which element is the workspace's positioned container".
 *
 *  A JS expression, injected into both this arm and the readiness poll, that
 *  evaluates to the containing block an `inset: 0` tool root anchors to: the
 *  absolutely-positioned, all-sides-zero box holding the most interactive
 *  controls.  Found by its computed SHAPE, never by a class name -- Mantine's
 *  emotion hashes change on any restyle and a harness pinned to one would rot
 *  without saying so.
 *
 *  Two readers, one rule.  Writing it twice would let the readiness poll and
 *  the exposure arm disagree about whether the workspace is even there, which
 *  is exactly the disagreement that lets a half-mounted page be measured. */
export const FIND_WORKSPACE_CONTAINER = `((SEL) => {
  let best = null, held = -1;
  for (const el of document.querySelectorAll("div")) {
    const cs = getComputedStyle(el);
    if (cs.position !== "absolute") continue;
    if (cs.top !== "0px" || cs.right !== "0px"
        || cs.bottom !== "0px" || cs.left !== "0px") continue;
    const n = el.querySelectorAll(SEL).length;
    if (n > held) { held = n; best = el; }
  }
  return best;
})(${JSON.stringify(INTERACTIVE_SELECTOR)})`;

/** Build the probe source.  `hideExposed` is the SELF-TEST: it hides, at run
 *  time, exactly the controls the sabotage lives on, so the refusal can be
 *  proved to fire without editing a line of GUI source. */
export function exposureProbe({ hideExposed = false } = {}) {
  return `(() => {
  const SEL = ${JSON.stringify(INTERACTIVE_SELECTOR)};
  const HIDE_EXPOSED = ${hideExposed ? "true" : "false"};

  const visibleCentre = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none"
        || parseFloat(cs.opacity || "1") === 0) return null;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) return null;
    return { cx, cy };
  };
  const reaches = (el, cx, cy) => {
    const hit = document.elementFromPoint(cx, cy);
    return hit === el || (hit !== null && el.contains(hit));
  };
  const describe = (el) => {
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase()
           + (el.id ? "#" + el.id : "")
           + (el.getAttribute("role") ? "[role=" + el.getAttribute("role") + "]" : ""),
      text: (el.textContent || el.getAttribute("aria-label") || "").trim()
              .replace(/\\s+/g, " ").slice(0, 50),
      box: { x: Math.round(r.x), y: Math.round(r.y),
             w: Math.round(r.width), h: Math.round(r.height) },
    };
  };

  // -- 1. the workspace's positioned container (ONE home: see above) --------
  const container = ${FIND_WORKSPACE_CONTAINER};
  if (!container) {
    return { found: false, why: "no absolutely-positioned inset:0 container in the page" };
  }
  const target = container.lastElementChild;
  if (!target) {
    return { found: false, why: "the workspace container has no element child to sabotage" };
  }

  // -- 2. who is reachable right now ----------------------------------------
  const before = [];
  for (const el of document.querySelectorAll(SEL)) {
    const c = visibleCentre(el);
    if (!c) continue;
    if (reaches(el, c.cx, c.cy)) before.push(el);
  }

  // -- 3. the SELF-TEST, if asked: empty the region out ----------------------
  // Hide every reachable control that sits inside the container but outside
  // the tool mount -- i.e. precisely the population the sabotage feeds on.
  // This is what "the Theory link moved to the top bar" would look like.
  const hidden = [];
  if (HIDE_EXPOSED) {
    for (const el of before) {
      if (!container.contains(el) || target.contains(el)) continue;
      hidden.push([el, el.style.display]);
      el.style.display = "none";
    }
  }

  // -- 4. PERFORM the defect and read the damage ----------------------------
  const savedStyle = target.getAttribute("style");
  const covered = [];
  try {
    target.style.position = "absolute";
    target.style.top = "0";
    target.style.right = "0";
    target.style.bottom = "0";
    target.style.left = "0";
    for (const el of before) {
      const c = visibleCentre(el);
      if (!c) continue;                       // moved out of view: not evidence
      if (reaches(el, c.cx, c.cy)) continue;
      covered.push(describe(el));
    }
  } finally {
    if (savedStyle === null) target.removeAttribute("style");
    else target.setAttribute("style", savedStyle);
    for (const [el, display] of hidden) el.style.display = display;
  }

  return {
    found: true,
    container: describe(container),
    target: describe(target),
    reachableBefore: before.length,
    reach: covered.length,
    covered: covered.slice(0, 12),
    selfTest: HIDE_EXPOSED,
    hiddenForSelfTest: hidden.length,
  };
})()`;
}

/** The floor, and WHY this number.
 *
 *  MEASURED on 2026-08-17 over all twelve live EduTools at 1400x900, by the
 *  probe above (the sabotage performed, not estimated):
 *
 *      mccabe 11 · psychro 11 · kremser 1 · pinch-composite 1 · entu 1 ·
 *      pump-system 1 · merkel 1 · rayleigh 1 · levenspiel 1 · vanheerden 1 ·
 *      drying 1 · breakthrough 1        (total 32, min 1, max 11)
 *
 *  So the floor is 1, and it is 1 because the measurement says so, not
 *  because 1 is a comfortable number:
 *
 *    * BELOW it the arm is vacuous.  Reach 0 means the defect this whole
 *      harness exists for can be present on that page and produce no finding.
 *      A gate that cannot fail must not pass -- so 0 REFUSES (exit 2), it
 *      does not warn.
 *    * ABOVE it the arm would refuse a healthy tree TODAY.  Ten of the twelve
 *      pages sit at exactly 1.  Asking for 2 would turn this green tree red
 *      on the day it was written, which is how a gate gets disabled instead
 *      of obeyed.
 *
 *  The floor is therefore TIGHT: there is no margin at all on ten pages, and
 *  the ten of them rest on the SAME single element (the shared caption
 *  strip's Theory-Guide link).  That is not comfortable and it is not meant
 *  to be -- the harness prints it as FRAGILE on every run so the thinness is
 *  read, not assumed.  What has changed is that it can no longer go to zero
 *  QUIETLY.
 *
 *  Deliberately NOT gated: the corpus total (32).  A floor there would pin a
 *  number that no page's proof depends on -- twenty-two of the thirty-two come
 *  from two pages -- so it would fire on an unrelated restyle of the McCabe
 *  setup bar while a page silently going vacuous slipped under it.  The
 *  per-page floor is the one that means anything. */
export const MIN_SABOTAGE_REACH = 1;
