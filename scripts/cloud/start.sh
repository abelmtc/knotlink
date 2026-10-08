#!/usr/bin/env bash
set -euo pipefail
export DOCKER_CONFIG=/workspace/.docker
runtime=/workspace/knotlink-environment
mkdir -p "$runtime"
if docker container inspect knotlink-mongo >/dev/null 2>&1; then
  docker start knotlink-mongo >/dev/null
else
  docker run -d --name knotlink-mongo --network host -v /workspace/.knotlink/mongo:/data/db mongo:7.0 --bind_ip 127.0.0.1
fi
if docker container inspect knotlink-classifier >/dev/null 2>&1; then
  docker start knotlink-classifier >/dev/null
else
  docker run -d --name knotlink-classifier --network host -e PYTHONPATH=/deps -v /workspace/knotlink-environment/classifier-deps:/deps:ro -v /workspace/knot_mosaics:/app:ro -w /app --entrypoint sage sagemath/sagemath:10.6 -python -m flask --app classifier_service run --host 127.0.0.1 --port 5001
fi
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:5001/api/health > "$runtime/classifier-health.json"; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:5001/api/health
if ! curl -fsS http://127.0.0.1:5000/api/health >/dev/null 2>&1; then
  cd /workspace/knotlink/server
  nohup env PYTHONDONTWRITEBYTECODE=1 MONGODB_URI="${MONGODB_URI:-mongodb://localhost:27017/}" MONGODB_DB="${MONGODB_DB:-knotlink_onboarding}" CLASSIFIER_URL="${CLASSIFIER_URL:-http://localhost:5001/api/classify}" .venv/bin/python -m flask --app server run --host 127.0.0.1 --port 5000 > "$runtime/backend.log" 2>&1 &
  echo $! > "$runtime/backend.pid"
fi
if ! curl -fsS http://127.0.0.1:5173/ >/dev/null 2>&1; then
  cd /workspace/knotlink/client
  nohup npm run dev -- --host 127.0.0.1 --port 5173 --strictPort > "$runtime/frontend.log" 2>&1 &
  echo $! > "$runtime/frontend.pid"
fi
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:5000/api/health >/dev/null 2>&1 && curl -fsS http://127.0.0.1:5173/knotting >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:5000/api/health
curl -fsS http://127.0.0.1:5000/api/research/stats
curl -fsS http://127.0.0.1:5173/knotting >/dev/null
