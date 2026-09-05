/*  THE CASE TREE, AS DATA.
 *
 *  Pure functions that turn the flat list of case-relative paths the Case
 *  workspace holds (authored files + harvested run outputs) into a nested
 *  tree, and squash single-child directory chains.  Kept out of the React
 *  component so the shape can be TESTED without rendering anything -- until
 *  2026-09-05 nothing pinned how the tree grouped, and the grouping was wrong
 *  in a way no test could have said (two levels, everything deeper drawn as
 *  one row with slashes in it).
 *
 *  The paths are the truth; this module never invents a level and never
 *  drops one.  A file with no slash is a ROOT leaf.  `.cho` markers are
 *  skipped (the openable entity is the folder, and the marker is empty).
 */

export type TreeNode = {
  /** full path prefix of this node, e.g. "sectors/BRINE" -- the collapse key */
  prefix: string;
  /** the label to draw: one segment, or a joined chain after squash() */
  label: string;
  children: Map<string, TreeNode>;
  /** files that live directly in this node (full paths) */
  leaves: string[];
};

export function buildTree(files: string[]): TreeNode {
  const root: TreeNode = { prefix: "", label: "", children: new Map(), leaves: [] };
  for (const f of files) {
    if (f.endsWith(".cho")) continue;
    const parts = f.split("/");
    if (parts.length === 1) { root.leaves.push(f); continue; }
    let node = root;
    //  `parts.length >= 2` here, so every index below the last is a segment;
    //  the `?? ""` satisfies noUncheckedIndexedAccess without a non-null
    //  assertion, and an empty segment (a doubled slash) is never produced by
    //  the engine's writers -- it would build a folder named "" and be seen.
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i] ?? "";
      let next = node.children.get(seg);
      if (!next) {
        next = {
          prefix: node.prefix ? node.prefix + "/" + seg : seg,
          label: seg,
          children: new Map(),
          leaves: [],
        };
        node.children.set(seg, next);
      }
      node = next;
    }
    node.leaves.push(f);
  }
  return root;
}

/*  A chain of single-child, file-less directories is one label.
 *  `sectors` -> `BRINE` with nothing else in `sectors/` reads better as
 *  `sectors/BRINE`: vertical space spent on a choice the reader does not
 *  have.  Applied AFTER buildTree so `prefix` (the collapse key and the sort
 *  key) stays the REAL path of the deepest folder in the chain -- the label
 *  is presentation, the prefix is identity.  The root is never squashed:
 *  a case with a single top-level folder still shows that folder.  */
export function squash(node: TreeNode, isRoot = true): TreeNode {
  const kids = Array.from(node.children.values()).map((k) => squash(k, false));
  node.children = new Map(kids.map((k) => [k.label, k]));
  const only = kids[0];
  if (!isRoot && node.leaves.length === 0 && kids.length === 1 && only) {
    return {
      prefix: only.prefix,
      label: node.label + "/" + only.label,
      children: only.children,
      leaves: only.leaves,
    };
  }
  return node;
}

/*  THE KIND OF A DIRECTORY -- one home (2026-09-05).
 *
 *  A case directory is one of four kinds, and until today the tree drew three
 *  of them in one colour, sorted alphabetically together: on the flagship
 *  plant `converged/` sat between two sectors and read as a fifth sector, and
 *  nothing told a student which folders the RUN writes (and overwrites) and
 *  which they author.  The code KNEW -- the worker harvests exactly the run
 *  outputs, the workspace merges them from their own result fields -- and the
 *  fact was thrown away before drawing.  It lived in five places
 *  (worker list, two result fields, the workspace merge, CaseIntro's own
 *  positive keep-list) and in none of them as a classification.  This is it.
 *
 *    declared  system/ constant/        what the case DECLARES (dicts)
 *    state0    0/                        the authored initial state
 *    sector    any other folder          a sub-case: its own system/ 0/ ...
 *    output    converged/ design/ ...    written by the solver on EVERY run
 *
 *  Kind is decided on the PATH, never on a squashed label: everything under
 *  an output root is output (`converged/CONCENTRATION` squashes into one
 *  label, and its kind must still be output); everything under `0/` is
 *  initial state; otherwise the node's own name decides.  The ontology is
 *  docs/architecture/stream-state-architecture.md §2.  */
export type NodeKind = "declared" | "state0" | "sector" | "output";

/*  Every directory the ENGINE writes as run output (stream-state-architecture
 *  §2).  The worker's OUTPUT_ROOTS harvests the subset MEMFS produces today
 *  (converged, design); this list classifies everything the DISK can hold, so
 *  a case opened from a folder with `iterations/` draws it dimmed too.
 *  caseTree.test.ts pins that the worker's list is a subset of this one.  */
export const RUN_OUTPUT_ROOTS: readonly string[] =
  ["converged", "design", "iterations", "economics", "postProcessing"];

const isInstant = (seg: string) => /^\d+(\.\d+)?$/.test(seg);   // 0.01/ 0.02/ ... transient snapshots

export function kindOf(prefix: string): NodeKind {
  const segs = prefix.split("/");
  const first = segs[0] ?? "";
  if (RUN_OUTPUT_ROOTS.includes(first)) return "output";
  if (first === "0") return "state0";
  if (isInstant(first)) return "output";
  const last = segs[segs.length - 1] ?? "";
  if (last === "system" || last === "constant") return "declared";
  if (last === "0") return "state0";
  return "sector";
}

/*  The reading order a student needs: what the case DECLARES (system/, then
 *  constant/), the SECTORS it is made of, and then the VIEWS of that same
 *  geography -- 0/ first (the state before solving, and the one view the
 *  student authors), then what the RUN produced.  0/ moved from beside the
 *  declared dicts to the head of the views on 2026-09-05 (Vitor, with a
 *  reading he brought from ChatGPT): the views repeat the plant's geography
 *  and read best adjacent; colour, not position, says which of them is
 *  authored.  By kind, then by name; every depth; from the node's PATH.  */
/*  A node's OWN kind -- decided on its first own segment, never on a squashed
 *  tail.  `squash()` joins `DRYING` + `system` into the label `DRYING/system`
 *  with prefix `DRYING/system`; read from the tail that node is "declared"
 *  and sorts FIRST at the root, above `system/` itself -- the sector vanishes
 *  into a yellow line (found by the ordering test on 2026-09-05).  The node
 *  drawn at this depth IS `DRYING`, so its kind is kindOf("DRYING"): the
 *  prefix up to and including the first segment of its label.  */
export function nodeKind(node: TreeNode): NodeKind {
  const head = node.label.split("/")[0] ?? node.label;
  const own = node.prefix.slice(0, node.prefix.length - node.label.length) + head;
  return kindOf(own);
}

export function rankNode(node: TreeNode): number {
  const k = nodeKind(node);
  if (k === "declared") return (node.label.split("/")[0] ?? "") === "system" ? 0 : 1;
  return k === "sector" ? 2 : k === "state0" ? 3 : 4;
}

export function sortedChildren(node: TreeNode): TreeNode[] {
  return Array.from(node.children.values())
    .sort((a, b) => rankNode(a) - rankNode(b) || a.label.localeCompare(b.label));
}
