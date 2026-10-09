#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "=========================================================="
echo " Starting LinkedIn JobHunt Profiler Backend (DuckDB + Laya)"
echo " Environment Manager: uv"
echo " Server: http://127.0.0.1:8765"
echo " Database: data/jobhunt.duckdb"
echo "=========================================================="

if command -v uv >/dev/null 2>&1; then
    echo "[uv] Syncing dependencies..."
    uv sync
    echo "[uv] Launching FastAPI backend server..."
    uv run uvicorn backend.main:app --host 127.0.0.1 --port 8765 --reload
elif [ -d ".venv" ]; then
    ./.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8765 --reload
elif [ -d "venv" ]; then
    ./venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8765 --reload
else
    echo "Error: Neither uv nor a virtual environment (.venv) was found."
    exit 1
fi
