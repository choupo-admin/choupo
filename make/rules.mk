# =============================================================================
#  Choupo  --  pattern rules
# =============================================================================
#  Output layout:
#      build/<platform><mode>/src/<rel-path>/<file>.o
#      build/<platform><mode>/src/<rel-path>/<file>.d   (auto dep)
#      build/<platform><mode>/choupoSolve         (binary)
#
#  A symlink ./choupoSolve at the project root points to the latest
#  binary, so tutorials can be run with the familiar
#      ./choupoSolve tutorials/<case>
# =============================================================================

# Object & dependency emission
$(BUILD)/src/%.o: src/%.cpp
	@mkdir -p $(@D)
	@printf "  CXX   %s\n" $<
	@$(CXX) $(CXXFLAGS) -MMD -MP -c $< -o $@
