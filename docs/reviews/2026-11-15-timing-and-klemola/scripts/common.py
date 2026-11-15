import os, sys, time
L = "<scratch>/dwsim/x/usr/local/lib/dwsim"
os.environ["LD_LIBRARY_PATH"] = L + ":" + L + "/ThermoCS:" + os.environ.get("LD_LIBRARY_PATH","")
from pythonnet import load
load("coreclr", runtime_config=L + "/DWSIM.UI.Desktop.runtimeconfig.json", dotnet_root="<scratch>/dwsim/dotnet")
import clr
os.chdir(L); sys.path.append(L)
for a in ["DWSIM.Automation", "DWSIM.Interfaces", "DWSIM.GlobalSettings", "DWSIM.SharedClasses", "DWSIM.Thermodynamics", "DWSIM.UnitOperations", "DWSIM.FlowsheetBase", "CapeOpen"]:
    clr.AddReference(L + "/" + a + ".dll")
from DWSIM.Automation import Automation3
from DWSIM.Interfaces.Enums.GraphicObjects import ObjectType
