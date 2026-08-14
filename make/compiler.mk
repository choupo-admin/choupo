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

#  STRICT=1  ->  a warning is an ERROR.  The tree compiles CLEAN, and the
#  point of that is to keep it readable: a
#  build that prints forty "this is fine" lines is a build where the one that
#  matters gets scrolled past -- the uninitialised norm in NewtonND and the
#  dangling `else` in VleConsistency had both been sitting in that noise.
#
#  Opt-in, NOT the default, and deliberately so: a newer compiler invents new
#  warnings, and a user on a compiler we never tested must still be able to
#  build the simulator.  Development holds the line; distribution stays kind.
#      make STRICT=1            release, warnings fatal
#      make MODE=debug STRICT=1 the same on the debug tree
#
#  AND THE CLAIM IS NOW CHECKED (2026-08-14).  This comment used to
#  assert "zero warnings, 2026-07-28" as a dated fact.  By 2026-08-14
#  there were EIGHT -- because STRICT=1 is opt-in and nobody opts in, so
#  the mechanism that could have caught them was never run.  One of the
#  eight was a -Wmisleading-indentation on unconditional statements that
#  read as guarded, in code added that same day: exactly the signal this
#  block says gets scrolled past.  bin/curate/check_compile_clean.py now
#  sweeps every TU on each full bin/runTests, and the dated boast is
#  gone -- a fact nothing re-measures is a fact that goes quietly false.
ifeq ($(STRICT),1)
    WARN += -Werror
endif

#  `-I.` puts the PROJECT ROOT on the include path so `generated/gitVersion.H`
#  is reachable by its own rooted name.  Without it, the only way to see the
#  generated tree from `src/core/` was `"../../generated/gitVersion.H"` -- the
#  one `../` include that leaves `src/` entirely, and the reason debt D4 had to
#  carry a named exception.  A rule with an exception is weaker than a rule:
#  the contract is now simply *no `../` include leaves its own subsystem*.
INCLUDES := -Isrc -I.

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
