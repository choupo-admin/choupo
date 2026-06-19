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
  AgentConsole -- a toggleable mini console that runs a REAL `claude -c` session
  in the project, through the local bridge (gui/bridge/claudeBridge.mjs, started
  by bin/runGui).

  Claude Code IS the assistant: it edits the dicts on disk (the source of truth;
  reload the case to see the change), knows the project (CLAUDE.md + docs/ai),
  and learns via its own memory + the per-case notes.  The GUI just hosts the
  terminal -- still a runner, not an editor (the editing tool runs in it).

  You decide, the agent enacts: tell it "use NRTL in the flash" / "promote the
  order-2 Arrhenius fit to the reactor" and it writes the dict.
\*---------------------------------------------------------------------------*/

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { ActionIcon, Box, Group, Text, Tooltip, UnstyledButton, useComputedColorScheme } from "@mantine/core";
import { IconX, IconRobot, IconRefresh, IconPin, IconPinnedOff } from "@tabler/icons-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import { useStore } from "../state/store.js";
import {
  asArtifactContent, asArtifactError, asArtifactMessage,
  dismissChip, pushChip, type ArtifactChip,
} from "../agent/artifactChips.js";

// The CSV pop-out pulls CsvAutoPlot -> Plotly (~1 MB).  AgentConsole is EAGER
// in the AppShell, so a static import here would drag Plotly into the main
// bundle (every CsvAutoPlot consumer is deliberately lazy -- see AppShell).
// Load it on the first chip click instead.
function popOutCsvArtifactLazy(rel: string, text: string): void {
  void import("./csvArtifactPopOut.js")
    .then((m) => m.popOutCsvArtifact(rel, text))
    .catch(() => { /* chunk failed to load -- nothing to clean up */ });
}

const PORT = 7682;
const FLOAT_W = 760;

// xterm themes per colour scheme.  The light theme remaps the 16 ANSI colours to
// dark-on-white variants so the CLI's output (which assumes a dark terminal --
// bright-white text, etc.) stays legible on a light background.
const TERM_DARK = { background: "#151b1e", foreground: "#d4d4d4", cursor: "#26c6da" };
const TERM_LIGHT = {
  background: "#ffffff", foreground: "#1f2933", cursor: "#0097a7",
  selectionBackground: "#c5f6fa",
  black: "#1f2933", red: "#c92a2a", green: "#2b8a3e", yellow: "#e67700",
  blue: "#1971c2", magenta: "#9c36b5", cyan: "#0c8599", white: "#495057",
  brightBlack: "#868e96", brightRed: "#e03131", brightGreen: "#37b24d",
  brightYellow: "#f08c00", brightBlue: "#1c7ed6", brightMagenta: "#ae3ec9",
  brightCyan: "#1098ad", brightWhite: "#212529",
};

