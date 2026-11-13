# usage: scan_comments.py <repo-root> <scratch-dir>
# For every code file the gate passes, is the copyright line naming an AUTHORS
# person, and the SPDX identifier, inside a COMMENT (not a string/docstring/code)?
import sys, re
root, out = sys.argv[1], sys.argv[2]
sys.path.insert(0, root + "/bin/curate")
import source_headers_kinds as K
def c_spans(t):
    spans=[]; i=0; n=len(t); st=None
    while i<n:
        ch=t[i]
        if st:
            if ch=="\\": i+=2; continue
            if ch==st: st=None
            i+=1; continue
        if t.startswith("/*",i):
            j=t.find("*/",i+2); j=n if j<0 else j+2; spans.append((i,j)); i=j; continue
        if t.startswith("//",i):
            j=t.find("\n",i); j=n if j<0 else j; spans.append((i,j)); i=j; continue
        if ch in "\"'`": st=ch
        i+=1
    return spans
def hash_spans(t, rem=False):
    spans=[]; pos=0
    for ln in t.split("\n"):
        s=ln.lstrip()
        if s.startswith("#") or (rem and (s.upper().startswith("REM") or s.startswith("::"))):
            spans.append((pos, pos+len(ln)))
        pos+=len(ln)+1
    return spans
an=K.authors(); bad=[]
for p,c,d in K.classify_all():
    if c!="code": continue
    t=K.head_text(K.read_head(p))
    syn=K.KINDS[d][1]
    sp = c_spans(t) if syn in ("block","//") else hash_spans(t, syn=="rem")
    inside=lambda pos: any(a<=pos<b for a,b in sp)
    okc=any(inside(m.start()) and K.is_author_name(m.group(3).strip(),an) for m in K.COPY_RE.finditer(t))
    oks=any(inside(m.start()) for m in K.SPDX_RE.finditer(t))
    if not (okc and oks): bad.append((p,d,okc,oks))
open(out+"/notice_not_in_comment.tsv","w").write("path\tkind\tcopyright_in_comment\tspdx_in_comment\n"+"".join("%s\t%s\t%s\t%s\n"%r for r in bad))
print(len(bad)); [print(" ",r) for r in bad]
