FROM node:24-alpine AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY scripts/ scripts/
COPY data/ data/
COPY --from=frontend /build/dist frontend/dist
RUN mkdir -p /app/runtime && useradd --uid 10001 --create-home resq && chown -R resq:resq /app
USER resq
EXPOSE 10000
CMD ["python", "-m", "backend.cloud"]
