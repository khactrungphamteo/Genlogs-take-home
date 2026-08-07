FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml ./
COPY app ./app

RUN python -m venv .venv \
	&& . .venv/bin/activate \
	&& pip install --no-cache-dir .

ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8001

CMD ["sh", "-c", ". .venv/bin/activate && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001"]
