-- Review M1 (2026-11-23): a class an admin moves tells its students (rule CLASS_RESCHEDULED).

-- AlterEnum
ALTER TYPE "MessagingEvent" ADD VALUE 'CLASS_RESCHEDULED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CLASS_RESCHEDULED';
