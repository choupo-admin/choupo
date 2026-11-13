#!/usr/bin/env bash
# Item 8: print the lines the plan cites, from the plan's own tree
# (the remote branch c378-pilot-plan = slice-0 door + main), for reading against the
# plan's claims.  Usage (repository root):
#   bash docs/reviews/2026-11-13-density-pilot-plan/item8_citations.sh [ref] > item8_citations.txt
REMOTE=origin; REF=${1:-$REMOTE/c378-pilot-plan}
show() { # path a b
  echo "===== $1:$2-$3"
  git show "$REF:$(git ls-tree -r --name-only "$REF" | grep -m1 "/$1\$\|^$1\$")" 2>/dev/null | sed -n "$2,$3p"
}
show LiquidPropertyDoor.H 85 93
show PropertyDomainError.H 44 64
show src/thermo/ThermoPackage.cpp 2346 2355
show src/thermo/ThermoPackage.cpp 2427 2430
show src/thermo/ThermoPackage.cpp 2460 2482
show src/thermo/ThermoPackage.cpp 2503 2507
show src/thermo/ThermoPackage.cpp 2539 2546
show LiquidPropertyDoor.cpp 35 39
show LiquidPropertyDoor.cpp 123 150
show ThermoPackageBuilder.cpp 2755 2771
show ThermoPackageBuilder.cpp 2102 2106
show ThermoPackageBuilder.cpp 2580 2584
show src/thermo/ThermoPackage.cpp 2286 2302
show PureFluidModel.H 116 119
show src/thermo/ThermoPackage.cpp 1366 1374
show src/thermo/ThermoPackage.cpp 1398 1412
show src/thermo/ThermoPackage.H 771 775
show IAPWS95.dat 43 43
show IAPWS95.dat 66 66
show SpanWagner1996.dat 20 20
show ReferenceFluid.cpp 79 86
show AqueousVolumetric.H 39 44
show src/unitOperations/rotating/Pump.cpp 100 134
show src/unitOperations/rotating/Pump.cpp 136 140
show src/unitOperations/rotating/Pump.cpp 236 242
show src/unitOperations/rotating/Pump.cpp 316 330
show src/unitOperations/reactor/CSTR.cpp 108 112
show src/unitOperations/reactor/CSTR.cpp 238 253
show src/unitOperations/reactor/CSTR.cpp 439 442
show src/unitOperations/reactor/CSTR.cpp 528 531
show src/unitOperations/reactor/CSTR.cpp 657 669
show SolutionRegistry.cpp 43 46
show SolutionRegistry.cpp 56 73
show SolutionPair.cpp 43 47
show ApproximationAuthorisation.H 113 131
show src/applications/choupoSolve/main.cpp 607 611
show src/applications/choupoBatch/main.cpp 259 263
show DynamicDriver.cpp 427 431
show src/unitOperations/flowsheet/Flowsheet.cpp 3521 3550
show src/unitOperations/flowsheet/Flowsheet.cpp 3627 3631
show NewtonND.cpp 931 948
show NewtonRaphson.cpp 116 125
show DesignSpec.cpp 262 274
show PropertySourceDeclarations.cpp 33 38
show docs/theoryGuide.tex 2479 2483
show gui/src/case/modelDocs.ts 96 98
show gui/src/case/modelDocs.ts 167 169
show settled-contracts.md 3732 3736
show src/unitOperations/heatTransfer/Valve.cpp 299 302
show Valve.cpp 299 302
show PhaseChanger.cpp 864 870
show PhaseDensity.cpp 124 127
show GasStoreSize.cpp 657 660
show PipeHeaderSize.cpp 198 201
show SpiralWoundModule.cpp 408 411
show ShellTubeHX.cpp 230 237
