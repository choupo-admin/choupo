"""Value and slope jump of every two-range heat-capacity law at its joint.
Usage: python3 joints.py <repo>"""
import sys,os,glob,statistics
sys.path.insert(0,os.path.dirname(__file__))
from dictparse import parse_file, Block
repo=sys.argv[1]
def num(x): return float(x)
rows=[]
for f in sorted(glob.glob(repo+'/data/standards/components/*.dat')):
    t=parse_file(f)
    for blk in ('idealGasHeatCapacity','liquidHeatCapacity','solidHeatCapacity'):
        b=t.get(blk)
        if not isinstance(b,Block): continue
        m=b.get('model')
        if not m or m[0] not in ('NASA9','NASA7'): continue
        model=m[0]
        lo=[num(x) for x in b.get('low') if x not in '()']
        hi=[num(x) for x in b.get('high') if x not in '()']
        Tc=num(b.get('Tcommon')[0]) if b.get('Tcommon') else 1000.0
        if model=='NASA9':
            cp=lambda a,T: a[0]/T**2+a[1]/T+a[2]+a[3]*T+a[4]*T**2+a[5]*T**3+a[6]*T**4
            dcp=lambda a,T: -2*a[0]/T**3-a[1]/T**2+a[3]+2*a[4]*T+3*a[5]*T**2+4*a[6]*T**3
        else:
            cp=lambda a,T: a[0]+a[1]*T+a[2]*T**2+a[3]*T**3+a[4]*T**4
            dcp=lambda a,T: a[1]+2*a[2]*T+3*a[3]*T**2+4*a[4]*T**3
        cl,ch=cp(lo,Tc),cp(hi,Tc); sl,sh=dcp(lo,Tc),dcp(hi,Tc)
        dv=(ch-cl)/cl
        ds_rel = (sh-sl)/abs(sl) if sl!=0 else float('inf')
        ds_log = (sh-sl)*Tc/cl      # jump of d ln Cp / d ln T
        rows.append((os.path.basename(f)[:-4],blk,model,Tc,cl,dv,sl,sh,ds_rel,ds_log))
print(f"{'record':14s} {'block':22s} {'model':6s} {'Tcom':>6s} {'Cp/R':>8s} {'dValue_rel':>11s} {'slope_lo':>10s} {'slope_hi':>10s} {'dSlope_rel':>10s} {'d(dlnCp/dlnT)':>13s}")
for r in rows: print(f"{r[0]:14s} {r[1]:22s} {r[2]:6s} {r[3]:6.0f} {r[4]:8.4f} {r[5]:11.2e} {r[6]:10.3e} {r[7]:10.3e} {r[8]:10.2%} {r[9]:13.2e}")
dv=[abs(r[5]) for r in rows]; ds=[abs(r[8]) for r in rows]; dl=[abs(r[9]) for r in rows]
print(f"\nN={len(rows)}  |dValue| max={max(dv):.2e} median={statistics.median(dv):.2e} n>1e-6={sum(x>1e-6 for x in dv)} n>1e-4={sum(x>1e-4 for x in dv)}")
print(f"|dSlope|/|slope_lo|: max={max(ds):.1%} median={statistics.median(ds):.2%} n>1%={sum(x>0.01 for x in ds)} n>5%={sum(x>0.05 for x in ds)} n>10%={sum(x>0.10 for x in ds)}")
print(f"|jump of dlnCp/dlnT|: max={max(dl):.2e} median={statistics.median(dl):.2e}")
nine=[r for r in rows if r[2]=='NASA9']; ds9=[abs(r[8]) for r in nine]
print(f"NASA9 only N={len(nine)}: slope median={statistics.median(ds9):.2%} max={max(ds9):.1%} n>1%={sum(x>0.01 for x in ds9)}")