export function AgentConsole() {
  const open = useStore((s) => s.agentOpen);
  const toggleAgent = useStore((s) => s.toggleAgent);
  const docked = useStore((s) => s.agentDocked);
  const toggleDock = useStore((s) => s.toggleAgentDock);
  const height = useStore((s) => s.agentHeight);
  const setAgentHeight = useStore((s) => s.setAgentHeight);
  const tutorialName = useStore((s) => s.tutorialName);
  const hostRef = useRef<HTMLDivElement>(null);
  const reconnectRef = useRef<() => void>(() => {});
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // CSV artifacts the bridge announced for this session (sweep reports etc.) --
  // a compact chip row above the terminal; click = fetch + pop-out plot.
  // Session-scoped: cleared on every (re)connect, never persisted.
  const [chips, setChips] = useState<ArtifactChip[]>([]);
  // The terminal follows the app's light/dark scheme (the CLI is still a
  // terminal, but a black slab clashes with the light theme).
  const scheme = useComputedColorScheme("light");

  // Floating-window position (only used when not docked).  Initialised to the
  // bottom-left on first float; the header drags it around.
  const [floatPos, setFloatPos] = useState<{ left: number; top: number } | null>(null);
  const pos = floatPos ?? {
    left: 24,
    top: Math.max(60, (typeof window !== "undefined" ? window.innerHeight : 800) - height - 40),
  };

  // Drag the top edge to resize the console height (both modes).
  const onResizeStart = (e: ReactMouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const startTop = pos.top;
    const onMove = (ev: MouseEvent) => {
      const dy = ev.clientY - startY;
      setAgentHeight(startH - dy);            // drag up -> taller
      if (!docked) setFloatPos({ left: pos.left, top: startTop + dy }); // keep bottom edge put
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Drag the header to move the floating window (no-op when docked).
  const onMoveStart = (e: ReactMouseEvent) => {
    if (docked) return;
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const start = { ...pos };
    const onMove = (ev: MouseEvent) => {
      const maxLeft = window.innerWidth - 120;
      const maxTop = window.innerHeight - 60;
      setFloatPos({
        left: Math.min(maxLeft, Math.max(-FLOAT_W + 120, start.left + (ev.clientX - startX))),
        top: Math.min(maxTop, Math.max(40, start.top + (ev.clientY - startY))),
      });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  useEffect(() => {
    if (!open || !hostRef.current) return;

    const term = new Terminal({
      fontSize: 13,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      cursorBlink: true,
      // Force legibility: the CLI emits a lot of DIM text (paths, hints) which
      // xterm renders at ~half opacity -- on a white background that washes out
      // to light grey.  A high minimum contrast ratio bumps any low-contrast
      // glyph (incl. dim) towards near-black on light / near-white on dark.
      minimumContrastRatio: 7,
      // Initial theme from the current scheme; a separate effect keeps it in
      // sync on toggle WITHOUT recreating the terminal (which would kill the
      // live claude session).
      theme: scheme === "dark" ? TERM_DARK : TERM_LIGHT,
    });
    termRef.current = term;
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    try { fit.fit(); } catch { /* */ }

    let ws: WebSocket | null = null;
    let disposed = false;

    const connect = () => {
      setChips([]);             // chips die with the session
      term.writeln("\x1b[2m[assistant] connecting to claude -c …\x1b[0m");
      // A local case (tutorialName "local:<absDir>") lives at an absolute path
      // on disk -> point the bridge there with ?dir=.  A bundled tutorial passes
      // its id (the bridge finds it under tutorials/).  A clipboard-only
      // "external:" case has no bridge dir -> general console (no ?case/?dir).
      let q = "";
      if (tutorialName.startsWith("local:")) {
        const dir = tutorialName.slice("local:".length);
        q = `?dir=${encodeURIComponent(dir)}`;
      } else if (tutorialName && !tutorialName.startsWith("external:")) {
        q = `?case=${encodeURIComponent(tutorialName)}`;
      }
      ws = new WebSocket(`ws://${location.hostname}:${PORT}${q}`);
      wsRef.current = ws;
      ws.onopen = () => sendResize();
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(typeof ev.data === "string" ? ev.data : "");
          if (m.type === "data") term.write(m.data);
          else if (m.type === "exit") term.write(`\r\n\x1b[2m[session ended (${m.code}) — ↻ to start a new one]\x1b[0m\r\n`);
          else {
            // Artifact channel: a .csv changed in the case -> chip; a fetched
            // artifact's content -> pop the shared CSV plot out in a new tab.
            const art = asArtifactMessage(m);
            if (art) { setChips((prev) => pushChip(prev, art)); return; }
            const content = asArtifactContent(m);
            if (content) { popOutCsvArtifactLazy(content.rel, content.text); return; }
            const err = asArtifactError(m);
            if (err) term.write(`\r\n\x1b[2m[artifact] ${err.rel}: ${err.error}\x1b[0m\r\n`);
          }
        } catch { /* ignore */ }
      };
      ws.onerror = () => {
        term.writeln("\r\n\x1b[31m[assistant] bridge not reachable on :" + PORT + "\x1b[0m");
        term.writeln("\x1b[2m  start it with  bin/runGui  (it launches the bridge) or  bin/agentBridge\x1b[0m");
      };
    };
    reconnectRef.current = () => { try { ws?.close(); } catch { /* */ } term.reset(); connect(); };

    const sendResize = () => {
      try { fit.fit(); } catch { /* */ }
      if (ws && ws.readyState === ws.OPEN)
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };
    const onData = term.onData((d) => {
      if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "input", data: d }));
    });
    const ro = new ResizeObserver(() => { if (!disposed) sendResize(); });
    ro.observe(hostRef.current);

    connect();

    return () => {
      disposed = true;
      onData.dispose();
      ro.disconnect();
      try { ws?.close(); } catch { /* */ }
      term.dispose();
      termRef.current = null;
      wsRef.current = null;
    };
    // `scheme` intentionally omitted: theme changes are applied by the effect
    // below (no terminal recreation, so the live session survives a toggle).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tutorialName]);

  // Keep the terminal theme in sync with the app scheme without recreating it.
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = scheme === "dark" ? TERM_DARK : TERM_LIGHT;
    }
  }, [scheme]);

  // Chip click: ask the bridge for the artifact's text; the reply
  // (artifactContent) opens the shared CSV plot as a pop-out tab.
  const openChip = (rel: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "readArtifact", rel }));
  };

  if (!open) return null;

  // Docked: occupy the grid's "console" row (content above shrinks -> nothing
  // hides behind it).  Floating: a movable fixed overlay.
  const containerStyle: React.CSSProperties = docked
    ? {
        gridArea: "console", position: "relative", height: "100%", width: "100%",
        background: "light-dark(#ffffff, #151b1e)", borderTop: "2px solid var(--mantine-color-accent-7)",
        display: "flex", flexDirection: "column", minHeight: 0,
      }
    : {
        position: "fixed", left: pos.left, top: pos.top, width: FLOAT_W, height, zIndex: 300,
        background: "light-dark(#ffffff, #151b1e)", border: "1px solid var(--mantine-color-accent-7)", borderRadius: 8,
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 10px 30px rgba(0,0,0,0.55)",
      };

  return (
    <Box style={containerStyle}>
      {/* drag the top edge to resize */}
      <Box
        onMouseDown={onResizeStart}
        title="Drag to resize"
        style={{
          position: "absolute", top: -3, left: 0, right: 0, height: 6,
          cursor: "ns-resize", zIndex: 301,
        }}
      />
      <Group justify="space-between" px="sm" py={4}
        onMouseDown={onMoveStart}
        style={{
          background: "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-8))", borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
          cursor: docked ? "default" : "grab",
        }}>
        <Group gap={6} align="center">
          <IconRobot size={15} color="var(--mantine-color-accent-4)" />
          <Text size="xs" fw={600} c="accent.3">Assistant</Text>
          <Text size="xs" c="dimmed" ff="monospace">claude -c · edits the dicts · the GUI live-reloads</Text>
        </Group>
        <Group gap={2}>
          <Tooltip label={docked ? "Float (detach)" : "Pin to bottom"} withArrow>
            <ActionIcon variant="subtle" size="sm" color="gray"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={toggleDock} aria-label={docked ? "Float console" : "Pin console"}>
              {docked ? <IconPinnedOff size={14} /> : <IconPin size={14} />}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="New session (reconnect)" withArrow>
            <ActionIcon variant="subtle" size="sm" color="gray"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => reconnectRef.current()} aria-label="Reconnect">
              <IconRefresh size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Close console" withArrow>
            <ActionIcon variant="subtle" size="sm" color="gray"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={toggleAgent} aria-label="Close assistant">
              <IconX size={15} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      {chips.length > 0 && (
        // CSV artifacts of THIS session (sweep reports the agent wrote, ...):
        // latest first, click = pop-out plot, × = dismiss.  Not persisted.
        <Group gap={6} px="sm" py={4} wrap="wrap"
          style={{
            flex: "0 0 auto",
            borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
          }}>
          {chips.map((c) => (
            <Group key={c.rel} gap={2} wrap="nowrap"
              style={{
                border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
                borderRadius: 12, paddingLeft: 8, paddingRight: 2,
                background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))",
              }}>
              <UnstyledButton onClick={() => openChip(c.rel)}
                title={`Plot ${c.rel} in a new tab`} aria-label={`Plot ${c.rel}`}>
                <Text size="xs" ff="monospace" c="accent.4" style={{ whiteSpace: "nowrap" }}>
                  {c.rel} · plot ↗
                </Text>
              </UnstyledButton>
              <ActionIcon variant="subtle" size="xs" color="gray"
                onClick={() => setChips((prev) => dismissChip(prev, c.rel))}
                aria-label={`Dismiss ${c.rel}`}>
                <IconX size={11} />
              </ActionIcon>
            </Group>
          ))}
        </Group>
      )}
      <Box ref={hostRef} style={{ flex: 1, minHeight: 0, padding: 6, overflow: "hidden" }} />
    </Box>
  );
}
