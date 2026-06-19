import math
# Faithful single 1:1 aqueous-salt eNRTL per IDAES enrtl.py (Eqns 25-27,44,69,70).
NA=6.02214076e23; e=1.602176634e-19; kB=1.380649e-23; eps0=8.8541878128e-12
T=298.15; vmol=1.807e-5; eps=78.45
A_DH=(1/3)*(2*math.pi*NA/vmol)**0.5*(e*e/(4*math.pi*eps*eps0*kB*T))**1.5
rho=14.9
tau_m_ca=8.885; tau_ca_m=-4.549; al=0.2     # water<->NaCl (Chen&Evans)

sp=['m','c','a']; mol={'m'}; cat={'c'}; an={'a'}; ion={'c','a'}
# G dict (Eqns 23,38-43 for single salt)
Gcm=math.exp(-al*tau_ca_m); Gmc=math.exp(-al*tau_m_ca)
G={i:{j:1.0 for j in sp} for i in sp}
G['c']['m']=Gcm; G['a']['m']=Gcm; G['m']['c']=Gmc; G['m']['a']=Gmc
G['c']['a']=1.0; G['a']['c']=1.0
# tau dict (Eqn 44 for ion pairs; param for m-m)
tau={i:{j:0.0 for j in sp} for i in sp}
for i in sp:
  for j in sp:
    if i==j: tau[i][j]=0.0
    elif (i in mol and j in mol): tau[i][j]=0.0
    else: tau[i][j]=-math.log(G[i][j])/al

def lc(s,X):
  aqu=sp
  if s in cat or s in an:
    Z=1
    same = cat if s in cat else an   # like-charge set
    opp  = an if s in cat else cat
    t1=0.0
    for m in mol:
      den=sum(X[i]*G[i][m] for i in aqu); num=sum(X[i]*G[i][m]*tau[i][m] for i in aqu)
      t1+= X[m]*G[s][m]/den*(tau[s][m]-num/den)
    aqu_ns=[i for i in aqu if i not in same]
    den2=sum(X[i]*G[i][s] for i in aqu_ns); num2=sum(X[i]*G[i][s]*tau[i][s] for i in aqu_ns)
    t2=num2/den2
    t3=0.0
    for o in opp:
      aqu_no=[i for i in aqu if i not in opp]
      den3=sum(X[i]*G[i][o] for i in aqu_no); num3=sum(X[i]*G[i][o]*tau[i][o] for i in aqu_no)
      t3+= X[o]*G[s][o]/den3*(tau[s][o]-num3/den3)
    return Z*(t1+t2+t3)
  else:  # molecule, Eqn 25
    m=s; den=sum(X[i]*G[i][m] for i in aqu)
    val=sum(X[i]*G[i][m]*tau[i][m] for i in aqu)/den
    for mp in mol:
      if mp==m: continue
    for c in cat:
      aqu_nc=[i for i in sp if i not in cat]
      dd=sum(X[i]*G[i][c] for i in aqu_nc); nn=sum(X[i]*G[i][c]*tau[i][c] for i in aqu_nc)
      val+= X[c]*G[m][c]/dd*(tau[m][c]-nn/dd)
    for a in an:
      aqu_na=[i for i in sp if i not in an]
      dd=sum(X[i]*G[i][a] for i in aqu_na); nn=sum(X[i]*G[i][a]*tau[i][a] for i in aqu_na)
      val+= X[a]*G[m][a]/dd*(tau[m][a]-nn/dd)
    return val

def gpm(msalt):
  nw=1000/18.015; ntot=nw+2*msalt
  X={'m':nw/ntot,'c':msalt/ntot,'a':msalt/ntot}
  Ix=0.5*(X['c']+X['a'])
  Xref={'m':1.0,'c':0.0,'a':0.0}    # unsymmetric: ion in pure water
  def pdh(Ix):
    return -A_DH*((2/rho)*math.log(1+rho*Ix**0.5)+(Ix**0.5-2*Ix**1.5)/(1+rho*Ix**0.5))
  lnc=pdh(Ix)+(lc('c',X)-lc('c',Xref))
  lna=pdh(Ix)+(lc('a',X)-lc('a',Xref))
  gx=math.exp(0.5*(lnc+lna))
  return gx/(1+0.001*18.015*2*msalt)   # mole-fraction -> molality scale

print(f"A_DH={A_DH:.4f}")
lit={0.1:0.778,0.5:0.681,1.0:0.657,2.0:0.668,3.0:0.714,6.0:0.986}
aad=0
print("  m     eNRTL   lit    err%")
for m,g in lit.items():
  v=gpm(m); pe=100*(v-g)/g; aad+=abs(pe); print(f"  {m:4.1f}  {v:.4f}  {g:.4f}  {pe:+.1f}")
print(f"  AAD={aad/len(lit):.1f}%")

# --- water activity + osmotic coefficient (molecule branch, Eqn 25 + PDH Eqn 69) ---
def lc_mol(X):   # Eqn 25 for the single molecule m=0 ; mp loop empty (single solvent)
    aqu=sp; m='m'
    den=sum(X[i]*G[i][m] for i in aqu)
    val=sum(X[i]*G[i][m]*tau[i][m] for i in aqu)/den
    for mp in mol:                      # INCLUDES mp=m (the self-term ~cancels term1)
        dd=sum(X[i]*G[i][mp] for i in aqu); nn=sum(X[i]*G[i][mp]*tau[i][mp] for i in aqu)
        val+= X[mp]*G[m][mp]/dd*(tau[m][mp]-nn/dd)
    for c in cat:
        aqu_nc=[i for i in sp if i not in cat]
        dd=sum(X[i]*G[i][c] for i in aqu_nc); nn=sum(X[i]*G[i][c]*tau[i][c] for i in aqu_nc)
        val+= X[c]*G[m][c]/dd*(tau[m][c]-nn/dd)
    for a in an:
        aqu_na=[i for i in sp if i not in an]
        dd=sum(X[i]*G[i][a] for i in aqu_na); nn=sum(X[i]*G[i][a]*tau[i][a] for i in aqu_na)
        val+= X[a]*G[m][a]/dd*(tau[m][a]-nn/dd)
    return val

def a_w(msalt):
    nw=1000/18.015; ntot=nw+2*msalt
    X={'m':nw/ntot,'c':msalt/ntot,'a':msalt/ntot}; xw=X['m']
    Ix=0.5*(X['c']+X['a'])
    pdh_m=2*A_DH*Ix**1.5/(1+rho*Ix**0.5)
    lng_w=pdh_m+lc_mol(X)
    return math.exp(lng_w)*xw

def phi(msalt):
    aw=a_w(msalt)
    return -math.log(aw)*1000/(2*msalt*18.015)

print("\n  osmotic coefficient phi (eNRTL vs lit, NaCl 25C):")
litphi={0.1:0.932,0.5:0.921,1.0:0.936,2.0:0.984,3.0:1.045,6.0:1.271}
aad=0
for m,p in litphi.items():
    e=phi(m); pe=100*(e-p)/p; aad+=abs(pe); print(f"  m={m:4.1f}  eNRTL={e:.4f}  lit={p:.4f}  {pe:+.1f}%")
print(f"  phi AAD = {aad/len(litphi):.1f}%")
