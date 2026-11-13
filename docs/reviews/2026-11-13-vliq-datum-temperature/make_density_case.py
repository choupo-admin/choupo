#!/usr/bin/env python3
"""Write a minimal choupoProps case asking the engine for the pure-liquid
density rho_liquid_<component> at a list of temperatures (one propertyPoint
operation per temperature), on an ideal-liquid / ideal-gas package.

usage: make_density_case.py CASE_DIR COMPONENT T1[,T2,...] [P_Pa]
Run it with  choupoProps -case CASE_DIR  (or runCase CASE_DIR).
"""
import os, sys


def main():
    case, comp, Ts = sys.argv[1:4]
    P = sys.argv[4] if len(sys.argv) > 4 else '101325'
    os.makedirs(os.path.join(case, 'system'), exist_ok=True)
    os.makedirs(os.path.join(case, 'constant'), exist_ok=True)
    open(os.path.join(case, os.path.basename(case.rstrip('/')) + '.cho'), 'w').close()
    with open(os.path.join(case, 'system', 'controlDict'), 'w') as f:
        f.write('application  choupoProps;\ndescription  "review probe: liquid density of %s";\n'
                'verbosity    2;\n' % comp)
    with open(os.path.join(case, 'constant', 'thermoPhysPropDict'), 'w') as f:
        f.write('recordType    thermophysicalPropertySystem;\nschemaVersion 2;\n'
                'components    ( %s );\nequilibrium\n{\n    formulation gammaPhi;\n'
                '    liquid  { activityModel { model ideal; } }\n'
                '    vapour  { fugacityModel idealGas; }\n}\n' % comp)
    ops = []
    for i, T in enumerate(Ts.split(',')):
        ops.append('    {\n        name  T%d;\n        type  propertyPoint;\n'
                   '        state { T %s K; P %s Pa; composition { %s 1.0; } }\n'
                   '        properties ( rho_liquid_%s );\n    }\n' % (i, T, P, comp, comp))
    with open(os.path.join(case, 'system', 'propsDict'), 'w') as f:
        f.write('operations\n(\n' + ''.join(ops) + ');\n')


if __name__ == '__main__':
    main()
