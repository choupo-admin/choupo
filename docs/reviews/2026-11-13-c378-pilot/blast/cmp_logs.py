#!/usr/bin/env python3
"""Compare the result JSON of two run logs; print numbers differing beyond rel tol, skipping |x|<atol.
Usage: cmp_logs.py <logA> <logB> [rtol] [atol]"""
import json,re,sys
def js(p):
    m=re.search(r"<<<Choupo:result-begin>>>\n(.*?)\n<<<Choupo:result-end>>>",open(p).read(),re.S); return json.loads(m.group(1))
def flat(o,p=""):
    if isinstance(o,dict):
        for k,v in o.items(): yield from flat(v,f"{p}.{k}")
    elif isinstance(o,list):
        for i,v in enumerate(o): yield from flat(v,f"{p}[{i}]")
    elif isinstance(o,(int,float)) and not isinstance(o,bool): yield p,float(o)
    elif isinstance(o,str): yield p,o
a,b=dict(flat(js(sys.argv[1]))),dict(flat(js(sys.argv[2])))
rt=float(sys.argv[3]) if len(sys.argv)>3 else 1e-9; at=float(sys.argv[4]) if len(sys.argv)>4 else 1e-10
n=0
for k in sorted(set(a)|set(b)):
    x,y=a.get(k),b.get(k)
    if re.search(r"(wall|elapsed|seconds|clock)",k,re.I): continue
    if isinstance(x,str) or isinstance(y,str):
        if x!=y: n+=1; print("STR",k,repr(x)[:120],"|",repr(y)[:120])
        continue
    if x is None or y is None: n+=1; print("MISSING",k,x,y); continue
    if max(abs(x),abs(y))<at: continue
    r=abs(x-y)/max(abs(x),abs(y))
    if r>rt: n+=1; print(f"{k}: {x!r} {y!r} rel {r:.2e}")
print("differences:",n)
