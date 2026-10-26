/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * WirePhaseMark -- the move-point at the middle of a stream wire, carrying
 * the wire's PHASE as a letter (DEV.md 4c C168 slice 2, ruling (d): "no
 * meaning in colour alone -- phase on wires carries a second channel").
 *
 * A wire's colour is its phase (cyan liquid, orange vapour, purple two-phase:
 * ui/plotting/palette.ts).  Until this slice the letter was on the TERMINALS
 * only, so an internal stream said its phase in colour alone -- unreadable to
 * a colour-blind reader and lost on a greyscale print.  The letter rides the
 * grab handle every wire already had (one element, no new clutter): L, V,
 * V+L, S, S+L, or "?" before a run where 0/ declares no phase (the run
 * resolves it; the canvas does not guess).  A wire with no phase to say
 * (energy, duty, recipe) keeps the plain dot.
 *
 * The letter is a PRIMARY label for the legibility floor (ui/
 * legibilityFloor.ts): at fit it is kept at the minimum size rather than
 * hidden, because the phase is the one fact the overview must still carry.
 */

export function WirePhaseMark({ color, glyph, label, moved, hover, what = "phase", primary = true }: {
  color: string;
  /** the phase letter, or undefined for a wire with no phase to say */
  glyph?: string;
  /** the phase word, for the title and the accessible name */
  label?: string;
  moved: boolean;
  hover: boolean;
  /** what the mark states: a stream's "phase" on the flowsheet, what an
   *  arrow "carries" on the workflow diagram (DEV.md 4c C172 slice 3b) */
  what?: string;
  /** kept at the minimum size at fit (case/legibility.ts) -- a phase letter
   *  is; a workflow arrow's word is, only where the reader needs it there */
  primary?: boolean;
}) {
  if (!glyph) {
    return (
      <div
        style={{
          width: hover ? 12 : 9,
          height: hover ? 12 : 9,
          borderRadius: "50%",
          border: `2px solid ${color}`,
          background: moved ? color : "light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))",
          opacity: moved || hover ? 1 : 0.55,
          transition: "opacity 120ms ease, width 120ms ease, height 120ms ease",
        }}
      />
    );
  }
  return (
    <div
      data-wire-phase={what === "phase" ? glyph : undefined}
      data-wire-carries={what === "phase" ? undefined : glyph}
      data-legible-primary={primary ? "" : undefined}
      aria-label={label ? `${what}: ${label}` : undefined}
      title={label ? `${what}: ${label}` : undefined}
      style={{
        minWidth: 16,
        padding: "0 3px",
        borderRadius: 8,
        border: `${moved || hover ? 2 : 1.5}px solid ${color}`,
        background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))",
        color: "var(--mantine-color-text)",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 11,
        fontWeight: 700,
        lineHeight: "14px",
        textAlign: "center",
        whiteSpace: "nowrap",
      }}
    >
      {glyph}
    </div>
  );
}
