# NexaGen Testing Strategy

> Last updated: 2026-08-29

## Test Tiers

| Tier | What | Command | When |
|:---|:---|:---|:---|
| T0 | TypeScript type check | `npm run typecheck` | Always |
| T1 | ESLint | `npm run lint` | Always |
| T2 | Build verification | `npm run build` | Always |
| T3 | Unit tests (Jest) | `npm run test` | Always |
| T4 | E2E tests (Playwright) | `npx playwright test` | Frontend changes |
| T5 | API smoke tests | `curl` commands | API changes |

## Commands

```bash
# Run all checks (what pre-commit does)
npm run typecheck && npm run lint && npm run test

# Individual
npm run typecheck                    # Turbo typecheck across all packages
npm run lint                         # Turbo lint across all packages
npm run build                        # Turbo build (dependency order)
npm run test                         # Jest tests in apps/api

# E2E (Playwright)
npx playwright test                  # Run all E2E tests
npx playwright test --headed         # Run with browser visible
npx playwright show-report           # View last test report

# Database
npm run db:generate                  # Regenerate Prisma client
npm run db:migrate:dev               # Run pending migrations (dev)
npm run db:migrate:status            # Check migration status
```

## Test Locations

- **Unit tests**: `apps/api/src/**/*.spec.ts`
- **E2E tests**: `e2e/`
- **Playwright config**: `playwright.config.ts`

## CI/CD Test Gates

### Pre-commit (Husky)
- typecheck → lint → test

### GitHub Actions (on push to main)
- Path detection (dorny/paths-filter)
- Build affected Docker images
- Health check after deploy
- Auto-rollback on failure

### AI Worker Verification (QA script)
- See `.ai/scripts/verify.sh`
