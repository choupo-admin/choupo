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
  occlusion.mjs -- the ONE check, as a string evaluated inside the page.

  THE DEFECT IT EXISTS FOR.  Four EduTools carried `position: absolute;
  inset: 0` on their root.  That anchors to the workspace container, not to
  the tool's own box, so each tool's panel spread over the whole workspace and
  covered the left tool rail.  Every rail button was still in the DOM, still
  `visible`, still had a sensible bounding box -- and was unclickable.  2400
  node tests could not see it because jsdom has no layout: every box is 0x0
  and `elementFromPoint` answers nothing.  Only a real engine with a real
  viewport can be asked "who would receive this click?".

  THE QUESTION, precisely.  For each visible interactive control, take the
  centre of its border box and ask `document.elementFromPoint`.  The answer is
  the topmost painted, hit-testable element at that point -- the thing the
  browser would dispatch the click to.  If that is the control, or something
  INSIDE it (the <span> in a <button>), the control is reachable.  Anything
  else and the click lands elsewhere: the control is COVERED.

  WHAT THIS CANNOT SEE, stated so nobody reads more into a PASS:
    * a control covered everywhere EXCEPT its exact centre (a partial overlap
      that still leaves the midpoint free) -- reachable by this test, awkward
      in life;
    * a control inside a shadow root or an iframe (elementFromPoint stops at
      the host / document boundary);
    * a control that is reachable but WRONG -- misaligned, unreadable, off by
      a hundred pixels but on top;
    * anything about whether the thing under the cursor is CORRECT: this is a
      hit-test, not a judgement about a chart.
\*---------------------------------------------------------------------------*/

/** The interactive surface.  Anything a user can click or focus. */
export const INTERACTIVE_SELECTOR =
  'button, [role="button"], [role="tab"], [role="menuitem"], [role="link"], '
  + 'a[href], input, select, textarea, [tabindex]';

/** The probe, as source.  Returns a plain object (returnByValue-friendly). */
export const OCCLUSION_PROBE = `(() => {
  const SEL = ${JSON.stringify(INTERACTIVE_SELECTOR)};
  const nodes = Array.from(document.querySelectorAll(SEL));

  const describe = (el) => {
    if (!el) return { tag: "(nothing)", text: "", cls: "", box: null };
    const r = el.getBoundingClientRect();
    const cls = typeof el.className === "string" ? el.className
              : (el.getAttribute && el.getAttribute("class")) || "";
    return {
      tag: el.tagName.toLowerCase()
           + (el.id ? "#" + el.id : "")
           + (el.getAttribute && el.getAttribute("role") ? "[role=" + el.getAttribute("role") + "]" : ""),
      text: (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 60),
      cls: String(cls).trim().replace(/\\s+/g, " ").slice(0, 100),
      box: { x: Math.round(r.left), y: Math.round(r.top),
             w: Math.round(r.width), h: Math.round(r.height) },
    };
  };

  /** The scrollable ancestor whose own box the point (cx, cy) falls outside,
   *  or null.  Walks up because the fold that hides a control may belong to a
   *  container several levels above it (Mantine's ScrollArea puts the scroll
   *  on a viewport child of the root, so the first hit here is usually that
   *  viewport rather than anything the caller would name).
   *
   *  "hidden"/"clip" count as well as "auto"/"scroll": what matters is that
   *  the box has more content than it shows, so the point asked about is not
   *  where this control is painted. */
  const scrolledPastFold = (el, cx, cy) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      const holds = (o) => o === "auto" || o === "scroll" || o === "hidden" || o === "clip";
      const moreY = holds(cs.overflowY) && p.scrollHeight > p.clientHeight + 1;
      const moreX = holds(cs.overflowX) && p.scrollWidth > p.clientWidth + 1;
      if (!moreY && !moreX) continue;
      const pr = p.getBoundingClientRect();
      if ((moreY && (cy < pr.top || cy > pr.bottom))
       || (moreX && (cx < pr.left || cx > pr.right))) return p;
    }
    return null;
  };

  const covered = [];
  let checked = 0, skippedInvisible = 0, skippedOffscreen = 0;

  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) { skippedInvisible++; continue; }
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none"
        || parseFloat(cs.opacity || "1") === 0) { skippedInvisible++; continue; }

    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx >= window.innerWidth || cy >= window.innerHeight) {
      // Off-viewport or inside a scrolled container: elementFromPoint is not
      // defined there, so this is NOT evidence either way.  Counted, never
      // silently dropped.
      skippedOffscreen++; continue;
    }
    // THE SAME NON-EVIDENCE, ONE CONTAINER IN (added 2026-09-03, after this
    // arm reported two of them as COVERED).  A row scrolled just past the
    // fold of its OWN scrollable box still has its centre inside the WINDOW,
    // so the guard above lets it through -- and elementFromPoint then
    // answers with whatever is painted in that region, which is the next
    // panel down.  Reported as "covered by the SET chips", it was a compound
    // family header sitting two pixels below its tree's fold: scrolling the
    // tree brings it into view and it clicks.  A hit test asked outside the
    // asker's own visible box is not evidence, exactly as above; it belongs
    // in the same pile, which THE SKIPPED PILE below resolves by scrolling
    // and re-asking rather than by assuming.
    if (scrolledPastFold(el, cx, cy)) { skippedOffscreen++; continue; }

    checked++;
    const hit = document.elementFromPoint(cx, cy);
    if (hit === el) continue;
    if (hit && el.contains(hit)) continue;          // its own label / icon
    // An ANCESTOR at the centre means the control itself is not hit-testable
    // there (pointer-events, or a zero-area child stack).  Reported, but
    // classified apart from a genuine overlay: they have different remedies.
    const relation = hit && hit.contains(el) ? "ancestor" : "overlay";
    covered.push({ relation, control: describe(el), blocker: describe(hit) });
  }

  return {
    url: location.href,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    total: nodes.length,
    checked, skippedInvisible, skippedOffscreen,
    covered,
  };
})()`;

