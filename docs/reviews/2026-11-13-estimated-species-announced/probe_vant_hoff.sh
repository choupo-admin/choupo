#!/bin/bash
# usage: probe_vant_hoff.sh <choupo_root> <work_dir>
# Speciates glutaric + malonic acid (catalogue chemistry; the dissociation dH of
# Glut/HGlut/Maln/HMaln-formation is the difference of catalogue hfAq values, one
# of each pair marked estimated) at 25 C and 80 C.  Prints the log K lines and
# the count of [estimate] lines / species advisories: the van't Hoff road.
R=$1; d=$2/vanthoff; rm -rf $d; mkdir -p $d/system $d/constant/components; touch $d/vh.cho
cat > $d/system/controlDict <<'X'
application choupoProps;
description "review probe: van't Hoff slope from estimated hfAq";
verbosity 2;
X
cat > $d/constant/thermoPhysPropDict <<'X'
recordType    thermophysicalPropertySystem;
schemaVersion 2;
components ( water );
aqueousProperties { activityCoefficients { model Davies; referenceBasis aqueousMolality; } }
X
cp $R/data/standards/components/water.dat $d/constant/components/
cat > $d/system/propsDict <<'X'
operations
(
    { name at25; type speciate; activityModel davies; temperature 298.15; analyticalTotals { H2Glut 0.03 mol/kg; H2Maln 0.03 mol/kg; } totalsBasis stoichiometric; pH solve; diagSpecies ( H2Glut HGlut Glut H2Maln HMaln Maln ); output { file a.csv; } }
    { name at80; type speciate; activityModel davies; temperature 353.15; analyticalTotals { H2Glut 0.03 mol/kg; H2Maln 0.03 mol/kg; } totalsBasis stoichiometric; pH solve; diagSpecies ( H2Glut HGlut Glut H2Maln HMaln Maln ); output { file b.csv; } }
);
X
(cd $d && CHOUPO_HOME=$R $R/choupoProps . > out.txt 2>&1); echo "exit $?"
grep -E "log K\(T\)|SOLVED pH|Nothing was raised" $d/out.txt
echo "estimate_lines $(grep -c '\[estimate\]' $d/out.txt)  species_advisories $(grep -c '"locus": "species ' $d/out.txt)"
