# NexaGen Database Reference

> Last updated: 2026-08-29

## PostgreSQL Setup

- **Container**: `nexa_postgres` (postgres:15-alpine)
- **Production DB**: `nexa_chess`
- **Development DB**: `vps_dev`
- **Port**: 5432 (localhost only)
- **ORM**: Prisma

## Models (25 total)

### User & Auth
- `User` — id, email, password, name, role, phone, avatarUrl, emailVerified, deletedAt
- `StudentProfile` — userId → User, fideRating, dob, school, parentName, parentPhone
- `CoachProfile` — userId → User, fideRating, fideTitle, specialization, experience
- `AuthSession` — userId → User, refreshToken, userAgent, ip, expiresAt
- `PasswordResetToken` — userId → User, token, expiresAt
- `EmailVerificationToken` — userId → User, token, expiresAt

### Batches & Classes
- `Batch` — name, description, level, schedule, status, deletedAt
- `BatchCoach` — batchId → Batch, coachId → User
- `BatchStudent` — batchId → Batch, studentId → User
- `CoachClass` — batchId → Batch, coachId → User, title, date, startTime, endTime, status
- `LiveSession` — classId → CoachClass, roomName, roomSid, isActive
- `LiveChatMessage` — sessionId → LiveSession, senderId → User, content, senderName

### Attendance
- `ClassAttendance` — classId → CoachClass, date, totalStudents, presentCount, status
- `AttendanceLog` — attendanceId → ClassAttendance, studentId → User, status, joinedAt, leftAt
- `CoachAttendance` — coachId → User, classId → CoachClass, date, status
- `CoachAttendanceLog` — attendanceId → CoachAttendance, joinedAt, leftAt, duration
- `AttendancePolicy` — batchId → Batch, minAttendancePercent, autoMarkAbsent

### Curriculum
- `Course` — title, description, level, status
- `CourseModule` — courseId → Course, title, content, order
- `StudentCourseProgress` — studentId → User, courseId → Course, moduleId → CourseModule, status
- `Practice` — title, pgn, fen, difficulty, courseId → Course
- `StudentPractice` — studentId → User, practiceId → Practice, answer, isCorrect, timeSpent
- `StudentActivity` — studentId → User, type, description

### System
- `Announcement` — title, content, priority, targetRole, createdBy → User
- `TrashAuditLog` — entityType, entityId, action, performedBy → User, metadata

## Roles

```
STUDENT      — Can view own dashboard, attend classes, do practice
COACH        — Can manage classes, take attendance, use Stockfish
ADMIN        — Can manage batches, users, coaches, view reports
SUPER_ADMIN  — Full access including system config
```

## Migration Commands

```bash
# Development
cd /opt/nexa-chess/NexaGen-dev
npm run db:migrate:dev               # Apply pending migrations
npm run db:generate                  # Regenerate Prisma client
npm run db:seed                      # Seed dev database

# Check status
npm run db:migrate:status

# Create new migration
npx prisma migrate dev --name <migration_name> --schema apps/api/prisma/schema.prisma

# NEVER use db push for schema changes (causes missing migrations in production)
```

## Direct Database Access

```bash
# Dev database
docker exec -it nexa_postgres psql -U postgres -d vps_dev

# Useful queries
SELECT count(*) FROM "User";
SELECT role, count(*) FROM "User" GROUP BY role;
SELECT * FROM "Batch" WHERE "deletedAt" IS NULL;
\dt                                    # List all tables
\d "User"                              # Describe User table
```
