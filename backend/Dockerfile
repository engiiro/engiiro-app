# ローカル開発環境を揃えるためのDockerfile。
# 本番はDeno Deployへソースコードを直接デプロイするため、このイメージ自体は本番運用には使わない。
FROM denoland/deno:2.1.4

WORKDIR /app

COPY deno.json .
COPY . .

RUN deno cache main.ts

EXPOSE 8000

CMD ["run", "--allow-net", "--allow-env", "--unstable-kv", "main.ts"]
