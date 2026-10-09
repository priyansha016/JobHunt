#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    ./venv/bin/pip install --upgrade pip
    ./venv/bin/pip install -r backend/requirements.txt
fi

echo "=========================================================="
echo " Starting LinkedIn JobHunt Profiler Backend (DuckDB + Laya)"
echo " Server: http://127.0.0.1:8765"
echo " Database: data/jobhunt.duckdb"
echo "=========================================================="

./venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8765 --reload
