# usage: scan_forms.py <repo-root> <scratch-dir>
import sys, re, collections
root, out = sys.argv[1], sys.argv[2]
sys.path.insert(0, root + "/bin/curate")
import source_headers_kinds as K
LEAD = re.compile(r"^\s*(#|//|/\*|\*|\\\*|\||REM\b|rem\b|::)")
forms = collections.Counter(); prose = []; years = collections.Counter()
for p, c, d in K.classify_all():
    if c != "code": continue
    raw = K.read_head(p); t = K.head_text(raw)
    lines = t.split("\n")
    m = K.COPY_RE.search(t)
    cl = [l for l in lines if "Copyright (C)" in l or "Copyright (c)" in l]
    sl = [l for l in lines if "SPDX-License-Identifier" in l]
    okc = any(LEAD.match(l) for l in cl); oks = any(LEAD.match(l) and "GPL-3.0-or-later" in l for l in sl)
    if not okc or not oks:
        prose.append((p, d, okc, oks))
    for mm in K.COPY_RE.finditer(t):
        forms[(mm.group(1), mm.group(2), mm.group(3).strip())] += 1
open(out + "/not_in_comment.tsv", "w").write("".join("%s\t%s\tcopyright_in_comment=%s\tspdx_in_comment=%s\n" % r for r in prose))
for k, v in forms.most_common(): print(v, k)
print("files whose notice is not on a comment-led line:", len(prose))
for r in prose: print(" ", r)
