.PHONY: help install validate validate-network lint lint-categories test clean

help:
	@echo "Moses App Catalog — common tasks"
	@echo
	@echo "  make install           install the Node toolchain (once)"
	@echo "  make validate          run schema + semantic validation across apps/ (offline)"
	@echo "  make validate-network  validate + verify upstream tags, commit pins, and LICENSE files"
	@echo "  make lint              run yamllint over apps/ and schema/ (requires yamllint)"
	@echo "  make lint-categories   validate categories.yaml allow-list (uniqueness + key shape)"
	@echo "  make test              alias for 'validate' (offline; CI runs validate-network)"
	@echo "  make clean             remove node_modules"

install:
	npm install --no-audit --no-fund

validate:
	node scripts/validate.mjs

validate-network:
	node scripts/validate.mjs --network

lint:
	@command -v yamllint >/dev/null 2>&1 || { \
	  echo "yamllint not installed. Install via 'pip install yamllint' (or 'brew install yamllint')."; \
	  exit 1; \
	}
	yamllint -d "{extends: default, rules: {line-length: {max: 200, level: warning}, document-start: disable, comments: {min-spaces-from-content: 1}, truthy: {check-keys: false}}}" apps/ schema/

lint-categories:
	node scripts/lint-categories.mjs

test: validate

clean:
	rm -rf node_modules
