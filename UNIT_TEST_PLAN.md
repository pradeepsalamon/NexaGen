# Unit Testing Plan

This document is the required testing inventory for the NestJS backend. It must be updated whenever backend business logic changes, whenever a provider/controller/guard/utility is added, and whenever a public method is introduced.

Current rule: do not allow backend business logic to exist without being tracked here.

## Scope Snapshot

Implemented backend modules inspected:

- `apps/api/src/auth`
- `apps/api/src/mail`
- `apps/api/src/prisma`
- `apps/api/src/user`
- `apps/api/src/batch`
- `apps/api/src/app.module.ts`
- `apps/api/src/main.ts`
- `apps/api/prisma/seed.ts`
- Backend-adjacent shared packages used by the API:
  - `packages/config/src/api.ts`
  - `packages/types/src/index.ts`

Not yet implemented in `apps/api/src`:
- Roles and permissions module
- Courses module
- Lessons module
- Live classes module
- Payments module
- Notifications module
- Files module
- Guards
- Strategies
- Interceptors
- Custom pipes
- Custom decorators
- Event handlers
- Cron jobs

When any of the above are added, add their files, methods, scenarios, and priority to this plan immediately.

## Testing Priority Guide

- Critical: authentication, authorization, security, token/cookie/session handling, transactions, password reset, role/permission rules, payment/security-sensitive flows.
- High: services, controllers, validation, database provider behavior, mail delivery provider behavior.
- Medium: utilities, helpers, decorators, constants with logic, app bootstrap behavior, seed scripts.

## Estimated Coverage Inventory

- Estimated unit test files now: 11
- Estimated unit test cases now: 160-195
- Critical cases: 90-115
- High cases: 45-55
- Medium cases: 20-30

Suggested initial test file layout:

- `apps/api/src/auth/auth.service.spec.ts`
- `apps/api/src/auth/auth.controller.spec.ts`
- `apps/api/src/auth/auth.utils.spec.ts`
- `apps/api/src/auth/dto/register.dto.spec.ts`
- `apps/api/src/auth/dto/login.dto.spec.ts`
- `apps/api/src/auth/dto/forgot-password.dto.spec.ts`
- `apps/api/src/auth/dto/reset-password.dto.spec.ts`
- `apps/api/src/auth/dto/update-profile.dto.spec.ts`
- `apps/api/src/mail/mail.service.spec.ts`
- `apps/api/src/prisma/prisma.service.spec.ts`
- `packages/config/src/api.spec.ts`
- `packages/types/src/index.spec.ts`
- Optional later: `apps/api/prisma/seed.spec.ts`

## Suggested Implementation Order

1. Authentication utilities: deterministic, fast, and security-sensitive helpers.
2. AuthService: registration, login, refresh, logout, current user, password reset.
3. AuthController: request delegation, cookie setting/clearing, response shape.
4. Auth DTO validation: class-validator behavior for all inbound auth payloads.
5. MailService: SMTP configuration and mail payload creation.
6. PrismaService lifecycle hooks.
7. Shared config validation and shared Zod schemas.
8. App bootstrap behavior where practical by extracting testable helpers in a future refactor.
9. Prisma seed script behavior if seed logic remains in use.
10. Future modules as soon as they are created.

## Module Inventory And Test Plan

### Authentication Module

Priority: Critical

Files requiring unit tests:

- `AuthService`
- `AuthController`
- `auth.utils`
- Auth DTOs:
  - `RegisterDto`
  - `LoginDto`
  - `ForgotPasswordDto`
  - `ResetPasswordDto`
  - `UpdateProfileDto`
- Auth constants and types:
  - `AUTH_COOKIE_NAMES`
  - `AUTH_COOKIE_PATHS`
  - JWT payload types by compile-time coverage
- `AuthModule` wiring by lightweight module compilation test

#### AuthService

Public methods:

