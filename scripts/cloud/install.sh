#!/usr/bin/env bash
set -euo pipefail
export UV_CACHE_DIR=/workspace/.uv-cache
export UV_PYTHON_BIN_DIR=/workspace/.python-bin
export DOCKER_CONFIG=/workspace/.docker
uv python install 3.11 --install-dir /workspace/.python
uv venv --python /workspace/.python/cpython-3.11-linux-x86_64-gnu/bin/python3.11 --allow-existing /workspace/knotlink/server/.venv
uv pip install --python /workspace/knotlink/server/.venv/bin/python -r /workspace/knotlink/server/requirements.txt
cd /workspace/knotlink/client
npm ci --cache /workspace/.npm
npm run build
mkdir -p /workspace/knotlink-environment
cd /workspace/knotlink-environment
python -m pip download --no-cache-dir --dest wheels --only-binary=:all: --python-version 312 --platform manylinux2014_x86_64 flask==3.0.0 flask-cors==4.0.0
python -m pip install --no-cache-dir --no-index --find-links wheels --upgrade --target classifier-deps flask==3.0.0 flask-cors==4.0.0
docker pull sagemath/sagemath:10.6
docker pull mongo:7.0
