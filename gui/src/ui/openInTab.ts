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
  openInTab — ONE home for "open this thing in a new tab".

  ONE TAB, ONE THING (docs/design/one-tab-one-thing.md, DECIDED 2026-08-17 by
  Vítor).  The hub stays open; opening a case, Explore or a tool opens a NEW
  tab, and you come back to the hub by clicking its tab.  Four kinds of tab,
  each with an address that IS that thing:

      hub      /app/
      case     /app/?case=<name>
      explore  /app/?workspace=explore      (the landing: choose compounds)
      props    /app/?workspace=properties   (the property surfaces)
      tools    /app/?workspace=methods&tool=<id>

  WHY THE ADDRESSES LIVE HERE RATHER THAN AT EACH CALL SITE.  Record §4:
  "Every 'open' affordance must open a tab, CONSISTENTLY.  A mixture — some
  navigating in place, some opening a tab — is worse than either, and the
  landing already shipped that defect once today (`target="choupo-app"` ate a
  student's converged run)."  A hand-built query string at each of the six
  call sites is exactly how that mixture is reached: one of them spells the
  key differently, or forgets to encode, or reuses a named target.  So the
  string is built once and the call sites name a DESTINATION, not a URL.

  HOW IT OPENS — the third argument of `window.open` must stay ABSENT.  This
  is a lesson already paid for in `help/guideLinks.ts` §2: a non-empty
  windowFeatures string asks the browser for a POPUP WINDOW, so every Help
  entry opened the one thing the bug report said it should not.  Browsers have
  implied `noopener` for `_blank` since 2021; the handle is severed here too
  for the older ones.  Never a NAMED target either — a named target REUSES an
  existing tab, which is the landing's `target="choupo-app"` defect and the
  one thing this whole record exists to stop.

  Pure string builders are exported separately from the opener so the node
  test runner can pin the addresses without a window.
\*---------------------------------------------------------------------------*/

/** The address of a CASE tab: one case, and only its views.
 *
 *  `intro` carries the glass-box INTRO on-ramp into the address.  It has to be
 *  in the URL rather than in a call argument now, and that is the point: the
 *  hub's "New here? Start with one of these" cards used to pass
 *  `loadTutorial(id, { intro: true })` in this same tab, and a tab cannot be
 *  handed an argument.  Anything the opened tab must know has to be part of
 *  what identifies it — which is the record's own claim that the address bar
 *  starts telling the truth. */
export function caseTabSearch(caseName: string, opts?: { intro?: boolean }): string {
  return `?case=${encodeURIComponent(caseName)}${opts?.intro ? "&intro=1" : ""}`;
}

/** The address of the EXPLORE tab: property surfaces, no case. */
export function exploreTabSearch(): string {
  return "?workspace=explore";
}

/** The address of the PROPERTY SURFACES tab -- the plots the explorer's
 *  landing hands a set to.  Its own door on the hub, and reachable with no
 *  selection at all: see docs/design/one-tab-one-thing.md §8.2. */
export function propertiesTabSearch(): string {
  return "?workspace=properties";
}

/** The address of an EDUTOOLS tab.  The `workspace=methods` key is the
 *  deep-link CONTRACT (registry.ts: a URL already in a student's notes must
 *  not stop working because a caption changed), so the label is EduTools and
 *  the key stays `methods`.  With no tool named, the tab opens on the
 *  workspace's own default and its in-body chooser picks from there. */
export function toolsTabSearch(toolId?: string): string {
  return toolId
    ? `?workspace=methods&tool=${encodeURIComponent(toolId)}`
    : "?workspace=methods";
}

/** Open one of the addresses above in a NEW TAB, on this same app.
 *
 *  The path is taken from the live location, so a deployment that serves the
 *  app under a base (the landing serves it at /app) keeps working — the same
 *  rule every other link in the GUI follows.  No named target, no
 *  windowFeatures: see the header. */
export function openAppTab(search: string): void {
  if (typeof window === "undefined") return;
  const w = window.open(`${window.location.pathname}${search}`, "_blank");
  if (w) w.opener = null;
}
