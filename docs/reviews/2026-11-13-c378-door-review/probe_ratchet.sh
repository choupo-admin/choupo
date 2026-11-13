#!/bin/bash
# Feed check_liquid_property_ratchet one probe line at a time, in a COPY of
# the gate, its debt file and the two scanned source trees, and record
# whether it fails.  Nothing is written inside TREE.
#   usage: TREE=<checkout> OUT=<scratch dir> bash probe_ratchet.sh > ratchet_probe.tsv
set -u
: "${TREE:?}"; : "${OUT:?}"
R="$OUT/ratchet"; rm -rf "$R"; mkdir -p "$R/bin/curate" "$R/src"
cp "$TREE/bin/curate/check_liquid_property_ratchet.py" "$TREE/bin/curate/liquid_property_ratchet_debt.tsv" "$R/bin/curate/"
cp -r "$TREE/src/unitOperations" "$TREE/src/postProcessing" "$R/src/"
mkdir -p "$R/src/unitOperations/probe"
printf 'probe\tresult\tline\n'
while IFS=$'\t' read -r k line; do
  printf '%s\n' "$line" > "$R/src/unitOperations/probe/$k.cpp"
  out=$(python3 -I "$R/bin/curate/check_liquid_property_ratchet.py" | head -1)
  rm "$R/src/unitOperations/probe/$k.cpp"
  case "$out" in *FAIL*) r=caught;; *) r=not_caught;; esac
  printf '%s\t%s\t%s\n' "$k" "$r" "$line"
done <<'P'
p01_vliq	scalar v = thermo.comp(i).Vliq();
p02_ptr_vliq	scalar v = c->Vliq();
p03_literal	const scalar rho_w = 1000.0;
p04_ternary	const scalar rho = ok ? a : 1000.0;
p05_comma	scalar h = 0.7e-3, mu_feed = 1.0e-3, x = 2;
p06_brace	const scalar rhoL{998.2};
p07_othername	const scalar waterKgPerM3 = 1000.0;
p08_direct_visc	const scalar mu = thermo.viscosityLiquid(T, x);
p09_direct_dens	const scalar r = thermo.density(T, P, x, DensityPhase::Liquid);
p10_direct_sigma	const scalar s = thermo.surfaceTension(T, x);
p11_direct_diff	const scalar D = thermo.diffusivityLiquid(T, i, j);
p12_lookup_default	const scalar r = op->lookupScalarOrDefault("rho_feed", 1000.0);
p13_lookup_othername	const scalar r = op->lookupScalarOrDefault("liquidDensity", 1000.0);
p14_stokes	const auto f = stokesEinstein::factorFor(thermo, iW, T);
p15_constexpr	constexpr double kRhoWater = 1000.0;
p16_sigma_lit	scalar sigma = 0.072;
p17_kinematic	scalar nu_solvent = 1.0e-6;
p18_bare_division	const scalar Q = F * 1000.0 * MW / 1000.0;
P
