# 0001 — Python stdlib backend

Date: 2026-10-20
Status: accepted

## Context

The operator project runs a bet on a Python stdlib HTTP server and it has held
up through deploys, webhooks and admin sessions. The shop has the same shape:
a small JSON API in front of a catalog, an order state machine and two auth
surfaces. A framework would bring a dependency tree, a migration story and a
second way to start the process, none of which this project needs yet.

## Decision

The API is Python 3.14 with `http.server` and the standard library only. The
vendored `foundry/` modules are stdlib-only by contract. The single exception
is the optional Postgres seam (`SQLAlchemy` + `psycopg`), imported only when
`DATABASE_URL` is set.

`api/server.py` does routing, auth extraction, rate limiting and static
serving; `api/app.py` owns every operation and is what the tests drive.

## Consequences

- One process, one port, one `CMD`; no ASGI/WSGI server to tune.
- Tests need no network and no fixture server: they call `App`.
- Anything the framework would give for free (CORS, cookies, validation,
  body limits, streaming) is written explicitly in `server.py`.
- A future move to a framework is a router swap, not a domain rewrite: the
  domain lives behind `App`.
