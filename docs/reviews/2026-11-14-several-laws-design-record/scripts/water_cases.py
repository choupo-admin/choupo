"""Which cases name water, and which vapour-pressure law their water takes.
Usage: python3 water_cases.py <repo> [csv-out]"""
import sys,os,glob,re,collections
sys.path.insert(0,os.path.dirname(__file__))
from dictparse import parse_file, Block
repo=sys.argv[1]
out=[]
def comps(t):
    c=t.get('components')
    if isinstance(c,list): return [x for x in c if x not in '()']
    return []
for f in sorted(glob.glob(repo+'/tutorials/**/constant/thermoPhysPropDict',recursive=True)):
    casedir=os.path.dirname(os.path.dirname(f))
    rel=os.path.relpath(casedir,repo+'/tutorials')
    try: t=parse_file(f)
    except Exception as e: print('ERR',rel,e); continue
    cl=comps(t)
    inh=t.get('inherits')
    if 'water' not in cl and not inh: continue
    if 'water' not in cl:
        out.append((rel,'sector-inherits-no-list','','')); continue
    pf=t.get('pureFluids')
    pfw=None
    if isinstance(pf,Block) and isinstance(pf.get('water'),Block):
        m=pf.get('water').get('method'); pfw=m[0] if m else '?'
    # locate water record: case-local (own constant/components or nearest ancestor constant/components)
    rec=None; d=casedir
    while d.startswith(repo+'/tutorials'):
        p=os.path.join(d,'constant','components','water.dat')
        if os.path.exists(p): rec=p; break
        d=os.path.dirname(d)
    src='case-local' if rec else 'catalogue'
    if not rec: rec=repo+'/data/standards/components/water.dat'
    w=parse_file(rec); vp=w.get('vaporPressure')
    law=(vp.get('model') or ['?'])[0] if isinstance(vp,Block) else 'none'
    coeffs=' '.join(x for x in (vp.get('coefficients') or []) if x not in '()') if isinstance(vp,Block) else ''
    sealed=os.path.exists(os.path.join(casedir,'constant','propertyManifest'))
    out.append((rel,src+(' sealed' if sealed else ''),('pureFluids:'+pfw) if pfw else law,coeffs))
c=collections.Counter((o[1].split()[0] if o[1] else '',o[2]) for o in out)
for k,v in sorted(c.items()): print(k,v)
print('dicts naming water or inheriting:',len(out))
cc=collections.Counter(o[3] for o in out if o[2]=='Antoine'); print('Antoine coefficient sets:',cc)
if len(sys.argv)>2:
    with open(sys.argv[2],'w') as fh:
        for o in out: fh.write('\t'.join(o)+'\n')
