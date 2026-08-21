# Build context is the REPO ROOT (parent of vpms/ and vpms-frontend/) — both are needed
# since the backend serves the frontend's build output from a sibling directory
# (app/main.py's FRONTEND_DIST_DIR = BASE_DIR.parent / "vpms-frontend" / "dist").
# Build from the repo root:  docker build -f Dockerfile -t vpms:latest .

# ---------- Stage 1: build the React frontend ----------
FROM node:20-alpine AS frontend-build
WORKDIR /build/vpms-frontend
COPY vpms-frontend/package.json vpms-frontend/package-lock.json ./
RUN npm ci
COPY vpms-frontend/ ./
RUN npm run build

# ---------- Stage 2: backend runtime ----------
FROM python:3.10-slim AS backend
WORKDIR /app

# psycopg2-binary ships a prebuilt wheel, so no build-essential/libpq-dev needed.
COPY vpms/requirements.txt vpms/requirements.txt
RUN pip install --no-cache-dir -r vpms/requirements.txt

COPY vpms/ vpms/
COPY --from=frontend-build /build/vpms-frontend/dist vpms-frontend/dist

# Uploaded KYC/invoice documents live under vpms/uploads (app/core/storage.py) — mount a
# volume here in docker-compose so they survive container restarts/rebuilds.
RUN mkdir -p vpms/uploads

WORKDIR /app/vpms
EXPOSE 8060

# Applies any pending migrations, then starts the API (which also serves the built
# frontend — see main.py's catch-all route). One process, one container.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8060"]
