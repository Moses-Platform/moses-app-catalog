.PHONY: help install validate validate-network lint build-index test clean

help:
	@echo "Moses App Catalog — common tasks"
	@echo
	@echo "  make install           install the Node toolchain (once)"
	@echo "  make validate          run schema + semantic validation across apps/ (offline)"
	@echo "  make validate-network  validate + HEAD-check URLs + verify appConfigSHA256"
	@echo "  make lint              run yamllint over apps/ and schema/ (requires yamllint)"
	@echo "  make build-index       regenerate index.json from apps/<slug>/manifest.yaml"
	@echo "  make test              validate + build-index (equivalent to CI)"
	@echo "  make clean             remove node_modules and generated index.json"

install:
	npm install --no-audit --no-fund

validate:
	npm run validate

validate-network:
	node scripts/validate.mjs --network

lint:
	@command -v yamllint >/dev/null 2>&1 || { \
	  echo "yamllint not installed. Install via 'pip install yamllint' (or 'brew install yamllint')."; \
	  exit 1; \
	}
	yamllint -d "{extends: default, rules: {line-length: {max: 200, level: warning}, document-start: disable, comments: {min-spaces-from-content: 1}, truthy: {check-keys: false}}}" apps/ schema/

build-index:
	npm run build-index

test: validate build-index

clean:
	rm -rf node_modules
	rm -f index.json
