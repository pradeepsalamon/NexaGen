# Nexa AI Main Manager

> Orchestration & Planning Layer for NexaGen AI Development System

## Overview

The **Main Manager** is the human-facing engineering manager and orchestration coordinator. It receives high-level user requests, consults project knowledge documents, breaks complex goals into structured engineering work orders, dispatches tasks to the **Gemini Coding Worker (`nexa-dev-01`)**, audits completion reports against acceptance criteria, and returns clear, concise progress summaries to the user.

```
                  USER (HUMAN)
                       │
                       ▼
             ┌───────────────────┐
             │  MAIN AI MANAGER  │
             │                   │
             │  • Planner        │
             │  • Dispatcher     │
             │  • Reviewer       │
             └─────────┬─────────┘
                       │
             Work Order (.ai/tasks/active/)
                       │
                       ▼
             ┌───────────────────┐
             │   GEMINI WORKER   │
             │   (nexa-dev-01)   │
             │                   │
             │  • Preflight      │
             │  • Task Branch    │
             │  • Code / Test    │
             │  • QA Verify      │
             │  • Git Commit     │
             └─────────┬─────────┘
                       │
        Completion Report (.ai/tasks/completed/)
                       │
                       ▼
             ┌───────────────────┐
             │  MANAGER REVIEW   │
             │  & HUMAN SUMMARY  │
             └─────────┬─────────┘
                       │
                       ▼
                  USER (HUMAN)
```

## Core Principle: Manager Does NOT Code

- **Main Manager**: PLANNER • DISPATCHER • REVIEWER • COMMUNICATOR
- **Gemini Worker**: IMPLEMENTER • TESTER • CODER

The Manager never directly edits application files. It formulates rigorous specifications and relies on the worker to implement, test, and commit.

## Sub-Modules

| Module | Purpose |
|:---|:---|
| `manager.js` | Main entrypoint, CLI coordinator, lifecycle manager |
| `planner.js` | Intent analysis, safety pre-check, task decomposition, work order builder |
| `dispatcher.js` | Worker availability check, locking, task invocation |
| `reviewer.js` | Completion report validation, acceptance criteria verification, follow-up creator |
| `providers/base-provider.js` | Abstract AI provider interface |
| `providers/gemini-provider.js` | Gemini adapter for analysis, schema generation, and review |
| `state/` | Session state persistence (ignored in git) |

## CLI Commands

```bash
# Check complete AI Development System status & observability
npm run ai:status

# Check manager and worker queue status
npm run ai:manager -- --status

# Plan and generate a work order without executing
npm run ai:manager -- --plan "Add attendance export feature"

# Dispatch an existing work order
npm run ai:manager -- --dispatch NEXA-0005

# Review a completion report
npm run ai:manager -- --review NEXA-0005

# Full automated end-to-end orchestration
npm run ai:manager -- "Fix coach profile rating display bug"

# Run 52-assertion worker safety audit
npm run ai:audit

# Run 20-scenario manager test suite
npm run ai:test:manager
```

