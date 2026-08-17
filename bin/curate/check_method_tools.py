#!/usr/bin/env python3
"""check_method_tools -- the landing's EduTools list IS the live registry.

    bin/curate/check_method_tools.py

WHY THIS EXISTS.  `docs/design/modes-and-views-in-the-top-row.md` 4a put the
EduTools on the landing page under a condition that is not negotiable --
"generated from METHOD_TOOLS, never a hand-written list" -- and named the
failure mode it is guarding against: *the day someone adds a thirteenth tool it
appears in the app and not on the landing, or the reverse, and nothing says so*.
This is the "says so".

The chain has three links and this gate walks all three:

    gui/src/ui/methods/registry.ts      the ONE home (METHOD_TOOLS)
      -> generated/methodTools.json     derived by bin/curate/method_tools.mjs
        -> site/index.html              fetches it at runtime and draws cards

WHAT IS CHECKED

  1.  The live registry is re-derived HERE, by running
      `bin/curate/method_tools.mjs --emit` -- which transpiles the real module
      and imports it, so the array compared is the array the application
      renders (see that file's header for why an AST parse was rejected).
  2.  Ids, BOTH DIRECTIONS: nothing in the published artefact that is not live
      in the registry, and nothing live in the registry that is missing from the
      artefact.
  3.  Per tool, the label, the one-line `teaches` and the deep link are
      identical.  A stale caption is drift too, and it is the kind a reader
      believes.
  4.  Every published `href` is the app's existing contract,
      `/app/?workspace=methods&tool=<id>` -- condition 2 of the same ruling.
  5.  `site/index.html` fetches `/methodTools.json`, still carries the element
      the script fills, and contains NO tool id, label or blurb as literal text
      -- a card written into the page would be the second home the ruling bans.
  6.  `bin/buildSite` publishes the artefact.  A landing that fetches a file the
      assembler never copies renders an empty section and blames the network.

WHAT THIS GATE DOES NOT CHECK, stated because a gate implying more than it has
is worse than one that reports less:

  * It never executes the page's JavaScript -- there is no browser and no DOM
    in this suite.  It verifies the DATA the landing fetches and the absence of
    a second list; it does not observe twelve cards painted in a viewport.
  * It says nothing about whether a tool WORKS, or whether a `live` status is
    honest.  `status` is the registry's claim; this gate only insists the
    landing repeats exactly the claims marked live.

SABOTAGE-VERIFIED 2026-08-17.  Four sabotages, and ONE OF THEM SURVIVED THE
FIRST ATTEMPT -- which is the reason a gate is not to be trusted until it has
been seen failing.  Outputs below are verbatim (long lines unwrapped).

S1 -- both directions at once: 'merkel' deleted from the published artefact and
a fabricated 'gantt-chart' added.  (The registry itself was NOT edited: gui/ is
another worktree owner's territory.  The comparison is symmetric, so driving it
from the artefact side exercises both arms.)

    check_method_tools: FAIL
      - generated/methodTools.json advertises 'gantt-chart', which is NOT a live tool in gui/src/ui/methods/registry.ts.  The landing would offer a link the app cannot serve.
      - 'merkel' is live in the registry and MISSING from generated/methodTools.json.  The landing would hide a tool the app has.
      REMEDY: regenerate with `bin/curate/method_tools.mjs`.  The registry is the one home; this artefact and the landing page are derived from it and never edited by hand.

S2 -- the landing's fetch repointed at /toolsList.json.  FIRST RUN: exit 0, the
full OK line, no complaint.  The arm was a substring search for
"/methodTools.json", and the section's own explanatory HTML comment names the
file -- so the check was satisfied by PROSE ABOUT the fetch while the fetch
itself pointed elsewhere.  Repaired to match the call (`fetch("/methodTools...`)
and re-run:

    check_method_tools: FAIL
      - site/index.html never fetches /methodTools.json -- whatever it shows for EduTools is not this artefact
      REMEDY: regenerate with `bin/curate/method_tools.mjs`.  The registry is the one home; this artefact and the landing page are derived from it and never edited by hand.

S3 -- one hand-written card pasted into site/index.html (the exact drift the
ruling names).  Both the id arm and the label arm fired:

    check_method_tools: FAIL
      - site/index.html writes the tool id 'mccabe' into the page -- that is the second hand-written list the ruling bans
      - site/index.html writes the label 'Distillation (McCabe-Thiele)' into the page -- same defect
      REMEDY: regenerate with `bin/curate/method_tools.mjs`.  The registry is the one home; this artefact and the landing page are derived from it and never edited by hand.

S4 -- bin/buildSite's copy line removed, so the published page would fetch a 404:

    check_method_tools: FAIL
      - bin/buildSite does not copy generated/methodTools.json into the dist -- the published landing would fetch a 404 and show its fallback message instead of the tools
      REMEDY: regenerate with `bin/curate/method_tools.mjs`.  The registry is the one home; this artefact and the landing page are derived from it and never edited by hand.

S5 -- the plane's own EDUTOOLS_BLURB pasted into the page as a placeholder:

    check_method_tools: FAIL
      - site/index.html writes the EduTools blurb into the page -- it belongs to the registry and must arrive with the artefact
      REMEDY: regenerate with `bin/curate/method_tools.mjs`.  The registry is the one home; this artefact and the landing page are derived from it and never edited by hand.

EXIT 0 pass, 1 fail, 2 CANNOT RUN (no gui/node_modules -- a C++-only checkout).
2 is not a pass; bin/runTests reports it as SKIPPED and counts it as neither.
"""

