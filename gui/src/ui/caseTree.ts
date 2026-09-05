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

/*  The reading order a student needs first: what the case DECLARES
 *  (system/, constant/), then everything else alphabetically -- sectors and
 *  run outputs alike, by name.  Applied at every depth by the same rule.  */
export function rankLabel(label: string): number {
  return label === "system" ? 0 : label === "constant" ? 1 : 2;
}

export function sortedChildren(node: TreeNode): TreeNode[] {
  return Array.from(node.children.values())
    .sort((a, b) => rankLabel(a.label) - rankLabel(b.label) || a.label.localeCompare(b.label));
}
