# Nexa AI Main Manager & Control Plane

> Multi-Worker Development Control Plane & DAG Orchestration Layer for NexaGen AI Development System

## Overview

The **Main Manager** is the human-facing development control plane and orchestration coordinator. It receives high-level user requests, consults project context and live environment state, breaks complex goals into structured DAG engineering work orders, routes tasks to matching capable workers in the **Multi-Worker Pool** (`nexa-dev-01`, `nexa-dev-02`, `nexa-dev-03`), audits completion reports against acceptance criteria, and returns clear, concise progress summaries to the user.

> **AUTHORITATIVE TRANSPORT RULE**: The filesystem remains the authoritative AI task transport. No external message brokers or queues are used.

```
                         HUMAN (USER)
                              │
                              ▼
                     MAIN AI MANAGER
                              │
                       Project Context
                              │
                       Smart Planner
                              │
                      Dependency Graph (DAG)
                              │
                          Scheduler
                              │
                      .ai/tasks/active/
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
        Worker 01        Worker 02        Worker 03
      (Backend/API)     (Frontend/UI)    (QA/Testing)
             │                │                │
             └────────────────┼────────────────┘
                              │
                    .ai/tasks/completed/
                              │
                           Reviewer
                              │
                        Human Summary
                              │
                              ▼
                      Human Merge to DEV
```

## Core Principle: Manager Does NOT Code

- **Main Manager**: PLANNER • SCHEDULER • DISPATCHER • REVIEWER • COMMUNICATOR
- **Gemini Workers**: IMPLEMENTERS • TESTERS • CODERS

The Manager never directly edits application files. It formulates rigorous specifications, constructs dependency graphs, assigns tasks to capable workers, and audits results.

## Sub-Modules

| Module | Purpose |
|:---|:---|
| `manager.js` | Main entrypoint, CLI coordinator, lifecycle manager |
| `project-context.js` | Real-time environment inspection, service health checking, task history search |
| `worker-registry.js` | Multi-worker pool management, capability matching, heartbeat tracking |
| `dependency-graph.js` | DAG dependency validation, cycle detection, topological sorting, ASCII rendering |
| `scheduler.js` | Idempotent task scheduling cycle, capability routing, lock acquisition |
| `planner.js` | Intent analysis, safety pre-check, task decomposition, work order builder |
| `dispatcher.js` | Pre-dispatch environment health checks, worker status validation, task invocation |
| `reviewer.js` | Completion report validation, acceptance criteria verification, follow-up creator |
| `providers/base-provider.js` | Abstract AI provider interface |
| `providers/gemini-provider.js` | Gemini adapter for analysis, schema generation, and review |

## Multi-Worker Pool

| Worker ID | Specialization | Capabilities | Workspace |
|:---|:---|:---|:---|
| `nexa-dev-01` | Backend & API | `backend`, `nestjs`, `prisma`, `typescript`, `database`, `devops` | `/opt/nexa-chess/NexaGen-dev` |
| `nexa-dev-02` | Frontend & UI | `frontend`, `nextjs`, `react`, `shadcn`, `typescript`, `ui` | `/opt/nexa-chess/NexaGen-dev` |
| `nexa-dev-03` | Testing & QA | `testing`, `jest`, `e2e`, `typescript`, `docs`, `investigation` | `/opt/nexa-chess/NexaGen-dev` |

## CLI Commands

```bash
# Check complete AI Development System status & observability
npm run ai:status

# Run one scheduler cycle across active task queue
npm run ai:schedule

# List all registered workers in multi-worker pool
npm run ai:manager -- --workers

# Render ASCII task dependency tree for active tasks
npm run ai:manager -- --graph

# Query structured project development history
npm run ai:manager -- --history attendance

# Plan and generate work orders without executing
npm run ai:manager -- --plan "Add student rating badge component"

# Dispatch a specific work order to a capable worker
npm run ai:manager -- --dispatch NEXA-0005

# Review a completion report
npm run ai:manager -- --review NEXA-0005

# Full automated end-to-end DAG orchestration
npm run ai:manager -- "Fix coach profile rating display bug"

# Run 79-assertion worker safety audit
npm run ai:audit

# Run 25-scenario manager test suite
npm run ai:test:manager
```