import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
GENERATOR = ROOT / "bin" / "curate" / "method_tools.mjs"
ARTEFACT = ROOT / "generated" / "methodTools.json"
LANDING = ROOT / "site" / "index.html"
BUILDSITE = ROOT / "bin" / "buildSite"

CONTRACT = "/app/?workspace=methods&tool={id}"
REMEDY = ("REMEDY: regenerate with `bin/curate/method_tools.mjs`.  The registry "
          "is the one home; this artefact and the landing page are derived from "
          "it and never edited by hand.")


def cannot_run(msg):
    print(f"check_method_tools: CANNOT RUN -- {msg}")
    return 2


def derive():
    """The live registry, re-derived now.  (doc, None) or (None, exit-code)."""
    if not (ROOT / "gui" / "node_modules").is_dir():
        return None, cannot_run("gui/node_modules is absent, so the TypeScript "
                                "registry cannot be evaluated")
    try:
        r = subprocess.run(["node", str(GENERATOR), "--emit"], cwd=str(ROOT),
                           capture_output=True, text=True, timeout=180)
    except (OSError, subprocess.TimeoutExpired) as e:
        return None, cannot_run(f"could not run node on the generator: {e}")

    if r.returncode == 2:
        return None, cannot_run(r.stderr.strip() or "the generator cannot run")
    if r.returncode != 0:
        print("check_method_tools: FAIL")
        print("  - the registry could not be evaluated, so the landing's claim "
              "cannot be checked at all:")
        for line in (r.stderr or r.stdout).strip().splitlines():
            print(f"      {line}")
        return None, 1
    return json.loads(r.stdout), None


