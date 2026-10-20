PY ?= python
NPM ?= npm
PORT ?= 8080
BASE ?= http://127.0.0.1:$(PORT)

.PHONY: dev test api-test typecheck web-install web-build run auth smoke check deploy-check

# everything at once: API + auth sidecar + storefront
dev:
	$(PY) scripts/dev.py

# everything CI would run
test: api-test typecheck

api-test:
	$(PY) -m unittest discover -s api/tests

typecheck:
	cd web && $(NPM) run typecheck

web-install:
	cd web && $(NPM) ci

web-build:
	cd web && $(NPM) run build

# the API on its own; the auth sidecar is optional and fails safe
run:
	$(PY) -m api.server --host 127.0.0.1 --port $(PORT)

auth:
	cd auth-server && $(NPM) start

# end-to-end over HTTP against an already-running server
smoke:
	$(PY) scripts/smoke.py --base $(BASE)

check:
	$(PY) scripts/verify.py

deploy-check:
	$(PY) scripts/render_deploy.py --check