- `getCookieMaxAges()`
- `register()`
- `login()`
- `refresh()`
- `logout()`
- `me()`
- `updateProfile()`
- `forgotPassword()`
- `resetPassword()`

Private logic to cover indirectly:

- `createSession()`
- `verifyAccessToken()`
- `verifyRefreshToken()`
- `toAuthUser()`
- `toExperienceLevel()`
- `waitForPasswordResetResponseDelay()`
- `waitForLoginResponseDelay()`

Test scenarios for `getCookieMaxAges()`:

- Returns access-token max age from configured JWT access TTL.
- Returns refresh-token max age from configured JWT refresh TTL.
- Falls back correctly when duration parsing falls back.
- Does not expose secrets.

Test scenarios for `register()`:

- Success creates a student user with normalized lowercase email.
- Success splits single-word student name into first name with undefined last name.
- Success splits multi-word student name into first name and joined last name.
- Success hashes the password before persistence.
- Success creates `studentProfile` with mapped Prisma `ExperienceLevel`.
- Success uses `UserRole.STUDENT` and `UserStatus.ACTIVE`.
- Success creates a short-lived session, not the full remember-me refresh duration.
- Success returns only sanitized `AuthUser` fields, never password/hash/session internals.
- Success includes access and refresh token max ages.
- Success stores session context `ipAddress` and `userAgent`.
- Password mismatch throws `BadRequestException`.
- Duplicate email throws `ConflictException`.
- Duplicate email lookup is case-insensitive through lowercase email.
- Student age below 4 throws `BadRequestException`.
- Non-integer student age throws `BadRequestException`.
- Non-numeric student age throws `BadRequestException`.
- Empty or whitespace-only student name behavior is documented and tested.
- Invalid or unmapped experience level behavior is documented and tested.
- Prisma `user.findUnique` failure propagates.
- Prisma `user.create` failure propagates.
- JWT signing failure propagates.
- Session creation/update failure propagates.
- Hashing failure propagates.
- Null or undefined payload is rejected or documented as invalid caller behavior.
- Null or undefined context still creates session with optional context fields.

Test scenarios for `login()`:

- Success with valid credentials updates `lastLoginAt`.
- Success returns sanitized user.
- Success creates auth session.
- Success with `rememberMe: true` uses long refresh max age and TTL.
- Success with `rememberMe: false` uses short refresh max age and TTL.
- Success with `rememberMe` undefined uses short refresh max age and TTL.
- Email lookup normalizes email to lowercase.
- Missing user runs password verification against dummy hash and throws `UnauthorizedException`.
- Wrong password throws `UnauthorizedException`.
- Suspended, pending, or deleted user status throws `UnauthorizedException`.
- Login response delay is applied on invalid credentials.
- Login response delay is applied on inactive account.
- Login response delay does not create negative wait errors when elapsed time exceeds delay.
- Prisma `user.findUnique` failure propagates.
- Password compare failure propagates.
- Prisma `user.update` failure propagates.
- JWT signing failure propagates.
- Session creation/update failure propagates.
- Payload with null or undefined email/password is rejected or documented as invalid caller behavior.

Test scenarios for `refresh()`:

- Missing refresh token throws `UnauthorizedException`.
- Valid refresh token and active session returns new token pair and sanitized user.
- Valid refresh uses remaining session expiry to calculate new refresh max age.
- Remaining expiry of less than one second still uses at least `1s` JWT TTL.
- Expired session throws `UnauthorizedException`.
- Revoked session throws `UnauthorizedException`.
- Session user mismatch throws `UnauthorizedException`.
- Stored refresh hash mismatch revokes the session and throws `UnauthorizedException`.
- Invalid JWT throws `UnauthorizedException` or propagated JWT error per current behavior.
- JWT with wrong `type` throws `UnauthorizedException`.
- Prisma `authSession.findFirst` failure propagates.
- Prisma session revoke failure propagates.
- New session creation failure propagates.
- Context is passed into replacement session.

