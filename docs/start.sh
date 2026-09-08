#!/usr/bin/env sh
cd "$(dirname "$0")"
echo "demo running at http://localhost:8000"
python3 -m http.server 8000
