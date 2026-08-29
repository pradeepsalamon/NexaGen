# NexaGen Development Workflow

> Last updated: 2026-08-29

## Environment Setup

### Development (Native, via tmux)
- **Path**: `/opt/nexa-chess/NexaGen-dev`
- **Branch**: `dev`
- **API Port**: 3011 (NestJS with `--watch`)
- **Web Port**: 3010 (Next.js dev server)
- **Database**: `vps_dev` (PostgreSQL)
- **Start**: `./scripts/start-dev.sh`
- **Status**: `./scripts/status-dev.sh`
- **Stop**: `./scripts/stop-dev.sh`
- **Logs**: `api-dev.log`, `web-dev.log` (piped via tee in tmux)

### Production (Docker)
- **Path**: `/opt/nexa-chess/NexaGen`
- **Branch**: `main`
- **API Port**: 3001 (Docker container `nexa_api`)
- **Web Port**: 3000 (Docker container `nexa_web`)
- **Database**: `nexa_chess` (PostgreSQL)
- **Deploy**: Push to `main` → GitHub Actions → SSH deploy script

## Build System

- **Monorepo tool**: Turborepo
- **Package manager**: npm (workspaces)

### Common Commands

```bash
# Development
npm run dev              # Start all services (turbo dev --parallel)
npm run dev:api          # Start API only
npm run dev:web          # Start Web only

# Building
npm run build            # Build all packages
npm run build:prod       # Build for production

# Database
npm run db:generate      # Generate Prisma client
npm run db:migrate:dev   # Run dev migrations
npm run db:seed          # Seed database

# Testing
npm run test             # Run Jest tests
npm run typecheck        # TypeScript type checking
npm run lint             # ESLint

# AI Development System (Phase 9 Production-Grade Execution & Approval)
npm run ai:manager -- "<prompt>"  # Real development request (plans, analyzes risk & regressions)
npm run ai:manager -- --plan "..."# Plan without executing (status: AWAITING_APPROVAL)
npm run ai:manager -- --approve ID# Explicitly approve task for worker execution
npm run ai:manager -- --approve-plan ID # Approve full DAG plan
npm run ai:manager -- --reject ID # Explicitly reject active task
npm run ai:schedule               # Run parallel scheduler cycle across approved tasks
npm run ai:status                 # Status Dashboard V2 (Approvals, Queue, Risk, Worktrees, Safety)
npm run ai:manager -- --review ID # Review completed task & generate Human Review Package V2
npm run ai:manager -- --merge-check ID # Read-only merge readiness assessment
npm run ai:manager -- --post-merge-check ID # Diagnostic post-merge health verification
npm run ai:audit                  # Run 124-assertion deterministic Safety Audit
npm run ai:test:manager           # Run 30-scenario Phase 9 Manager Test Suite

# Cleaning
npm run dev:clean        # Clean .next + dist, then dev
```

## Code Conventions

### Backend (NestJS)

- **Module pattern**: `module.ts` + `controller.ts` + `service.ts`
- **Prisma access**: Via `PrismaService` with explicit model getters
- **Auth guard**: JWT cookie-based, role-based access control
- **Roles**: `STUDENT`, `COACH`, `ADMIN`, `SUPER_ADMIN`
- **Soft delete**: Via `TrashService` with audit logging

### Frontend (Next.js)

- **Feature folders**: `src/features/<name>/` with components, hooks, api, context
- **UI buttons in tables**: Must use rounded-full icon style (see AGENTS.md)
- **Icons**: Lucide React with `strokeWidth={2.5}`
- **API calls**: Use `apiFetch` from lib (handles token refresh)

### Critical Rules (from .agents/AGENTS.md)

1. **Prisma model rule**: When adding a new model to `schema.prisma`, MUST add corresponding getter in `prisma.service.ts`
2. **Migration rule**: When modifying schema, MUST run `npx prisma migrate dev --name <name>` (never just `db push`)
3. **UI consistency rule**: Action buttons in data tables MUST be rounded-full icons

## Git Workflow

```
main (production) ←── merge via PR ←── dev (integration) ←── feature branches
```

### Branch Naming
- Feature: `feat/<description>` or `ai/NEXA-XXXX-<description>`
- Fix: `fix/<description>`
- Chore: `chore/<description>`

### Commit Convention
```
feat(module): description
fix(module): description
chore: description
refactor(module): description
test(module): description
```

### Pre-commit Hooks (Husky)
- typecheck
- lint
- test

## Deployment

### Automatic (GitHub Actions)
1. Push to `main` triggers `deploy-production.yml`
2. `dorny/paths-filter` detects which services changed
3. SSH into VPS → run `deploy-production.sh`
4. Script: fetch → checkout commit → build affected Docker images → up → health check
5. Auto-rollback on health check failure

### Manual Deploy
```bash
cd /opt/nexa-chess/NexaGen
./scripts/deploy-production.sh <commit-sha> web api
```

## AI Development Workflow (Phase 8 Human-in-the-Loop Pipeline)

### 1. Issue Natural Language Request
```bash
npm run ai:manager -- "Build student attendance percentage calculation endpoint with tests"
```

### 2. Multi-Worker Parallel Scheduling
```bash
npm run ai:schedule
```

### 3. Review Human Review Package
```bash
npm run ai:manager -- --review NEXA-0071
```

### 4. Non-Destructive Merge Readiness Check
```bash
npm run ai:manager -- --merge-check NEXA-0071
```

### 5. Human Merge Authority
```bash
# Verify diff on task branch
git diff dev...ai/NEXA-0071-slug

# Merge manually into dev when satisfied
git checkout dev
git merge ai/NEXA-0071-slug
```