Test scenarios for `logout()`:

- Missing refresh token returns `{ ok: true }`.
- Valid refresh token revokes matching active session.
- Invalid refresh token still returns `{ ok: true }`.
- JWT verification failure still returns `{ ok: true }`.
- Prisma update failure inside catch path still returns `{ ok: true }` if thrown after verification.
- Does not throw when session is already revoked.
- Does not expose whether a token was valid.

Test scenarios for `me()`:

- Missing access token throws `UnauthorizedException`.
- Valid access token returns sanitized active user.
- Access token with wrong `type` throws `UnauthorizedException`.
- Valid token for missing user throws `UnauthorizedException`.
- Valid token for inactive user throws `UnauthorizedException`.
- JWT verification failure propagates or throws Unauthorized per current behavior.
- Prisma `user.findUnique` failure propagates.
- Does not return password, session, or reset-token fields.

Test scenarios for `updateProfile()`:

- Missing access token throws `UnauthorizedException`.
- Invalid access token throws or maps to unauthorized per current behavior.
- Access token with wrong `type` throws `UnauthorizedException`.
- Valid access token for missing user throws `UnauthorizedException`.
- Valid access token for inactive user throws `UnauthorizedException`.
- Success updates email and normalizes it to lowercase.
- Duplicate email for another user throws `ConflictException`.
- Success updates username.
- Duplicate username for another user throws `ConflictException`.
- Empty username is persisted as null.
- Success trims and updates first name.
- Success updates last name.
- Empty last name is persisted as null.
- Success updates phone number.
- Empty phone number is persisted as null.
- Success updates avatar URL.
- Empty avatar URL is persisted as null.
- Success updates timezone when provided.
- Empty timezone preserves the existing user timezone.
- Existing student profile can update parent name, parent email, parent phone, parent relationship, date of birth, chess rating, FIDE ID, and experience level.
- Existing student profile preserves required parent name when submitted empty.
- Existing student profile rejects invalid date of birth.
- Existing coach profile can update title, bio, qualification, FIDE ID, FIDE rating, specialization, years of experience, and hourly rate.
- User without student profile ignores student profile payload.
- User without coach profile ignores coach profile payload.
- Profile updates are wrapped in a transaction.
- Success returns sanitized `AuthUser` with updated profile fields.
- Does not allow password, role, status, approval status, verification fields, timestamps, or ownership fields to be changed.
- Prisma `user.findUnique` failure propagates.
- Prisma `user.update` failure propagates.
- Prisma nested profile update failure propagates.
- Prisma transaction failure propagates.
- Null or undefined payload is rejected or documented as invalid caller behavior.

Test scenarios for `forgotPassword()`:

- Existing user creates password reset token with SHA-256 token hash.
- Existing user sets expiry approximately 30 minutes in the future.
- Existing user sends reset email with frontend reset URL and token query param.
- Existing user returns `{ ok: true }` without exposing token.
- Missing user returns `{ ok: true }` without creating token or sending email.
- Missing user still waits for configured password reset response delay.
- Email lookup normalizes email to lowercase.
- Mail service failure propagates after token creation per current behavior.
- Prisma token creation failure propagates.
- Opaque token generation is invoked.
- Configured frontend URL is used.
- CORS fallback frontend URL path is covered by config tests.

Test scenarios for `resetPassword()`:

- Success with valid token updates user password hash.
- Success marks reset token `usedAt`.
- Success revokes all active auth sessions for the user.
- Success uses Prisma transaction for password update, token update, and session revocation.
- Success returns `"Password reset successfully."`.
- Password mismatch throws `BadRequestException`.
- Missing token record throws `BadRequestException`.
- Expired token throws `BadRequestException`.
- Used token throws `BadRequestException`.
- Token hash lookup uses SHA-256 token hash, not raw token.
- Hashing failure prevents transaction.
- Prisma transaction failure propagates.
- Null or undefined payload is rejected or documented as invalid caller behavior.

