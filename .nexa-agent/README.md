# NexaChess AI Development System

Fresh AI development environment for NexaChess.

## Agents

Developer:
Antigravity

Tester:
OpenCode

## Workspace

/opt/nexa-chess/NexaGen-dev

## Production Boundary

/opt/nexa-chess/NexaGen

Production is completely outside the autonomous development loop.

## Workflow

Task
  -> Developer
  -> Implementation
  -> Tests
  -> Tester
  -> PASS / FAIL
  -> Human Review

FAIL:
  -> Tester report
  -> Developer fixes
  -> Tester retests

PASS:
  -> Human review
  -> Human-controlled merge/deployment
