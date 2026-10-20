# mamyat — one container, two processes (Python backend + Better Auth sidecar).
#
#   docker build -t mamyat .
#   docker run -p 8080:8080 --env-file .env.docker mamyat
#
# The storefront is NOT built here: it lives on Vercel and reaches this
# process through `BACKEND_URL`. That keeps the image to the API and the
# social-login sidecar, which is exactly what Render runs.
#
# The backend is stdlib-only except for the optional Supabase seam, so the
# pip install is two packages and nothing is compiled from source.

# --- stage 1: the auth server's dependencies ----------------------------------
FROM node:22-slim AS authdeps

ENV NODE_ENV=production
WORKDIR /auth

# dependencies first: they change far less often than the source does
COPY auth-server/package.json auth-server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# --- stage 2: the runtime -----------------------------------------------------
FROM python:3.14-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOST=0.0.0.0 \
    PORT=8080 \
    DATA_DIR=/data \
    NODE_ENV=production

WORKDIR /app

# Node runs the Better Auth sidecar. Copying the official binary keeps this
# Dockerfile free of a version-pinned download; libstdc++ is the one library
# the slim Python image does not always ship.
COPY --from=node:22-slim /usr/local/bin/node /usr/local/bin/node
RUN apt-get update \
 && apt-get install -y --no-install-recommends libstdc++6 \
 && rm -rf /var/lib/apt/lists/* \
 && node --version

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# the backend, the foundry kit it imports, and the seed catalog
COPY api/ ./api/
COPY foundry/ ./foundry/
COPY data/ ./data/
COPY supabase/ ./supabase/

# the auth sidecar: source plus the dependencies built above
COPY auth-server/ ./auth-server/
COPY --from=authdeps /auth/node_modules ./auth-server/node_modules

# run unprivileged; /data is where the JSON stores (and the generated admin
# password) live. Render's free plan gives no disk, so the stores reset on a
# redeploy — set DATABASE_URL to keep them.
RUN groupadd -f mamyat \
 && useradd --create-home --shell /bin/false -g mamyat mamyat \
 && mkdir -p /data && chown -R mamyat:mamyat /data /app
USER mamyat

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python3 -c "import os,urllib.request;urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8080')+'/api/health',timeout=4)"

# Two processes, one public port: the Python server answers everything and
# proxies /api/betterauth/* to the loopback sidecar. The sidecar is
# deliberately best-effort — if it fails, the site stays up and the social
# buttons disappear (it reports itself disabled).
CMD ["sh", "-c", "node /app/auth-server/server.mjs & exec python3 -m api.server"]