#### AuthController

Public route handler methods:

- `register()`
- `login()`
- `refresh()`
- `logout()`
- `me()`
- `updateProfile()`
- `forgotPassword()`
- `resetPassword()`

Private logic to cover indirectly:

- `setAuthCookies()`
- `clearAuthCookies()`
- `getSessionContext()`

Test scenarios for `register()`:

- Delegates body and request session context to `AuthService.register`.
- Sets access token cookie with `httpOnly`, configured `maxAge`, path `/`, sameSite `lax` in development, secure `false`.
- Sets refresh token cookie with `httpOnly`, configured `maxAge`, path `/`, sameSite `lax` in development, secure `false`.
- Uses sameSite `none` and secure `true` in production.
- Returns only `{ user }`, not tokens.
- Propagates service exceptions.

Test scenarios for `login()`:

- Delegates body and request session context to `AuthService.login`.
- Sets access and refresh cookies.
- Returns only `{ user }`.
- Uses HTTP 200 by decorator behavior in integration/metadata-level test if needed.
- Propagates service exceptions.

Test scenarios for `refresh()`:

- Reads refresh token from `nexagen_refresh_token` cookie.
- Delegates token and session context to `AuthService.refresh`.
- Sets replacement cookies.
- Returns only `{ user }`.
- Handles missing cookie by service exception propagation.

Test scenarios for `logout()`:

- Reads refresh token from cookie and delegates to `AuthService.logout`.
- Clears access token cookie with correct path, sameSite, secure flags.
- Clears refresh token cookie with correct path, sameSite, secure flags.
- Returns service result.
- Clears cookies even when token is missing.
- Propagates unexpected service exception if current implementation throws.

Test scenarios for `me()`:

- Reads access token from `nexagen_access_token` cookie.
- Delegates to `AuthService.me`.
- Returns service response.
- Propagates unauthorized exceptions.

Test scenarios for `updateProfile()`:

- Reads access token from `nexagen_access_token` cookie.
- Delegates access token and body to `AuthService.updateProfile`.
- Returns service response.
- Propagates unauthorized exceptions.
- Propagates validation exceptions from global validation pipe in integration-level coverage.

Test scenarios for `forgotPassword()`:

- Delegates `body.email` to `AuthService.forgotPassword`.
- Returns service response.
- Propagates service exceptions.

Test scenarios for `resetPassword()`:

- Delegates full body to `AuthService.resetPassword`.
- Returns service response.
- Propagates service exceptions.

#### Auth Utilities

Priority: Critical/Medium depending on helper

Public functions:

- `hashSecret()`
- `verifySecret()`
- `createOpaqueToken()`
- `hashOpaqueToken()`
- `parseDurationMs()`
- `splitStudentName()`

Test scenarios for `hashSecret()`:

- Returns a bcrypt hash different from the raw secret.
- Uses a hash that `verifySecret()` accepts.
- Does not return deterministic hash for the same secret because of bcrypt salt.
- Propagates bcrypt errors if mocked.

Test scenarios for `verifySecret()`:

- Returns true for matching raw secret and bcrypt hash.
- Returns false for non-matching raw secret.
- Handles malformed hash by returning false or propagating per bcrypt behavior.

Test scenarios for `createOpaqueToken()`:

- Returns a string.
- Uses base64url-safe characters.
- Has expected entropy length from 48 random bytes.
- Produces different values across calls.

Test scenarios for `hashOpaqueToken()`:

- Returns deterministic SHA-256 hex string.
- Returns different hashes for different tokens.
- Does not equal raw token.

Test scenarios for `parseDurationMs()`:

- Parses `ms`, `s`, `m`, `h`, and `d`.
- Defaults unitless values to milliseconds.
- Trims whitespace.
- Returns fallback for invalid text.
- Returns fallback for empty string.
- Documents behavior for `0`, very large numbers, negative values, and decimals.

