#!/bin/bash
set -euo pipefail

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1 && docker-compose version >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "docker compose / docker-compose が利用できません。" >&2
  echo "Docker Desktop の WSL 連携を有効化するか、Docker Compose をインストールしてください。" >&2
  exit 1
fi

cat mysql/init.sql | $COMPOSE exec -T mysql mysql --user=root --password=rootpassword
