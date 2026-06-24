/*---------------------------------------------------------------------------*\
  ExploreMccabeTab — the full-window McCabe-Thiele analyzer in its own browser
  tab (?explore=mccabe&key=…, design EXPLORER-ux-redesign §2b/§3).

  A thin wrapper, mirroring InternalsView's role for ?internals=: read the
  stashed frozen curve + provenance, mount <McCabePlot> at viewport size (so its
  internal width breakpoint renders the wide two-column layout), and pin the
  honesty caption that the curve is FROZEN at P / model.  When the stash is gone
  (cleared storage, different browser), refuse honestly via ExpiredTabPanel —
  never silently degrade while the URL still claims to be a McCabe tab.

  Transience (what-if credo): the knobs in this tab are transient — closing the
  tab IS the reset.  No save, no write-back to the inline Explorer; the two are
  independent walks over the same frozen curve.  To change P or the γ model
  (the only things that legitimately reshape y*(x)), return to the Explorer.
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo } from "react";
import { Box, Stack, Text } from "@mantine/core";

import { McCabePlot } from "../plotting/McCabePlot.js";
import { ExpiredTabPanel } from "../ExpiredTabPanel.js";
import { readExploreMccabeStash } from "./exploreMccabePopOut.js";

export function ExploreMccabeTab() {
  const key = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("key");
  }, []);
  const stash = useMemo(() => (key ? readExploreMccabeStash(key) : null), [key]);

  // Distinguishing browser-tab title (gui-credo §4 "carry a distinguishing
  // document.title"), matching the "<a>/<b> · McCabe-Thiele" convention.
  useEffect(() => {
    if (stash) document.title = `${stash.compA}/${stash.compB} · McCabe-Thiele`;
  }, [stash]);

  if (!stash) return <ExpiredTabPanel kind="explore" />;

  return (
    <Box
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        padding: 16,
        background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))",
      }}
    >
      <Stack gap="xs" style={{ flex: 1, minHeight: 0 }}>
        {/* The frozen-at-P/model honesty caption — the student SEES the analyzer
            is a snapshot, never a silent stale lens. */}
        <Text size="xs" c="dimmed">
          Equilibrium curve frozen at P = {(stash.P / 1e5).toFixed(3)} bar · {stash.model || "ideal"}.
          To change P or the model, return to the Explorer and pop out again.
        </Text>
        <Box style={{ flex: 1, minHeight: 0 }}>
          <McCabePlot csv={stash.csv} compA={stash.compA} compB={stash.compB} P={stash.P} allowWide />
        </Box>
      </Stack>
    </Box>
  );
}