Test scenarios for `splitStudentName()`:

- Single name returns firstName and undefined lastName.
- First plus last returns both.
- Multiple last-name parts are joined.
- Leading/trailing/multiple spaces are normalized.
- Empty string behavior is documented.

#### Auth DTO Validation

Priority: High

Files:

- `register.dto.ts`
- `login.dto.ts`
- `forgot-password.dto.ts`
- `reset-password.dto.ts`
- `update-profile.dto.ts`

Validation scenarios for `RegisterDto`:

- Valid payload passes.
- Missing `studentName` fails.
- Empty `studentName` fails.
- `studentName` longer than 120 fails.
- Missing `parentName` fails.
- Empty `parentName` fails.
- `parentName` longer than 120 fails.
- Non-numeric `studentAge` fails with expected message.
- Missing or invalid `experienceLevel` fails.
- Valid `beginner`, `intermediate`, `advanced` pass.
- Missing or empty `contactNumber` fails.
- `contactNumber` longer than 30 fails.
- Invalid email fails.
- Email longer than 255 fails.
- Password shorter than 8 fails.
- Password without letter fails.
- Password without number fails.
- `confirmPassword` shorter than 8 fails.
- Optional `timezone` string passes.
- Non-string `timezone` fails.
- Extra unknown properties are stripped by global whitelist in pipe-level/integration test.
- Note: password-confirm equality is service-level, not DTO-level, and must be tested in `AuthService.register`.

Validation scenarios for `LoginDto`:

- Valid email/password passes.
- Invalid email fails.
- Missing password fails.
- Non-string password fails.
- Optional boolean `rememberMe` passes.
- Non-boolean `rememberMe` fails unless transform behavior changes.

Validation scenarios for `ForgotPasswordDto`:

- Valid email passes.
- Invalid email fails.
- Missing email fails.

Validation scenarios for `ResetPasswordDto`:

- Valid token/password/confirmPassword passes.
- Missing token fails.
- Non-string token fails.
- Password shorter than 8 fails.
- Password without letter fails.
- Password without number fails.
- `confirmPassword` shorter than 8 fails.
- Note: password-confirm equality is service-level, not DTO-level, and must be tested in `AuthService.resetPassword`.

Validation scenarios for `UpdateProfileDto`:

- Valid profile payload passes.
- Invalid email fails.
- Username longer than 80 fails.
- Missing first name fails.
- Empty first name fails.
- First name longer than 120 fails.
- Last name longer than 120 fails.
- Phone number longer than 30 fails.
- Invalid avatar URL fails.
- Avatar URL longer than 500 fails.
- Timezone longer than 80 fails.
- Valid student profile payload passes.
- Student profile chess rating outside 0-4000 fails.
- Student profile invalid experience level fails.
- Student profile parent name longer than 120 fails.
- Student profile invalid parent email fails.
- Student profile parent phone longer than 30 fails.
- Student profile parent relationship longer than 80 fails.
- Valid coach profile payload passes.
- Coach profile invalid title fails.
- Coach profile FIDE rating outside 0-4000 fails.
- Coach profile years of experience outside 0-80 fails.
- Coach profile bio longer than 2000 fails.
- Coach profile qualification or specialization longer than 255 fails.
- Coach profile hourly rate longer than 20 fails.
- Optional last name, phone number, avatar URL, and timezone can be omitted.
- Extra unknown properties are stripped by global whitelist in pipe-level/integration test.

#### Auth Constants And Module Wiring

Priority: Medium

Scenarios:

- Cookie names remain `nexagen_access_token` and `nexagen_refresh_token`.
- Cookie paths remain `/`.
- `AuthModule` compiles with mocked `PrismaModule`, `MailModule`, and `JwtModule` dependencies where appropriate.
- `AuthModule` exports `AuthService`.

### Mail Module

Priority: High

Files requiring unit tests:

