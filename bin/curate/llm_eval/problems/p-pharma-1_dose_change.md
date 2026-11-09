start: tutorials/batch/plant/donepezil01_tablets
allowed: 0/apiFeed, 0/lactoseFeed
omit: ^(system/layoutDict|0/(?!(api|lactose|starch|mcc|hpc|mgst|hpmc|peg|talc|tio2|feOx)Feed$|granWater$|coatWater$))
touch: 0/apiFeed
touch: 0/lactoseFeed
check: 0/apiFeed componentMolarFlows.donepezilHydrochloride ~= 0.025964 kmol/h
check: 0/apiFeed phases.solid.componentMolarFlows.donepezilHydrochloride ~= 0.025964 kmol/h
check: 0/lactoseFeed componentMolarFlows.lactoseMonohydrate ~= 0.338367 kmol/h
check: 0/lactoseFeed phases.solid.componentMolarFlows.lactoseMonohydrate ~= 0.338367 kmol/h
feedback: Change the dose from 10 mg to 15 mg of donepezil hydrochloride per tablet. The pressed core must stay at 280 mg, so the 5 mg more of API replaces 5 mg of lactose. Keep the 720 000 tablets/h basis and everything else as it is.
# Problem p-pharma-1 (REVISION, a dose change)
Start: donepezil01_tablets. Expected edit: TWO feed files under 0/ (apiFeed up by 1.5x, lactoseFeed down by 5 mg per tablet), nothing in system/ (the core mass, so the packaged tablet mass and the year in kg, do not move). The run must converge.
