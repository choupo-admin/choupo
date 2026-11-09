start: tutorials/batch/plant/donepezil01_tablets
allowed: system/postDict
omit: ^(system/layoutDict|0/)
touch: system/postDict
check: system/postDict batchPlan.lot.mass == 450 kg
check: system/postDict batchPlan.production.perYear == 43535 kg
feedback: Make the lot 450 kg of final blend instead of 300 kg. The year stays at 43 535 kg of packaged tablets. The machines must still be accepted by the plant sizing.
# Problem p-pharma-2 (REVISION, a batch-size change)
Start: donepezil01_tablets. Expected edit: system/postDict only: the lot mass, and the ratings of the machines the bigger lot no longer fits (the engine refuses a machine above utilisation 1; the run must converge). The 0/ files are streams per unit of product and do not change.