- `MailService`
- `MailModule` by lightweight module compilation test

#### MailService

Public methods:

- `sendPasswordResetLink()`

Private logic to cover indirectly:

- `createTransporter()`

Test scenarios for `sendPasswordResetLink()`:

- Success creates nodemailer transporter with configured host, port, secure, user, and pass.
- Success sends email to requested recipient.
- Success uses `SMTP_FROM` when present.
- Success falls back to `SMTP_USER` as from address when `SMTP_FROM` is missing.
- Success includes expected subject.
- Success includes reset link in text body.
- Success includes reset link in HTML body.
- Missing SMTP host throws `ServiceUnavailableException`.
- Missing SMTP user throws `ServiceUnavailableException`.
- Missing SMTP pass throws `ServiceUnavailableException`.
- Missing from address throws `ServiceUnavailableException`.
- `sendMail` failure propagates.
- `SMTP_SECURE` boolean transform from env is covered in config tests.
- No email is attempted when SMTP config is incomplete.

#### MailModule

Scenarios:

- Module compiles.
- Provides and exports `MailService`.

### Prisma Module

Priority: High

Files requiring unit tests:

- `PrismaService`
- `PrismaModule`

#### PrismaService

Public methods:

- `onModuleInit()`
- `onModuleDestroy()`

Test scenarios for `onModuleInit()`:

- Calls `$connect()`.
- Propagates `$connect()` failure.

Test scenarios for `onModuleDestroy()`:

- Calls `$disconnect()`.
- Propagates `$disconnect()` failure.

#### PrismaModule

Scenarios:

- Module compiles.
- Provides and exports `PrismaService`.
- Is marked global by metadata-level or module behavior test if practical.

### Application Bootstrap And Root Module

Priority: Medium

Files requiring tests:

- `app.module.ts`
- `main.ts`

#### AppModule

Scenarios:

- Imports `PrismaModule`.
- Imports `AuthModule`.
- Compiles with mocked dependencies.

#### main.ts

Current public API:

- No exported public method; `bootstrap()` is private to the file and immediately invoked.

Testing recommendation:

- Do not unit test `main.ts` heavily until bootstrap helpers are extracted.
- Future refactor should extract request logging middleware factory and app configuration into testable functions.

Scenarios to cover after extraction:

- Creates Nest app with logger `["error", "warn"]`.
- Uses validated API env.
- Applies cookie parser.
- Applies global validation pipe with `transform: true` and `whitelist: true`.
- Enables CORS with credentials and parsed origins.
- Starts app on validated port.
- Request logger logs method, URL, status, duration, and IP fallback chain.
- Request logger calls `next()`.

### Shared API Config Package

Priority: High

Files requiring unit tests:

- `packages/config/src/api.ts`

Public functions:

- `getApiEnv()`
- `getCorsOrigins()`
- `getFrontendUrl()`

Test scenarios for `getApiEnv()`:

- Applies defaults for CORS origin, JWT TTLs, response delays, `NODE_ENV`, `PORT`, SMTP port, and SMTP secure.
- Coerces numeric `PORT`.
- Rejects non-positive `PORT`.
- Rejects invalid duration strings.
- Accepts valid duration strings for all TTL/delay fields.
- Parses `SMTP_SECURE` string `"true"` to boolean true.
- Parses `SMTP_SECURE` string `"false"` to boolean false.
- Rejects invalid `SMTP_SECURE` values.
- Accepts valid `FRONTEND_URL`.
- Converts empty `FRONTEND_URL` to undefined.
- Rejects invalid `FRONTEND_URL`.
- Caching behavior is documented and tested: first parsed env is reused while process lives.
- Test isolation must reset module state or use fresh module import because of `cachedApiEnv`.

Test scenarios for `getCorsOrigins()`:

- Splits comma-separated origins.
- Trims whitespace.
- Removes empty entries.
- Returns default origin when env default is used.
- Handles single origin.

