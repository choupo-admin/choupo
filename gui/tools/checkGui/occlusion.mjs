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
