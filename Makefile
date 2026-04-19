.PHONY: help install validate build-index test clean

help:
	@echo "Moses App Catalog — common tasks"
	@echo
	@echo "  make install       install the Node toolchain (once)"
	@echo "  make validate      run schema + semantic validation across apps/"
	@echo "  make build-index   regenerate index.json from apps/<slug>/manifest.yaml"
	@echo "  make test          validate + build-index (equivalent to CI)"
	@echo "  make clean         remove node_modules and generated index.json"

install:
	npm install --no-audit --no-fund

validate:
	npm run validate

build-index:
	npm run build-index

test: validate build-index

clean:
	rm -rf node_modules
	rm -f index.json
