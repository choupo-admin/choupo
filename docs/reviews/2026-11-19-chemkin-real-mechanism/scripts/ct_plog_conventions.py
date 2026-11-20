import cantera as ct
print(ct.__version__)
yaml='''
phases:
- name: g
  thermo: ideal-gas
  elements: [H]
  species: [H2, H]
  kinetics: gas
  reactions: all
  state: {T: 300, P: 1 atm}
species:
- name: H2
  composition: {H: 2}
  thermo: {model: constant-cp, T0: 298.15, h0: 0, s0: 130, cp0: 29000}
- name: H
  composition: {H: 1}
  thermo: {model: constant-cp, T0: 298.15, h0: 217e6, s0: 114e3, cp0: 20800}
reactions:
- equation: H2 => H + H
  type: pressure-dependent-Arrhenius
  rate-constants:
  - {P: 0.1 atm, A: 1.0e10, b: 0, Ea: 0}
  - {P: 1 atm, A: 2.0e10, b: 0, Ea: 0}
  - {P: 1 atm, A: 3.0e10, b: 0, Ea: 0}
  - {P: 10 atm, A: 1.0e12, b: 0, Ea: 0}
'''
g=ct.Solution(yaml=yaml)
for P in [0.01,0.1,0.3162277660168379,1.0,3.1622776601683795,10,100]:
    g.TPX=1000,P*101325,'H2:1'
    print(P, g.forward_rate_constants[0])
