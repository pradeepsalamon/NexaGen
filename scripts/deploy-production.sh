#!/bin/bash
set -e

# =========================================================
# Nexa Production Deployment Script
# =========================================================
# Usage: ./scripts/deploy-production.sh <COMMIT_SHA> [SERVICES...]
# Example: ./scripts/deploy-production.sh abc1234 web api
# =========================================================

if [ "$#" -lt 2 ]; then
  echo "Error: Missing arguments."
  echo "Usage: $0 <COMMIT_SHA> [SERVICES...]"
  exit 1
fi

COMMIT_SHA=$1
shift
SERVICES=("$@")

echo "Starting deployment for commit: $COMMIT_SHA"
echo "Target services: ${SERVICES[*]}"

# Save previous commit for potential rollback
PREV_COMMIT=$(git rev-parse HEAD)
echo "Current commit before deployment: $PREV_COMMIT"

echo "Fetching latest changes..."
git fetch origin main

echo "Checking out target commit $COMMIT_SHA..."
# Ensure we check out the exact commit to avoid race conditions
git checkout -f "$COMMIT_SHA"

# Rebuild only the affected services
echo "Building services: ${SERVICES[*]}..."
docker compose build "${SERVICES[@]}"

# Start only the affected services
echo "Starting services: ${SERVICES[*]}..."
docker compose up -d "${SERVICES[@]}"

# =========================================================
# Health Check Phase
# =========================================================
echo "Waiting for services to initialize (15 seconds)..."
sleep 15

HEALTHY=true
FAILED_SERVICE=""

for SERVICE in "${SERVICES[@]}"; do
  # Determine container name based on docker-compose.yml
  CONTAINER_NAME="nexa_$SERVICE"
  
  echo "Checking health for $CONTAINER_NAME..."
  
  # Check if container has a healthcheck defined
  HAS_HEALTHCHECK=$(docker inspect --format='{{if .Config.Healthcheck}}true{{else}}false{{end}}' "$CONTAINER_NAME" 2>/dev/null || echo "false")
  
  if [ "$HAS_HEALTHCHECK" = "true" ]; then
    # Poll health status up to 60 seconds
    ATTEMPTS=0
    MAX_ATTEMPTS=12
    while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
      STATUS=$(docker inspect --format='{{json .State.Health.Status}}' "$CONTAINER_NAME" | tr -d '"')
      
      if [ "$STATUS" = "healthy" ]; then
        echo "✓ $CONTAINER_NAME is healthy."
        break
      elif [ "$STATUS" = "unhealthy" ]; then
        echo "✗ $CONTAINER_NAME became unhealthy."
        HEALTHY=false
        FAILED_SERVICE=$CONTAINER_NAME
        break
      fi
      
      echo "  Current status: $STATUS. Waiting 5s..."
      sleep 5
      ATTEMPTS=$((ATTEMPTS+1))
    done
    
    if [ $ATTEMPTS -eq $MAX_ATTEMPTS ]; then
      echo "✗ $CONTAINER_NAME timed out waiting for health check."
      HEALTHY=false
      FAILED_SERVICE=$CONTAINER_NAME
    fi
  else
    # Fallback to checking if container is simply running
    RUNNING=$(docker inspect --format="{{.State.Running}}" "$CONTAINER_NAME" 2>/dev/null || echo "false")
    if [ "$RUNNING" = "true" ]; then
      echo "✓ $CONTAINER_NAME is running (no healthcheck defined)."
    else
      echo "✗ $CONTAINER_NAME is not running."
      HEALTHY=false
      FAILED_SERVICE=$CONTAINER_NAME
    fi
  fi
  
  if [ "$HEALTHY" = "false" ]; then
    break
  fi
done

# =========================================================
# Rollback Phase
# =========================================================
if [ "$HEALTHY" = "false" ]; then
  echo "========================================"
  echo "DEPLOYMENT FAILED: $FAILED_SERVICE"
  echo "========================================"
  echo "Recent logs for $FAILED_SERVICE:"
  docker logs --tail 50 "$FAILED_SERVICE"
  
  echo ""
  echo "Initiating application rollback to previous commit: $PREV_COMMIT"
  
  # Rollback code
  git checkout -f "$PREV_COMMIT"
  
  # Rebuild and restart using previous code
  echo "Rebuilding previous state for services: ${SERVICES[*]}..."
  docker compose build "${SERVICES[@]}"
  
  echo "Restarting previous state..."
  docker compose up -d "${SERVICES[@]}"
  
  echo "Application rollback performed."
  echo "Note: Database migrations were NOT automatically reversed."
  echo "Manual migration review may be required if schema changes were applied."
  
  # Exit with error to fail the GitHub Action
  exit 1
fi

# =========================================================
# Cleanup Phase
# =========================================================
echo "========================================"
echo "DEPLOYMENT SUCCESSFUL"
echo "========================================"
echo "Cleaning up dangling images..."
# Safely prune dangling images (unnamed, unused images from rebuilds)
docker image prune -f

echo "Deployment complete."
exit 0
