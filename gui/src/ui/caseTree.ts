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
 *    interior  <view>/<SECTOR>/<unit>/   what ONE unit holds inside it
 *
 *  Kind is decided on the PATH, never on a squashed label: everything under
 *  an output root is output (`converged/CONCENTRATION` squashes into one
 *  label, and its kind must still be output); everything under `0/` is
 *  initial state; otherwise the node's own name decides.  The ontology is
 *  docs/architecture/stream-state-architecture.md §2.
 *
 *  A STATE VIEW CARRIES ITS UNIT INTERIORS (2026-09-06).  In a state view a
 *  FILE is a stream and a DIRECTORY is a unit's interior -- except the
 *  SECTOR levels, which the view repeats from the case's own geography.  So
 *  the two cannot be told apart from a path alone: `converged/CONCENTRATION`
 *  is a sector of the flagship and `converged/column01` is a unit of the flat
 *  column, and nothing in either string says which.  The GEOGRAPHY is the
 *  discriminator, and it is a fact the caller holds -- the case's own
 *  top-level sector folders -- so it is PASSED IN.  Called without it,
 *  `kindOf` classifies exactly as it did before this rule existed: every
 *  level of a view is the view's kind.  That is deliberate: guessing a unit
 *  interior from a name would be name identity, and defaulting the other way
 *  would silently relabel every sector of every fractal case.  */
export type NodeKind = "declared" | "state0" | "sector" | "output" | "interior";

/*  Every directory the ENGINE writes as run output (stream-state-architecture
 *  §2).  The worker's OUTPUT_ROOTS harvests the subset MEMFS produces today
 *  (converged, design); this list classifies everything the DISK can hold, so
 *  a case opened from a folder with `iterations/` draws it dimmed too.
 *  caseTree.test.ts pins that the worker's list is a subset of this one.  */
export const RUN_OUTPUT_ROOTS: readonly string[] =
  ["converged", "design", "iterations", "economics", "postProcessing"];

const isInstant = (seg: string) => /^\d+(\.\d+)?$/.test(seg);   // 0.01/ 0.02/ ... transient snapshots

/*  The case's OWN geography: the top-level folders that are sectors, as
 *  case-root-relative paths ("MAIN", "CONCENTRATION", "A/B" for a nested
 *  one).  Derived from the same `kindOf` this file exports, so "what is a
 *  sector" has ONE definition and a view is classified against the case it is
 *  a view OF.  Empty for a flat case -- which is exactly right: every
 *  directory in a flat case's state view IS a unit interior.  */
export function sectorPaths(files: string[]): Set<string> {
  const out = new Set<string>();
  for (const f of files) {
    const parts = f.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join("/");
      if (kindOf(dir) === "sector") out.add(dir);
    }
  }
  return out;
}

export function kindOf(prefix: string, sectors?: ReadonlySet<string>): NodeKind {
  const segs = prefix.split("/");
  const first = segs[0] ?? "";
  //  `0` is BOTH a numeric name and the authored state view, and the authored
  //  reading wins -- `isInstant` must never see it (the transient instants are
  //  `0.01/ 50/ 1000/`, and `0/` is the one a student writes).
  const view = first === "0" ? "state0"
             : RUN_OUTPUT_ROOTS.includes(first) || isInstant(first) ? "output"
             : null;
  if (view) {
    //  Inside a state view.  Without the case's geography every level is the
    //  view's own kind (the pre-2026-09-06 answer, and the safe one).  With
    //  it, the first level that the case does NOT declare as a sector names a
    //  UNIT, and that directory -- and everything under it -- is its interior.
    if (sectors && segs.length > 1) {
      const rest = segs.slice(1).join("/");
      if (!sectors.has(rest)) return "interior";
    }
    return view;
  }
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
export function nodeKind(node: TreeNode, sectors?: ReadonlySet<string>): NodeKind {
  const head = node.label.split("/")[0] ?? node.label;
  const own = node.prefix.slice(0, node.prefix.length - node.label.length) + head;
  return kindOf(own, sectors);
}

export function rankNode(node: TreeNode, sectors?: ReadonlySet<string>): number {
  const k = nodeKind(node, sectors);
  if (k === "declared") return (node.label.split("/")[0] ?? "") === "system" ? 0 : 1;
  //  A unit interior sorts LAST, after the streams of its own sector: the
  //  boundary of a state view is read before what sits between the boundaries.
  return k === "sector" ? 2 : k === "state0" ? 3 : k === "output" ? 4 : 5;
}

export function sortedChildren(node: TreeNode, sectors?: ReadonlySet<string>): TreeNode[] {
  return Array.from(node.children.values())
    .sort((a, b) => rankNode(a, sectors) - rankNode(b, sectors)
                 || a.label.localeCompare(b.label));
}
