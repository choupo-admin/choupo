"""Minimal reader of the Choupo/OpenFOAM-style dictionary grammar.
Produces a tree of Block nodes: each Block has .entries = list of (key, value, line)
where value is a Block (sub-dict), or a list of tokens (scalar entry / list)."""
import re
TOK = re.compile(r'"(?:[^"\\]|\\.)*"|[{}();]|[^\s{}();"]+')
def strip_comments(s):
    out=[];i=0;n=len(s)
    while i<n:
        if s.startswith('//',i):
            j=s.find('\n',i); i = n if j<0 else j
        elif s.startswith('/*',i):
            j=s.find('*/',i+2); 
            seg = s[i: (n if j<0 else j+2)]
            out.append('\n'*seg.count('\n')); i = n if j<0 else j+2
        elif s[i]=='"':
            j=i+1
            while j<n and s[j]!='"':
                j+= 2 if s[j]=='\\' else 1
            out.append(s[i:j+1]); i=j+1
        else:
            out.append(s[i]); i+=1
    return ''.join(out)
def tokens(s):
    s=strip_comments(s); line=1; pos=0
    for m in TOK.finditer(s):
        line += s.count('\n',pos,m.start()); pos=m.start()
        yield m.group(0), line
class Block:
    def __init__(self, line=0): self.entries=[]; self.line=line
    def keys(self): return [k for k,_,_ in self.entries]
    def get(self,k):
        for kk,v,_ in self.entries:
            if kk==k: return v
        return None
    def blocks(self): return [(k,v,l) for k,v,l in self.entries if isinstance(v,Block)]
def parse(text):
    toks=list(tokens(text)); i=0
    def parse_block(end, line0):
        nonlocal i
        b=Block(line0); pending=[]
        depth_paren=0
        while i<len(toks):
            t,l=toks[i]
            if t=='}' and depth_paren==0:
                i+=1
                if pending: b.entries.append((pending[0][0],[p for p,_ in pending[1:]],pending[0][1]))
                return b
            if t=='(' : depth_paren+=1; pending.append((t,l)); i+=1; continue
            if t==')' : depth_paren-=1; pending.append((t,l)); i+=1; continue
            if depth_paren>0:
                if t=='{':
                    # dict inside list: skip balanced
                    d=0
                    while i<len(toks):
                        tt,_=toks[i]; pending.append((tt,l)); i+=1
                        if tt=='{': d+=1
                        elif tt=='}':
                            d-=1
                            if d==0: break
                    continue
                pending.append((t,l)); i+=1; continue
            if t=='{':
                i+=1
                key = pending[0][0] if pending else '<anon>'
                kl = pending[0][1] if pending else l
                sub=parse_block('}', l)
                b.entries.append((key,sub,kl)); pending=[]; continue
            if t==';':
                i+=1
                if pending: b.entries.append((pending[0][0],[p for p,_ in pending[1:]],pending[0][1]))
                pending=[]; continue
            pending.append((t,l)); i+=1
        if pending: b.entries.append((pending[0][0],[p for p,_ in pending[1:]],pending[0][1]))
        return b
    return parse_block(None,0)
def parse_file(p):
    with open(p,encoding='utf-8',errors='replace') as f: return parse(f.read())
