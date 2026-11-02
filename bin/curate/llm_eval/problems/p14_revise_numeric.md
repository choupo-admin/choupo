start: tutorials/steady/heat/heatExchanger01_water_water
allowed: system/flowsheetDict
check: system/flowsheetDict units[hx].operation.area == 15 m2
check: system/flowsheetDict units[hx].operation.U == 500 W/m2/K
feedback: The exchanger is too small for what we need. Make the heat transfer area 15 m2 instead of 10 m2 and keep everything else as it is, so we can see how much more heat is recovered.
# Problem 14 (REVISION, numeric change)
Start case: tutorials/steady/heat/heatExchanger01_water_water. One number changes (the area); the expected edit is ONE file. The generated outlet files under 0/ must be left alone.
