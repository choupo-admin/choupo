# =============================================================================
#  Choupo  --  compiler & build-mode configuration
# =============================================================================
#  Variables (override at command line, e.g. `make MODE=debug`):
#
#    MODE      release | debug                       (default: release)
#    PLATFORM  identifier used for the output directory  (default: linux64Gcc)
#    CXX       compiler                              (default: g++)
# =============================================================================

PLATFORM ?= linux64Gcc
MODE     ?= release

ifeq ($(MODE),debug)
    BUILD_SUFFIX := Debug
    OPT          := -O0 -g
else ifeq ($(MODE),release)
    BUILD_SUFFIX :=
    OPT          := -O2
else
    $(error MODE must be 'release' or 'debug', got '$(MODE)')
endif

BUILD   := build/$(PLATFORM)$(BUILD_SUFFIX)

# ---- Platform-specific toolchain ------------------------------------
# Default: native Linux/Gcc.  Override PLATFORM=win64MinGW to cross-compile
# a static Windows .exe via MinGW-w64.
ifeq ($(PLATFORM),win64MinGW)
    CXX              := x86_64-w64-mingw32-g++
    EXE              := .exe
    # Static link so the .exe runs on a stock Windows install --- no DLL hunt.
    LDFLAGS_PLATFORM := -static -static-libgcc -static-libstdc++
else
    CXX              ?= g++
    EXE              :=
    LDFLAGS_PLATFORM :=
endif

CXXSTD   := -std=c++17
WARN     := -Wall -Wextra -Wpedantic
INCLUDES := -Isrc

CXXFLAGS := $(CXXSTD) $(OPT) $(WARN) $(INCLUDES)
LDFLAGS  := $(LDFLAGS_PLATFORM)
