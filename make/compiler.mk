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

CXXFLAGS := $(CXXSTD) $(OPT) $(WARN) $(INCLUDES) -pthread
LDFLAGS  := $(LDFLAGS_PLATFORM) -pthread

# Position-independent code for libchoupo.so (moved here from the Makefile
# so CXXFLAGS is FINAL before the flag stamps below hash it).
ifneq ($(PLATFORM),win64MinGW)
    CXXFLAGS += -fPIC
endif

# ---- Flag STAMPS (build hygiene 6/6) ----------------------------------------
#  The native build reused stale objects when the compiler or its flags
#  changed (the WASM build already stamped; the native one did not).  Two
#  SEPARATE stamps, each named by a content hash of its OWN inputs:
#    COMPILE stamp  =  compiler + version + every compile flag
#                      -> a change invalidates every object;
#    LINK stamp     =  the link flags
#                      -> a change RE-LINKS the library/binaries, never
#                         recompiles the 261 objects.
#  A flag change mints a new stamp name; the recipe (rules.mk) clears the
#  stale stamps and everything depending on the stamp rebuilds exactly as
#  far as needed -- measured, never trusted.
CXX_VERSION   := $(shell $(CXX) -dumpfullversion 2>/dev/null \
                     || $(CXX) --version 2>/dev/null | head -1)
COMPILE_SIG   := $(shell printf '%s' "$(CXX) $(CXX_VERSION) $(CXXFLAGS)" \
                     | md5sum | cut -c1-16)
LINK_SIG      := $(shell printf '%s' "$(LDFLAGS)" | md5sum | cut -c1-16)
COMPILE_STAMP := $(BUILD)/.stamp-cxx-$(COMPILE_SIG)
LINK_STAMP    := $(BUILD)/.stamp-ld-$(LINK_SIG)
