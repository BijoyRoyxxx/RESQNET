FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r backend/requirements.txt
COPY backend backend
COPY scripts scripts
COPY data data
RUN mkdir -p /app/runtime && useradd --uid 10001 --create-home resq && chown -R resq:resq /app
USER resq
EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