Test scenarios for `getFrontendUrl()`:

- Returns explicit `FRONTEND_URL` when set.
- Falls back to first CORS origin.
- Falls back to `http://localhost:3000` when no CORS origins remain.

### Shared Request Schema Package

Priority: High

Files requiring unit tests:

- `packages/types/src/index.ts`

Schemas requiring tests:

- `experienceLevelSchema`
- `passwordSchema`
- `registerRequestSchema`
- `loginRequestSchema`
- `forgotPasswordRequestSchema`
- `resetPasswordRequestSchema`
- `updateProfileRequestSchema`

Test scenarios:

- `experienceLevelSchema` accepts `beginner`, `intermediate`, `advanced`.
- `experienceLevelSchema` rejects unknown values and wrong casing.
- `passwordSchema` accepts at least 8 characters with at least one letter and one number.
- `passwordSchema` rejects short password.
- `passwordSchema` rejects password without letter.
- `passwordSchema` rejects password without number.
- `registerRequestSchema` accepts valid register payload.
- `registerRequestSchema` rejects invalid email.
- `registerRequestSchema` rejects overlong email/contact/name fields.
- `registerRequestSchema` rejects non-numeric student age.
- `registerRequestSchema` rejects password mismatch.
- `loginRequestSchema` accepts optional `rememberMe`.
- `loginRequestSchema` rejects invalid email and empty password.
- `forgotPasswordRequestSchema` validates email.
- `resetPasswordRequestSchema` validates token, password policy, and password confirmation.
- `updateProfileRequestSchema` validates email, username, first name, optional last name, optional phone number, optional avatar URL, and optional timezone.
- `updateProfileRequestSchema` validates existing student profile payloads.
- `updateProfileRequestSchema` validates existing coach profile payloads.
- `updateProfileRequestSchema` rejects invalid avatar URLs, invalid profile enums, invalid emails, out-of-range numbers, and overlong fields.
- Shared schemas stay aligned with backend DTO validation; divergence must be intentional and documented.

### Prisma Seed Script

Priority: Medium

File requiring optional unit tests:

- `apps/api/prisma/seed.ts`

Current executable logic:

- `main()` is not exported and runs immediately.

Testing recommendation:

- Refactor seed data creation into exported helper functions before unit testing.

Scenarios after extraction:

- Refuses to seed when `NODE_ENV === "production"`.
- Hashes seed password.
- Upserts super admin with verified active status.
- Upserts coach and coach profile.
- Upserts student and student profile.
- Updates existing seed users consistently.
- Disconnects Prisma in `finally`.
- Sets `process.exitCode = 1` on failure.

## Missing Coverage And Future Inventory

The following modules are requested by product scope but not currently implemented. When created, they must be added to this document immediately.

### Users Module

Priority when implemented: Critical/High

Expected files to track:

- UsersController
- UsersService
- User DTOs
- User repository/provider helpers
- User status guards or policies

Expected scenario categories:

- Create user.
- Update user.
- Soft delete user.
- Restore user.
- Find by id/email.
- List/filter/paginate.
- Duplicate email/username.
- Role/status transition rules.
- Forbidden role changes.
- Not found.
- Prisma failures.

### Roles And Permissions Module

Priority when implemented: Critical

Expected files to track:

- RolesGuard
- PermissionsGuard
- Role decorators
- Permission decorators
- Policy services
- JWT strategy or auth guard integration

Expected scenario categories:

- Missing authentication.
- Missing role.
- Insufficient role.
- Correct role.
- Multiple roles.
- Super admin override.
- Deleted/suspended user denial.
- Metadata absence behavior.
- Malformed token/user payload.

### Courses Module

Priority when implemented: Critical/High

Expected scenario categories:

- Create/update/archive course.
- Ownership/role checks.
- Duplicate course constraints.
- Publish/unpublish rules.
- Enrollment effects.
- Not found.
- Invalid state transitions.
- Prisma failures.

