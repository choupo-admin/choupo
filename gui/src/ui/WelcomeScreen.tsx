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
  WelcomeScreen -- the blank-boot landing INSIDE the app (no case open).

  The first thing a student sees.  The bare "No flowsheet" void read as
  intimidating; this replaces it with a calm, inviting on-ramp: the mark + a
  one-line "what is this", big clickable actions (New case / Browse tutorials /
  Open case / Reopen last), and a few "start here" tutorial cards that open with
  one click.  It does NOT add editing -- it is navigation, the door into the
  runner/visualiser.

  Modal-backed actions (New case / browse tutorials / open .zip) are owned by
  MenuBar; we fire a CustomEvent it listens for (the same decoupling as
  `choupo:run`).  Direct actions (open a specific tutorial, reopen last) call the
  store straight.
\*---------------------------------------------------------------------------*/

import { Box, Button, Group, Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import {
  IconArrowRight,
  IconBook2,
  IconChartLine,
  IconFilePlus,
  IconFolderOpen,
  IconHistory,
} from "@tabler/icons-react";

import { useStore, reopenLastCase, lastCaseLabel } from "../state/store.js";

// A few tutorials that span the experience -- the student's first clicks.
const SUGGESTED: { id: string; title: string; desc: string }[] = [
  { id: "steady/flash/adiabaticFlash01_benzene_toluene",
    title: "Your first flash (adiabatic)",
    desc: "A real flash drum: no heat added (Q=0) — the outlet T is the answer the energy balance gives." },
  { id: "steady/flash/flash01_benzene_toluene",
    title: "Now hold the temperature",
    desc: "The same benzene/toluene split at fixed T — and the heat duty that costs (the isothermal contrast)." },
  { id: "steady/flowsheets/process01_reactor_flash",
    title: "A first flowsheet",
    desc: "Reactor → flash: two units wired by their streams." },
  { id: "props/estimate/estimate_acetone",
    title: "Properties: estimate a component",
    desc: "Build a component from groups (Joback) — see its error against reference data." },
];

const LOGO2MARK = `${import.meta.env.BASE_URL}logo2-mark.png`;

function fire(name: string): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(name));
}

