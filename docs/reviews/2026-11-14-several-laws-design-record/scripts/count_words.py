import sys,os,collections,glob
sys.path.insert(0,os.path.dirname(__file__))
from dictparse import parse_file, Block
repo=sys.argv[1]
files=glob.glob(repo+'/tutorials/**/constant/thermoPhysPropDict',recursive=True)
files+=glob.glob(repo+'/tutorials/**/system/flowsheetDict',recursive=True)
files+=glob.glob(repo+'/tutorials/**/system/propsDict',recursive=True)
cnt=collections.Counter(); cases=collections.defaultdict(set)
def walk(b,path,f):
    for k,v,l in b.entries:
        if isinstance(v,Block):
            walk(v,path+[k],f)
        elif k=='model' and 'transport' in path:
            i=path.index('transport'); sub='.'.join(path[i+1:])
            w=v[0] if v else '?'
            key=(sub,w); cnt[key]+=1
            case=f.split('/tutorials/')[1]
            case=case.split('/constant/')[0].split('/system/')[0]
            cases[key].add(case)
for f in files:
    try: walk(parse_file(f),[],f)
    except Exception as e: print('ERR',f,e)
for k in sorted(cnt): print(f"{k[0]:45s} {k[1]:20s} blocks={cnt[k]:3d} caseDirs={len(cases[k])}")
if len(sys.argv)>2:
    for k in sorted(cases):
        if k[1] in sys.argv[2:]: print(k, sorted(cases[k]))