### Lessons Module

Priority when implemented: High

Expected scenario categories:

- Create/update/delete lesson.
- Course ownership checks.
- Lesson ordering.
- Publish rules.
- Content validation.
- Not found.
- Dependency failure.

### Live Classes Module

Priority when implemented: Critical/High

Expected scenario categories:

- Schedule class.
- Reschedule/cancel.
- Attendance/participant authorization.
- Time conflicts.
- Time zone handling.
- Meeting link/provider failures.
- Notifications triggered.

### Payments Module

Priority when implemented: Critical

Expected scenario categories:

- Payment creation.
- Webhook verification.
- Idempotency.
- Signature failures.
- Status transitions.
- Refunds.
- Duplicate webhook delivery.
- Provider timeout/failure.
- Transaction integrity.

### Notifications Module

Priority when implemented: High

Expected scenario categories:

- Send notification.
- Template rendering.
- Provider failure.
- Retry behavior.
- Preference filtering.
- Event payload validation.

### Files Module

Priority when implemented: Critical/High

Expected scenario categories:

- Upload authorization.
- File type/size validation.
- Storage provider failure.
- Signed URL generation.
- Delete/archive file.
- Access ownership rules.

### Shared/Common Module

Priority when implemented: Medium/High

Expected files to track:

- Common guards
- Common pipes
- Common interceptors
- Exception filters
- Decorators
- Pagination helpers
- Response serializers

Expected scenario categories:

- Valid transformation.
- Invalid input.
- Missing metadata.
- Error propagation.
- Edge cases and null/undefined input.

### Users Module

Priority: Critical

Files requiring unit tests:

- `UserService`
- `UserController`
- User DTOs:
  - `CreateUserDto`
  - `UpdateUserDto`

Expected scenario categories:

- **List/Search:**
  - Pagination handling.
  - Search by name/email/username.
  - Filter by role.
  - Filter by status.
  - Admin authorization.
- **Create User:**
  - Create with missing/invalid data.
  - Conflict on email/username.
  - Admin authorization.
  - Successful creation with default status.
- **Update User:**
  - Not found scenario.
  - Admin authorization.
  - Successful partial update.
  - Conflict on email/username.
- **Archive User:**
  - Not found scenario.
  - Admin authorization.
  - Successful status change to ARCHIVED.
- **Restore User:**
  - Not found scenario.
  - Admin authorization.
  - Successful status change to ACTIVE.
- **Delete User:**
  - Not found scenario.
  - Admin authorization.
  - Successful soft delete (isDeleted flag).
  - Attempting to fetch a soft-deleted user.

### Batches Module

Priority: High

Files requiring unit tests:

- `BatchService`
- `BatchController`
- Batch DTOs:
  - `CreateBatchDto`
  - `UpdateBatchDto`

Expected scenario categories:

- **List/Search:**
  - Pagination handling.
  - Filter by status (ACTIVE, ARCHIVED).
  - Admin authorization.
  - Coach authorization (seeing only their batches).
- **Create Batch:**
  - Validation failures (name, schedule).
  - Admin authorization.
  - Successful creation.
- **Update Batch:**
  - Not found scenario.
  - Admin authorization.
  - Successful update.
- **Archive/Restore/Delete:**
  - Not found scenario.
  - Admin authorization.
  - Correct status transitions and soft deletes.

## Maintenance Rules

- Whenever a new module is created, add a section to this plan in the same commit.
- Whenever a service, controller, guard, strategy, pipe, interceptor, utility, helper, decorator, event handler, cron job, or provider is added, list it under the correct module.
- Whenever a public method is added, list it and define success, validation failure, authorization failure, dependency failure, and edge-case scenarios.
- Whenever business logic changes, update the matching checklist before or with the code change.
- Whenever shared package logic affects backend behavior, track it here even if the file is outside `apps/api`.
- Do not add implementation tests until this inventory is accepted as the blueprint.
