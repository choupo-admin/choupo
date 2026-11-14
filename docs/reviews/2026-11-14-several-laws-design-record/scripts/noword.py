import sys,os,glob,re
sys.path.insert(0,os.path.dirname(__file__))
from dictparse import parse_file, parse, Block
repo=sys.argv[1]
files=glob.glob(repo+'/tutorials/**/constant/thermoPhysPropDict',recursive=True)+glob.glob(repo+'/tutorials/**/system/flowsheetDict',recursive=True)
hits=[]
def walk(b,path,f):
    for k,v,l in b.entries:
        if isinstance(v,Block):
            p=path+[k]
            if 'transport' in p:
                i=p.index('transport'); sub=p[i+1:]
                if sub in (['liquid','viscosity'],['liquid','thermalConductivity'],['interface','surfaceTension'],['liquid','diffusivity'],['liquidViscosity'],['surfaceTension'],['liquidConductivity']) and 'model' not in v.keys():
                    hits.append((f.split('/tutorials/')[1],'.'.join(sub),v.keys()))
            walk(v,p,f)
for f in files: walk(parse_file(f),[],f)
# propsDict: regex on op-level thermo blocks
for f in glob.glob(repo+'/tutorials/**/system/propsDict',recursive=True):
    s=open(f).read()
    for m in re.finditer(r'(viscosity|thermalConductivity|surfaceTension)\s*\{([^{}]*)\}',s):
        if 'model' not in m.group(2): hits.append((f.split('/tutorials/')[1],m.group(1),m.group(2).strip()[:60]))
for h in hits: print(h)
print(len(hits))
