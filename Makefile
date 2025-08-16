.PHONY: clean dev build preview lint lint-fix format format-check typecheck check test all pre-release

clean:
	rm -rf node_modules dist

dev:
	npm run dev

build:
	npm run build

preview:
	npm run preview

lint:
	npm run lint

lint-fix:
	npm run lint:fix

format:
	npm run format

format-check:
	npm run format:check

typecheck:
	npm run typecheck

check:
	npm run typecheck
	npm run lint
	npm run format:check

test: check

all: check build

pre-release: typecheck lint format-check build