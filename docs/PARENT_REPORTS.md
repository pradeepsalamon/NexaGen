# Parent reports — deferred until there is a secure parent identity

**Status: not built, on purpose (2026-10-17).** NexaGen has no parent account
and no verified parent–child link. `StudentProfile.parentName / parentEmail /
parentPhone` and `BillingProfile` are contact and billing details typed in by a
student or an admin; nothing proves the person at that address is the
student's guardian. Treating them as authorization would let anyone who knows
(or typed) an email read a minor's data.

Therefore, today:

- No analytics, report or game is sent or shown to a parent contact.
- There is no "magic link", share token or unauthenticated report URL.
- The game-analysis data is stored so a future parent view can be added
  without schema churn: per-side summaries (`game_analysis_sides`) carry
  everything an aggregate report needs, and `GameInsightsService.build` is the
  single place that composes them.

## What a parent feature needs first

1. **A parent role and account** (`UserRole.PARENT` or a separate guardian
   model) with its own sign-in, MFA policy and session handling — the same
   token-string auth as every other role.
2. **A verified link** `GuardianLink { parentId, studentId, verifiedAt,
   verifiedById, revokedAt }`:
   - created by an admin, or by an invitation the student's academy approves;
   - never inferred from `parentEmail`;
   - revocable by an admin (and by the student once of age, per policy).
3. **Authorization**: one helper like `assertCanViewStudent` that admits a
   parent only through a live `GuardianLink`, plus rows in the cross-user
   access suite (parent of A cannot read B).
4. **A parent-safe report**, not the coach view:
   - summaries a coach has approved (a `published` flag on strengths and
     development areas), recent activity, practice suggestions;
   - no raw engine evaluations without explanation, no private coach notes,
     no other students (leaderboards anonymised), no puzzle answers.
5. **Privacy review**: students are minors; consent, retention and the
   Sentry/data-collection rules (CLAUDE.md §3.6d2) apply. Notification of new
   reports goes through `MessagingDispatchService`, never direct email.

Until 1–3 exist, a request for a parent report should be answered with this
document rather than a workaround.
