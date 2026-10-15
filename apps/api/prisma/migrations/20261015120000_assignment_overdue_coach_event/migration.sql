-- Coach-facing "assignment overdue" messaging rule (+ its in-app notification type).
ALTER TYPE "MessagingEvent" ADD VALUE 'ASSIGNMENT_OVERDUE_COACH';
ALTER TYPE "NotificationType" ADD VALUE 'ASSIGNMENT_OVERDUE_COACH';
