# usage: setdiff.py <repo-root> <scratch-dir>
import sys, fnmatch, tomllib, collections, re
root, out = sys.argv[1], sys.argv[2]
sys.path.insert(0, root + "/bin/curate")
import source_headers_kinds as K
reuse = tomllib.load(open(root + "/REUSE.toml", "rb"))
def reuse_glob(g, p):
    # REUSE: '*' does not cross '/', '**' does
    rx = "^" + re.escape(g).replace(r"\*\*", "\x00").replace(r"\*", "[^/]*").replace("\x00", ".*") + "$"
    return re.match(rx, p) is not None
pats = [g for a in reuse["annotations"] for g in a["path"]]
rows = K.classify_all()
tracked = [p for p, _, _ in rows]
unmatched = [g for g in pats if not any(reuse_glob(g, p) for p in tracked)]
print("REUSE.toml paths matching no tracked file:", unmatched)
cnt = collections.Counter(); none = []; exc_not_ann = collections.Counter()
for p, c, d in rows:
    ann = any(reuse_glob(g, p) for g in pats)
    if c == "code": cnt["code"] += 1; continue
    if c == "excluded":
        cnt["excluded:" + d] += 1
        if d == "no-comment-data" and not ann: exc_not_ann[p.rsplit(".",1)[-1]] += 1
        continue
    if ann: cnt["annotated-only(" + c + ")"] += 1; continue
    cnt[c + ":" + d] += 1
    if K.in_code_root(p): none.append(p)
for k, v in sorted(cnt.items()): print("%6d %s" % (v, k))
print("no-comment-data excluded but NOT annotated in REUSE.toml, by extension:", dict(exc_not_ann))
print("under a code root and in none of code/excluded/annotated:", none)
rootfiles = [p for p, c, d in rows if d == "root file"]
print("root files (scoped-out, not examined):", rootfiles)
