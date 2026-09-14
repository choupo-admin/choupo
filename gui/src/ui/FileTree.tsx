/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  FileTree — THE ONE tree renderer for a path list, extracted from
  CaseWorkspace on 2026-09-14 so a second workspace could draw a tree without
  writing a second renderer.

  WHAT IS SHARED AND WHAT IS NOT.  The STRUCTURE is `caseTree.ts`'s
  (`buildTree` + `squash`): a path list becomes nested nodes, and single-child
  directory chains fold into one label.  That is the same for a case's files,
  a run's `design/` sheets and, when the Streams navigator moves here, its
  streams.  What DIFFERS per caller is the LOOK -- which colour a node takes,
  which glyph, whether a badge says "run output" -- and the ORDER of a node's
  children.  Both are decided by the caller through two hooks with the case
  tree's own behaviour as the default, so CaseWorkspace renders byte for byte
  what it rendered before and a second caller supplies two small functions
  rather than a second component.

  The case default is `caseLook` / `caseOrder` below: colour, weight and glyph
  follow the node's KIND (`caseTree.kindOf`, the one home), and a state view
  draws its stream files BEFORE its `internalStates/` root -- the boundary of
  the snapshot first, then what sits between the boundary streams.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { ActionIcon, Badge, Group, Stack, Text, Tooltip } from "@mantine/core";
import { IconBox, IconChevronDown, IconChevronRight, IconSitemap } from "@tabler/icons-react";

import {
  RUN_OUTPUT_HINT, buildTree, nodeKind, squash, sortedChildren, type TreeNode,
} from "./caseTree.js";

/** How one directory node is drawn.  `glyph` names a fixed icon rather than
 *  taking a React node, so a look stays a plain value a test can compare. */
export interface NodeLook {
  colour: string;
  weight: 400 | 500 | 600 | 700;
  glyph?: "sector" | "interior";
  /** A badge beside the label, with its tooltip; the case tree uses it for
   *  "run output" on a top-level view the solver rewrites. */
  badge?: { text: string; hint: string };
}

export type LookOf = (node: TreeNode, depth: number) => NodeLook;
/** A node's children in render order, in two groups: those drawn BEFORE the
 *  node's own leaves and those drawn AFTER. */
export type OrderOf = (node: TreeNode) => { before: TreeNode[]; after: TreeNode[] };

export const caseLook: LookOf = (node, depth) => {
  const kind = nodeKind(node);
  const colour = kind === "declared" ? "yellow" : kind === "state0" ? "yellow.3"
               : kind === "sector" ? "accent" : "dimmed";
  const weight = kind === "output" || kind === "interior" ? 400
               : kind === "state0" ? 500 : 600;
  const look: NodeLook = { colour, weight };
  if (kind === "sector") look.glyph = "sector";
  if (kind === "interior") look.glyph = "interior";
  if (kind === "output" && depth === 0) look.badge = { text: "run output", hint: RUN_OUTPUT_HINT };
  return look;
};

/*  A STATE VIEW READS BOUNDARY FIRST.  Its stream FILES are the boundary of
    the snapshot and `internalStates/` is what sits between them, so that root
    is drawn after the leaves -- every other kind of child still comes first. */
export const caseOrder: OrderOf = (node) => {
  const kids = sortedChildren(node);
  return {
    before: kids.filter((k) => nodeKind(k) !== "interior"),
    after: kids.filter((k) => nodeKind(k) === "interior"),
  };
};

const INTERIOR_HINT =
  "What each unit holds inside it at this state -- one file per unit, a block "
  + "per kind (stage profile, axial profile, size distribution). Copy a file "
  + "into 0/internalStates/ at the same address to declare the interior the "
  + "next run starts from.";