/*---------------------------------------------------------------------------*\
  THE SKIPPED PILE, RESOLVED -- and two false findings paid for on the way.

  The probe above counts an off-viewport control and moves on, correctly: a
  centre outside the viewport is where `elementFromPoint` is not defined, so
  it is not evidence either way.  At 1400x900 that pile is small.  At 390x844
  it is not: 81 controls, and on one page 29 of 40.  Leaving that many in a
  bucket labelled "no evidence" and then printing "clean" would be the harness
  making its own coverage collapse look like a result.

  So each one is ASKED.  Scroll it into view, then put the same question:
  would a click at its centre reach it?

  TWO CORRECTIONS, both found by checking a finding instead of believing it,
  and both had produced a confident, specific, WRONG report first:

  (1) A CONTROL BEHIND AN `overflow: hidden` EDGE MUST NOT BE SCROLLED TO AND
      THEN REPORTED.  The first version called `button "Copy propsDict"` a
      covered control on mccabe and psychro at BOTH viewports, named its
      blocker and exited 1.  At rest that button sits at y=920 in a 900-high
      viewport, inside a COLLAPSED disclosure clipped away by an ancestor's
      `overflow: hidden`.  It is not covered; it is folded.  `scrollIntoView`
      scrolls an `overflow: hidden` box quite happily -- a USER cannot -- so
      the probe had manufactured the very state it then reported.  A control
      is now only asked the scroll question when every clipping ancestor
      between it and the viewport is one a user can actually scroll (`auto`
      or `scroll`); anything behind a `hidden`/`clip` edge is classified
      `clippedByOverflow`.
      THAT IS NOT A LICENCE TO CALL THEM DELIBERATE, and the phone proved it.
      Measured at 390x844: the app's ROOT box is 390 wide, `overflow: hidden`,
      with 480 px of content in it -- so the top bar's last controls (the
      colour-scheme button, the clipboard bridge, and the Theory-Guide link
      the whole exposure arm rests on) are clipped off the right with no way
      to reach them.  A folded panel and a layout wider than the screen are
      the same shape in the DOM.  So both are LISTED, with the axis and the
      clipper, and NEITHER is judged: intent is not something a hit-test can
      read.

  (2) AN "AT REST" BOX MEASURED AFTER SCROLLING SOMETHING ELSE IS NOT AT REST.
      The first version walked the pile scrolling to each in turn without
      putting anything back.  The top bar's rightmost control is off the right
      edge on a phone; scrolling to it moved a shared scroller 90 px, and
      every box read afterwards came out 90 px to the left.  That is where the
      report's `at rest (-78, 122)` boxes came from -- an artefact of the
      previous measurement, reported as a property of the page.  Now EVERY
      at-rest box is captured BEFORE anything is scrolled, and every scrollable
      ancestor's scrollLeft/scrollTop is saved and restored around each test,
      so the elements are asked in any order and answer the same.

  Three verdicts remain, and they are different findings:
    * reachableAfterScroll -- off-screen at rest, fine once scrolled to.  Not
      a defect by this harness's ONE check, but reported: a control whose
      centre is outside the viewport when the page settles is worth a look.
    * coveredAfterScroll   -- brought into view and STILL not reachable at its
      centre.  A real covered control the at-rest pass could not report.
    * unreachableByScroll  -- cannot be brought into the viewport at all.

  IT MUTATES THE PAGE (it scrolls it), so it runs LAST on a page, after every
  at-rest measurement is already taken.
\*---------------------------------------------------------------------------*/
export const OFFSCREEN_PROBE = `(() => {
  const SEL = ${JSON.stringify(INTERACTIVE_SELECTOR)};

  const describe = (el) => {
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase()
           + (el.id ? "#" + el.id : "")
           + (el.getAttribute("role") ? "[role=" + el.getAttribute("role") + "]" : ""),
      text: (el.textContent || el.getAttribute("aria-label")
             || el.getAttribute("placeholder") || "").trim().replace(/\\s+/g, " ").slice(0, 50),
      box: { x: Math.round(r.x), y: Math.round(r.y),
             w: Math.round(r.width), h: Math.round(r.height) },
    };
  };

  const inViewport = (r) => {
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight;
  };

  /** The first ancestor that CLIPS this element away behind an edge a user
   *  cannot scroll, and on which AXIS.  Returns null when the element is
   *  merely out of view in something scrollable (or in the document itself).
   *
   *  The axis is kept because it is the only mechanical signal that separates
   *  the two very different things an 'overflow: hidden' edge can mean.  It is
   *  a HINT and the report says so: a Y-clip is usually a folded panel (the
   *  collapsed disclosure that produced this module's first false finding),
   *  while an X-clip on a container laid out wider than the viewport is
   *  content lost off the side.  Intent is not in the DOM, so neither is
   *  judged here -- both are listed, with the clipper, for a human. */
  const clippedBy = (el) => {
    const r = el.getBoundingClientRect();
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      const ox = cs.overflowX, oy = cs.overflowY;
      const hides = (o) => o === "hidden" || o === "clip";
      if (!hides(ox) && !hides(oy)) continue;
      const pr = p.getBoundingClientRect();
      const outX = hides(ox) && (r.right <= pr.left + 1 || r.left >= pr.right - 1);
      const outY = hides(oy) && (r.bottom <= pr.top + 1 || r.top >= pr.bottom - 1);
      if (outX || outY) {
        return { node: p, axis: (outX ? "X" : "") + (outY ? "Y" : ""),
                 widerThanViewport: pr.width > innerWidth + 1 };
      }
    }
    return null;
  };

  /** Every scrollable ancestor's scroll offsets, so a test can be undone. */
  const scrollState = (el) => {
    const st = [[document.scrollingElement || document.documentElement,
                 window.scrollX, window.scrollY]];
    for (let p = el.parentElement; p; p = p.parentElement) {
      st.push([p, p.scrollLeft, p.scrollTop]);
    }
    return st;
  };
  const restore = (st) => {
    for (const [node, left, top] of st) {
      if (node === document.scrollingElement || node === document.documentElement) {
        window.scrollTo(left, top);
      } else { node.scrollLeft = left; node.scrollTop = top; }
    }
  };

  // -- PHASE 1: snapshot every off-viewport control BEFORE anything scrolls --
  const pile = [];
  for (const el of document.querySelectorAll(SEL)) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none"
        || parseFloat(cs.opacity || "1") === 0) continue;
    if (inViewport(r)) continue;                    // the at-rest pass judged it
    pile.push({ el, atRest: describe(el), clipper: clippedBy(el) });
  }

  const out = {
    reachableAfterScroll: [], coveredAfterScroll: [],
    unreachableByScroll: [], clippedByOverflow: [],
  };

  // -- PHASE 2: ask each one, and put the page back after each --------------
  for (const item of pile) {
    const entry = { control: item.atRest };
    if (item.clipper) {
      entry.clipper = describe(item.clipper.node);
      entry.clipAxis = item.clipper.axis;
      entry.clipperWiderThanViewport = item.clipper.widerThanViewport;
      out.clippedByOverflow.push(entry);
      continue;         // behind an unscrollable edge: listed, never judged
    }
    const saved = scrollState(item.el);
    item.el.scrollIntoView({ block: "center", inline: "center" });
    const r2 = item.el.getBoundingClientRect();
    const cx2 = r2.left + r2.width / 2, cy2 = r2.top + r2.height / 2;
    entry.afterScroll = { x: Math.round(r2.x), y: Math.round(r2.y),
                          w: Math.round(r2.width), h: Math.round(r2.height) };
    if (!inViewport(r2)) {
      out.unreachableByScroll.push(entry);
    } else {
      const hit = document.elementFromPoint(cx2, cy2);
      if (hit === item.el || (hit && item.el.contains(hit))) {
        out.reachableAfterScroll.push(entry);
      } else {
        entry.blocker = hit ? describe(hit) : { tag: "(nothing)", text: "", box: null };
        entry.relation = hit && hit.contains(item.el) ? "ancestor" : "overlay";
        out.coveredAfterScroll.push(entry);
      }
    }
    restore(saved);
  }

  // THE EXTENT -- one fact, no interpretation.  How far do the app's own
  // interactive controls actually reach, against the viewport they are in?
  // The document's scrollWidth cannot answer this: every overflowing edge here
  // is 'overflow: hidden', so the document reports no overflow at all while
  // controls sit at x = 1251 in a 390 px viewport.  A reader needs the number,
  // not a boolean that a clipped layout makes false.
  let right = 0, bottom = 0;
  for (const el of document.querySelectorAll(SEL)) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none"
        || parseFloat(cs.opacity || "1") === 0) continue;
    right = Math.max(right, Math.round(r.right));
    bottom = Math.max(bottom, Math.round(r.bottom));
  }
  out.extent = { right, bottom, viewportW: innerWidth, viewportH: innerHeight };
  out.documentOverflowsX =
    document.documentElement.scrollWidth > document.documentElement.clientWidth;
  out.scrollWidth = document.documentElement.scrollWidth;
  out.clientWidth = document.documentElement.clientWidth;
  return out;
})()`;
