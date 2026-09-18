# このDockerfileはローカル開発だけでなく、本番のGoogle Cloud Runへの
# デプロイにもそのまま使っている（docs/design_doc.md 5章参照）。
# 当初はHugging Face Spaces（Docker SDK）を想定していたが、Cloud Runへ変更した。
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]