export function FileTree({
  files, active, onSelect, title = "Files", lessonFirst = true,
  look = caseLook, order = caseOrder,
}: {
  files: string[];
  active: string | null;
  onSelect: (path: string) => void;
  /** The small uppercase heading above the tree; "" draws none. */
  title?: string;
  /** Draw a root README.md before everything else (a case's lesson). */
  lessonFirst?: boolean;
  look?: LookOf;
  order?: OrderOf;
}) {
  const tree = useMemo(() => squash(buildTree(files)), [files]);
  const isLesson = (f: string) => lessonFirst && /^README\.md$/i.test(f);

  //  All expanded by default.  Keyed on the full prefix, never on the
  //  segment: keying on the segment folded a case's `system/` and a
  //  sector's `system/` together (name identity, applied to a UI).
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (k: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });

  const renderLeaf = (f: string, depth: number) => {
    const isActive = f === active;
    const leaf = f.includes("/") ? f.slice(f.lastIndexOf("/") + 1) : f;
    return (
      <Group
        key={f}
        gap={6}
        wrap="nowrap"
        style={{
          cursor: "pointer",
          padding: "2px 8px 2px 0",
          paddingLeft: 26 + depth * 12,
          background: isActive ? "light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-5))" : undefined,
          borderLeft: isActive
            ? "2px solid var(--mantine-color-accent-3)"
            : "2px solid transparent",
        }}
        onClick={() => onSelect(f)}
      >
        <Text
          size="xs"
          ff="monospace"
          c={isActive ? "accent" : "var(--mantine-color-text)"}
          style={{ wordBreak: "break-all" }}
        >
          {leaf}
        </Text>
      </Group>
    );
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const isCollapsed = collapsed.has(node.prefix);
    const l = look(node, depth);
    const { before, after } = order(node);
    return (
      <Stack key={node.prefix} gap={0} mb={depth === 0 ? 4 : 0}>
        <Group
          gap={4}
          wrap="nowrap"
          style={{ cursor: "pointer", padding: "4px 4px 2px", paddingLeft: 4 + depth * 12 }}
          onClick={() => toggle(node.prefix)}
        >
          <ActionIcon
            variant="transparent"
            size="xs"
            c="dimmed"
            onClick={(e) => { e.stopPropagation(); toggle(node.prefix); }}
          >
            {isCollapsed ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}
          </ActionIcon>
          {l.glyph === "sector" && <IconSitemap size={11} style={{ opacity: 0.8, flex: "none" }} />}
          {l.glyph === "interior" && (
            <Tooltip label={INTERIOR_HINT} withArrow>
              <IconBox size={11} style={{ opacity: 0.8, flex: "none", cursor: "help" }} />
            </Tooltip>
          )}
          <Text size="xs" c={l.colour} fw={l.weight} ff="monospace">
            {node.label}/
          </Text>
          {l.badge && (
            <Tooltip label={l.badge.hint} withArrow>
              <Badge size="xs" variant="light" color="gray" style={{ textTransform: "none", cursor: "help" }}>
                {l.badge.text}
              </Badge>
            </Tooltip>
          )}
        </Group>
        {!isCollapsed && (
          <>
            {before.map((k) => renderNode(k, depth + 1))}
            {node.leaves.map((f) => renderLeaf(f, depth + 1))}
            {after.map((k) => renderNode(k, depth + 1))}
          </>
        )}
      </Stack>
    );
  };

  return (
    <Stack gap={0} p="xs">
      {title && (
        <Text size="xs" c="dimmed" tt="uppercase" mb={6}
          style={{ letterSpacing: 0.5, fontWeight: 600 }}>
          {title}
        </Text>
      )}
      {/*  The lesson first: a root README.md is what a student reads before
          anything else.  Then the folders, then the other root files.  */}
      {tree.leaves.filter(isLesson).map((f) => renderLeaf(f, 0))}
      {order(tree).before.map((k) => renderNode(k, 0))}
      {tree.leaves.filter((f) => !isLesson(f)).map((f) => renderLeaf(f, 0))}
      {order(tree).after.map((k) => renderNode(k, 0))}
    </Stack>
  );
}
