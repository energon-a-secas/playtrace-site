.DEFAULT_GOAL := help

PORT = 8900

# ── Help ──────────────────────────────────────────────────────────────────────
.PHONY: help
help:
	@echo ""
	@echo "  make serve    Start dev server → http://localhost:$(PORT)"
	@echo "  make build    Rebuild directory routes from the saved catalogue"
	@echo "  make kill     Kill this project's HTTP server"
	@echo ""

# ── Dev server ────────────────────────────────────────────────────────────────
# Directory routes and versioned assets use the same publisher as production.
.PHONY: build serve
build:
	node scripts/build-site.mjs --catalog data/public-catalog.json
serve: build
	@echo "Serving → http://localhost:$(PORT)"
	python3 -m http.server $(PORT) --directory _site

# ── Kill ──────────────────────────────────────────────────────────────────────
.PHONY: kill
kill:
	@lsof -ti :$(PORT) | xargs kill 2>/dev/null && echo "Stopped server on port $(PORT)" || echo "No server running on port $(PORT)"
