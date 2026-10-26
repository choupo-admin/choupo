/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * legibilityFloor -- the minimum text size, APPLIED to a zoomed React Flow
 * drawing (the flowsheet and the calculation map).  The decision is
 * case/legibility.ts's; this only reads what the browser rendered and marks
 * each label with it:
 *
 *   data-lg="hide"   not drawn (theme-overrides.css: visibility hidden)
 *   data-lg="grow"   drawn at MIN_TEXT_PX / zoom (a primary label)
 *   (absent)         drawn as declared
 *
 * A label is PRIMARY when it, or an ancestor inside the drawing, carries
 * `data-legible-primary` (a unit's name, a block's title, a wire's phase
 * letter).  The drawing's root gets `data-legibility="full" | "overview"` and
 * the CSS variable `--choupo-canvas-zoom` the grow rule divides by.
 *
 * GENERIC ON PURPOSE.  Every text node inside the viewport is held to the
 * floor -- a node, a terminal, an edge label, a badge somebody adds next
 * year -- with no list of components to keep in step.  A label's declared
 * size is read once (the browser's computed font-size, before any grow) and
 * cached, so a zoom gesture writes attributes and computes nothing.
 *
 * Not testable in jsdom (no layout, no computed sizes): the decision is
 * (tests/legibility.test.ts); this wiring is checked by the C168 slice-2
 * browser measurement, which counts rendered text below the minimum.
 */

import { useEffect, useRef, useState } from "react";
import { useStore as useFlowStore } from "@xyflow/react";

import { MIN_TEXT_PX, drawingLegibility, legibilityOf, type Legibility } from "../case/legibility.js";

/** The elements of `root` that draw their OWN text (a direct text node, or
 *  an SVG <text>/<tspan>). */
function textElements(root: Element): Element[] {
  const out: Element[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const seen = new Set<Element>();
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if (!n.textContent || !n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    out.push(el);
  }
  return out;
}

/**
 * Hold the drawing under `rootRef` (an element containing ONE React Flow
 * viewport) to the minimum text size.  Call inside the ReactFlowProvider.
 * Returns the drawing's state, for a hint.
 */
export function useLegibilityFloor(rootRef: React.RefObject<HTMLElement | null>): "full" | "overview" {
  const zoom = useFlowStore((s) => s.transform[2]);
  const base = useRef(new WeakMap<Element, number>());
  const [state, setState] = useState<"full" | "overview">("full");
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const apply = useRef<() => void>(() => {});

  apply.current = () => {
    const root = rootRef.current;
    if (!root) return;
    const vp = root.querySelector(".react-flow__viewport");
    if (!vp) return;
    const z = zoomRef.current;
    root.style.setProperty("--choupo-canvas-zoom", String(z));
    root.style.setProperty("--choupo-lg-min", `${MIN_TEXT_PX}px`);
    const states: Legibility[] = [];
    for (const el of textElements(vp)) {
      //  A node that sizes its OWN text to the zoom (a workflow step's
      //  compact face, ui/WorkflowDiagram.tsx) is held to the minimum by
      //  itself: its declared size changes with the zoom, so a cached base
      //  would be wrong, and growing it again would double the growth.
      if (el.closest("[data-legible-self]")) continue;
      let px = base.current.get(el);
      if (px === undefined) {
        //  the DECLARED size: read with no grow applied
        const had = el.getAttribute("data-lg");
        if (had === "grow") el.removeAttribute("data-lg");
        px = parseFloat(getComputedStyle(el).fontSize);
        if (had === "grow") el.setAttribute("data-lg", had);
        base.current.set(el, px);
      }
      //  An SVG label may sit under a viewBox scale of its own (a unit's
      //  symbol tag): its screen CTM is the whole scale, the canvas zoom
      //  included.  It is never grown -- the grow rule divides by the canvas
      //  zoom alone -- only shown or hidden.
      let scale = z;
      let primary = !!el.closest("[data-legible-primary]");
      if (el instanceof SVGGraphicsElement) {
        const m = el.getScreenCTM();
        if (m) scale = Math.hypot(m.a, m.b);
        primary = false;
      }
      const s = legibilityOf(px, scale, primary);
      states.push(s);
      //  A badge's label hides WITH its badge: an empty tinted pill is not
      //  a simplified view, it is litter.
      const target = (s === "hide" && el.closest(".mantine-Badge-root")) || el;
      if (target !== el && el.getAttribute("data-lg")) el.removeAttribute("data-lg");
      const badge = el.closest(".mantine-Badge-root");
      if (badge && badge !== target && badge.getAttribute("data-lg")) badge.removeAttribute("data-lg");
      const cur = target.getAttribute("data-lg");
      if (s === "show") { if (cur !== null) target.removeAttribute("data-lg"); }
      else if (cur !== s) target.setAttribute("data-lg", s);
    }
    const d = drawingLegibility(states);
    if (root.getAttribute("data-legibility") !== d) root.setAttribute("data-legibility", d);
    setState(d);
  };

  //  every zoom change, on the next frame
  useEffect(() => {
    const id = requestAnimationFrame(() => apply.current());
    return () => cancelAnimationFrame(id);
  }, [zoom]);

  //  every change of what is drawn (a run, a toggle, a node measured)
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let pending = 0;
    const mo = new MutationObserver((records) => {
      //  our own attribute writes are not a change of what is drawn
      if (records.every((r) => r.type === "attributes")) return;
      if (pending) return;
      pending = requestAnimationFrame(() => { pending = 0; apply.current(); });
    });
    mo.observe(root, { subtree: true, childList: true, characterData: true });
    const id = requestAnimationFrame(() => apply.current());
    return () => { mo.disconnect(); cancelAnimationFrame(id); if (pending) cancelAnimationFrame(pending); };
  }, [rootRef]);

  return state;
}
