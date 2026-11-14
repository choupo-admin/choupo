"""Find provenance-like entries (a sub-block declaring `origin`) and classify where they sit.
Usage: python3 misplaced.py <repo> [glob-relative-to-repo]"""
import sys,os,glob,collections
sys.path.insert(0,os.path.dirname(__file__))
from dictparse import parse_file, Block
repo=sys.argv[1]; pat=sys.argv[2] if len(sys.argv)>2 else 'data/standards/components/*.dat'
parents=collections.Counter(); found=[]
def walk(b,path,f):
    for k,v,l in b.entries:
        if isinstance(v,Block):
            if 'origin' in v.keys():
                parents['/'.join(path) or '<top>']+=1
                found.append((f,'/'.join(path),k,l))
            walk(v,path+[k],f)
for f in sorted(glob.glob(os.path.join(repo,pat),recursive=True)):
    walk(parse_file(f),[],os.path.relpath(f,repo))
for p,c in parents.most_common(): print(f"{c:6d}  parent={p}")
# misplaced: parent path not ending in 'provenance' and parent is cosmo/pcsaft (or child of a set)
mis=[x for x in found if x[1] and x[1].split('/')[0] in ('cosmo','pcsaft')]
print('\nentries with origin directly under cosmo/pcsaft or deeper:',len(mis))
c=collections.Counter((x[1],x[2]) for x in mis)
for k,v in c.most_common(): print(v,k)
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'misplaced.tsv'),'w') as fh:
    for x in mis: fh.write('\t'.join(map(str,x))+'\n')
