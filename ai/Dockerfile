# このDockerfileはローカル開発だけでなく、Hugging Face Spaces（Docker SDK）への
# 本番デプロイにもそのまま使える想定（docs/design_doc.md 5章参照）。
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]
