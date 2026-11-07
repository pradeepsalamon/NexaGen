-- Registration messages (docs/MESSAGING.md): two new events, and the two existing account
-- rules switched on where no admin has ever edited them.
ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_DECLINED';
ALTER TYPE "NotificationType" ADD VALUE 'REGISTRATION_PENDING_ADMIN';
ALTER TYPE "MessagingEvent" ADD VALUE 'ACCOUNT_DECLINED';
ALTER TYPE "MessagingEvent" ADD VALUE 'REGISTRATION_PENDING_ADMIN';

-- "Registration received": never sent before this release, and its old copy ("Sign in any
-- time") was wrong for an account waiting for approval. Untouched rows only.
UPDATE "messaging_rules"
SET "enabled" = true,
    "emailEnabled" = true,
    "inAppEnabled" = true,
    "whatsappEnabled" = false,
    "title" = 'We''ve received your registration',
    "body" = 'Hi {{recipient.firstName}}, thank you for registering with {{academy.name}}. Our team reviews every new account, and we''ll let you know as soon as yours is approved.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "event" = 'ACCOUNT_WELCOME'
  AND "updatedById" IS NULL
  AND "enabled" = false
  AND "body" = 'Welcome to {{academy.name}}, {{recipient.firstName}}! Sign in any time at {{links.login}}.';

-- "Account approved": same wording, now on by email + in-app. Untouched rows only.
UPDATE "messaging_rules"
SET "enabled" = true,
    "emailEnabled" = true,
    "inAppEnabled" = true,
    "whatsappEnabled" = false,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "event" = 'ACCOUNT_APPROVED'
  AND "updatedById" IS NULL
  AND "enabled" = false
  AND "body" = 'Hi {{recipient.firstName}}, your {{academy.name}} account has been approved. Sign in at {{links.login}}.';