export function WelcomeScreen() {
  const loadTutorial = useStore((s) => s.loadTutorial);
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);
  const reopen = lastCaseLabel();

  return (
    <Box
      style={{
        width: "100%", height: "100%", overflow: "auto",
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: 32, background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))",
      }}
    >
      {/* margin:auto centres vertically WHEN it fits, but collapses to 0 on
          overflow so the top (logo) is never clipped + stays scrollable. */}
      <Stack gap="lg" align="center" style={{ maxWidth: 780, width: "100%", margin: "auto 0" }}>
        {/* Mark + what-is-this */}
        <Stack gap={6} align="center">
          {/* Horizontal lockup: leaf mark left + CHOUPO wordmark right -- compact
              (keeps the CTAs high on a laptop screen). */}
          <Group gap="md" align="center" justify="center" wrap="nowrap">
            <img src={LOGO2MARK} alt="" style={{ height: 80, display: "block", flexShrink: 0 }} />
            <Stack gap={3} align="flex-start">
              <Text fw={800} style={{ fontSize: 40, letterSpacing: 1, lineHeight: 1 }}>
                <span style={{ color: "light-dark(var(--mantine-color-accent-7), var(--mantine-color-accent-4))" }}>C</span>HOUPO<sup style={{ fontSize: "0.38em", fontWeight: 600, verticalAlign: "super", letterSpacing: 0 }}>™</sup>
              </Text>
              <Text c="dimmed" size="sm" style={{ lineHeight: 1.15 }}>A glass-box chemical process simulator</Text>
            </Stack>
          </Group>
          <Stack gap={4} align="center">
            <Text c="var(--mantine-color-text)" size="md" fw={600} ta="center" maw={640}>
              The industry you'll inherit must get cleaner — and it's yours to redesign.
            </Text>
            <Text c="dimmed" size="sm" ta="center" maw={620}>
              Open the box, see every equation, and build it better. Open-source, in your
              browser, nothing to install.
            </Text>
          </Stack>
        </Stack>

        {/* Primary action = run a tutorial (the right first step: see Newton
            converge, grasp the philosophy, THEN author a case).  New case is
            secondary. */}
        <Group gap="sm" justify="center">
          {/* The no-case, zero-friction on-ramp: explore properties of any
              component/mixture right now, no tutorial to open. */}
          <Button leftSection={<IconChartLine size={16} />} color="accent"
            onClick={() => setActiveWorkspace("explore")}>
            Explore properties
          </Button>
          <Button leftSection={<IconBook2 size={16} />} color="accent"
            onClick={() => fire("choupo:welcome:open-tutorial")}>
            Browse tutorials
          </Button>
          <Button leftSection={<IconFilePlus size={16} />} variant="default"
            onClick={() => fire("choupo:welcome:new-case")}>
            New case
          </Button>
          <Button leftSection={<IconFolderOpen size={16} />} variant="default"
            onClick={() => fire("choupo:welcome:open-zip")}>
            Open case (.zip)
          </Button>
          {reopen && (
            <Button leftSection={<IconHistory size={16} />} variant="subtle"
              onClick={() => void reopenLastCase()}
              title={`Reopen ${reopen}`}>
              Reopen recent
              <Text span size="xs" c="dimmed" ml={6}>{reopen}</Text>
            </Button>
          )}
        </Group>

        {/* Start-here cards */}
        <Stack gap={8} style={{ width: "100%" }}>
          <Text size="xs" tt="uppercase" c="dimmed" fw={700} style={{ letterSpacing: 1 }}>
            New here? Start with one of these
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            {SUGGESTED.map((t) => (
              <Paper key={t.id} withBorder p="md" radius="md"
                style={{
                  cursor: "pointer",
                  background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))",
                  transition: "background 120ms, border-color 120ms, transform 120ms",
                }}
                onClick={() => loadTutorial(t.id, { intro: true })}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = "var(--mantine-color-accent-5)";
                  el.style.background = "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-5))";
                  el.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = "";
                  el.style.background = "light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))";
                  el.style.transform = "";
                }}>
                <Group justify="space-between" wrap="nowrap" gap="sm">
                  <div>
                    <Text size="sm" fw={700} c="var(--mantine-color-text)">{t.title}</Text>
                    <Text size="xs" c="dimmed" mt={2}>{t.desc}</Text>
                  </div>
                  <IconArrowRight size={18} stroke={2.2} style={{ flexShrink: 0, color: "light-dark(var(--mantine-color-accent-6), var(--mantine-color-accent-4))" }} />
                </Group>
              </Paper>
            ))}
          </SimpleGrid>
        </Stack>

        <Text size="sm" c="dimmed" ta="center" maw={640}>
          <b style={{ color: "var(--mantine-color-text)" }}>Help build the glass-box simulator
          chemical engineers deserve</b> — models, tutorials, tests, validation data, new unit
          operations. Public source and community forum <b>coming soon</b>.
        </Text>

        <Text size="xs" c="dimmed" ta="center" maw={620}>
          Cases are plain-text dicts on disk — the GUI runs and visualises them.
          Author with your editor or the in-app assistant; the dicts stay the
          source of truth.
        </Text>
        <Text size="xs" c="dimmed" ta="center">
          Created and maintained by{" "}
          <a href="https://www.linkedin.com/in/vítor-geraldes-4625b8a" target="_blank" rel="noopener"
             style={{ color: "var(--mantine-color-accent-5)", textDecoration: "none" }}>
            Vítor Geraldes
          </a>{" "}
          · GPL-3.0-or-later · Independent open-source project
        </Text>
        <Text size="xs" c="dimmed" ta="center">
          CHOUPO™ is a trademark of TalentGround Lda.
        </Text>
      </Stack>
    </Box>
  );
}