def main():
    live, code = derive()
    if live is None:
        return code

    fails = []

    if not ARTEFACT.exists():
        print("check_method_tools: FAIL")
        print(f"  - {ARTEFACT.relative_to(ROOT)} does not exist -- the landing "
              "fetches it and would render an empty EduTools section.")
        print(f"  {REMEDY}")
        return 1

    published = json.loads(ARTEFACT.read_text())
    pub_tools = {t["id"]: t for t in published.get("tools", [])}
    live_tools = {t["id"]: t for t in live.get("tools", [])}

    #  Vacuity: an artefact with no tools and a registry with no live tools look
    #  the same from here, and both would leave the landing silently empty.
    if not live_tools:
        fails.append("the registry yields NO live tool -- refusing to certify an "
                     "empty landing section as correct")
    if not pub_tools:
        fails.append(f"{ARTEFACT.relative_to(ROOT)} lists no tools at all")

    for tid in sorted(set(pub_tools) - set(live_tools)):
        fails.append(f"{ARTEFACT.relative_to(ROOT)} advertises '{tid}', which is "
                     "NOT a live tool in gui/src/ui/methods/registry.ts.  The "
                     "landing would offer a link the app cannot serve.")
    for tid in sorted(set(live_tools) - set(pub_tools)):
        fails.append(f"'{tid}' is live in the registry and MISSING from "
                     f"{ARTEFACT.relative_to(ROOT)}.  The landing would hide a "
                     "tool the app has.")

    for tid in sorted(set(pub_tools) & set(live_tools)):
        for field in ("label", "teaches", "href"):
            if pub_tools[tid].get(field) != live_tools[tid].get(field):
                fails.append(
                    f"'{tid}': published {field} {pub_tools[tid].get(field)!r} "
                    f"is not the registry's {live_tools[tid].get(field)!r}")
        want = CONTRACT.format(id=tid)
        if pub_tools[tid].get("href") != want:
            fails.append(
                f"'{tid}': href {pub_tools[tid].get('href')!r} is not the app's "
                f"deep-link contract {want!r} -- a landing-only route is exactly "
                "what condition 2 of the ruling forbids")

    #  The landing itself.
    if not LANDING.exists():
        fails.append("site/index.html is missing")
    else:
        html = LANDING.read_text()
        #  The CALL, not the word.  A plain substring search passes on the
        #  section's own explanatory comment, which names the file: sabotage S2
        #  (repointing the fetch at /toolsList.json) was waved through by the
        #  first version of this arm.  A check satisfied by prose about the
        #  thing is not a check on the thing.
        if not re.search(r"""fetch\(\s*["']/methodTools\.json["']""", html):
            fails.append("site/index.html never fetches /methodTools.json -- "
                         "whatever it shows for EduTools is not this artefact")
        if 'id="edutoolsGrid"' not in html:
            fails.append('site/index.html has no element id="edutoolsGrid" -- '
                         "the fetched list has nowhere to be drawn")
        for tid, tool in sorted(live_tools.items()):
            if re.search(r'["\']%s["\']' % re.escape(tid), html) \
                    or f"tool={tid}" in html:
                fails.append(f"site/index.html writes the tool id '{tid}' into "
                             "the page -- that is the second hand-written list "
                             "the ruling bans")
            if tool.get("label") and tool["label"] in html:
                fails.append(f"site/index.html writes the label "
                             f"{tool['label']!r} into the page -- same defect")
            if tool.get("teaches") and tool["teaches"] in html:
                fails.append(f"site/index.html writes '{tid}'s blurb into the "
                             "page -- same defect")
        #  The plane's own one-paragraph blurb (EDUTOOLS_BLURB) is registry
        #  prose too: copied into the page it becomes the version a reader sees
        #  whenever the fetch fails, and it drifts silently.
        if live.get("blurb") and live["blurb"] in html:
            fails.append("site/index.html writes the EduTools blurb into the "
                         "page -- it belongs to the registry and must arrive "
                         "with the artefact")

    if BUILDSITE.exists() and "generated/methodTools.json" not in BUILDSITE.read_text():
        fails.append("bin/buildSite does not copy generated/methodTools.json into "
                     "the dist -- the published landing would fetch a 404 and "
                     "show its fallback message instead of the tools")

    if fails:
        print("check_method_tools: FAIL")
        for f in fails:
            print(f"  - {f}")
        print(f"  {REMEDY}")
        return 1

    print(f"check_method_tools: the landing's EduTools list IS the live registry "
          f"-- {len(live_tools)} live tool(s) of {live.get('registryTools')} in "
          f"gui/src/ui/methods/registry.ts, re-derived by importing the module; "
          f"same {len(pub_tools)} ids both ways, labels/blurbs/deep links "
          f"identical, every href on the `?workspace=methods&tool=` contract; "
          f"site/index.html fetches the artefact, carries no tool id, label or "
          f"blurb of its own, and bin/buildSite publishes it.  BLIND SPOT: the "
          f"page's JavaScript is never executed here, so this checks the DATA "
          f"the landing fetches and the absence of a second list -- not that a "
          f"browser paints {len(pub_tools)} cards.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
