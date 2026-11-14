import sys, re
sys.path.insert(0, sys.argv[1] + "/bin/curate")
import check_floor_scale_ratchet as G
from pathlib import Path
root = Path(sys.argv[1]) / "src"
for p in sorted(root.rglob("*")):
    if p.suffix not in (".cpp", ".H", ".h", ".hpp"): continue
    text = p.read_text(errors="replace")
    clean = G.BLOCK.sub(lambda m: "\n" * m.group(0).count("\n"), text)
    for m in G.DIV_MAX.finditer(clean):
        line = clean.count("\n", 0, m.start()) + 1
        args = G.call_args(clean, clean.index("(", m.end() - 1))
        if args is None: continue
        if any(G.is_floor(a) for a in args):
            ln = clean.splitlines()[line - 1]
            if G.COMMENT.match(ln): continue
            print(f"{p.relative_to(root.parent)}:{line}\t{ln.strip()[:150]}")
