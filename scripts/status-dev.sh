#!/bin/bash
echo "=== Dev Tmux Session ==="
tmux ls 2>/dev/null | grep nexa-dev || echo "nexa-dev is not running"
echo ""
echo "=== Dev Services Health ==="
WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3010/ || echo "DOWN")
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3011/auth/login -H "Content-Type: application/json" -d '{}' || echo "DOWN")

if [ "$WEB_STATUS" = "200" ]; then
  echo "✓ Dev Web (Port 3010): UP (HTTP 200)"
else
  echo "✗ Dev Web (Port 3010): $WEB_STATUS"
fi

if [ "$API_STATUS" = "400" ] || [ "$API_STATUS" = "200" ]; then
  echo "✓ Dev API (Port 3011): UP (Healthy response)"
else
  echo "✗ Dev API (Port 3011): $API_STATUS"
fi
