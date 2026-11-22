# Form validation audit (2026-11-17 night run)

Inventory of every file in `apps/web/src` with a `<form>`, a `useForm`, or a dialog holding inputs, built by a script (the counts are files: one file can hold several dialogs). "Today" is `dev` at `183a2c00`, before this branch. The rule the sweep applies is in [UI_RULES.md](UI_RULES.md) § "Form errors".

**How much was tested, honestly:** "auto" = an assertion in `e2e/form-validation.spec.ts` drives that form in Chromium; "manual" = clicked through by hand on staging; "read only" = changed or inheriting the new `FormField`, checked by reading the code plus typecheck / lint / build, never driven in a browser; "not tested" = unchanged and not exercised. Every row that is not "auto" or "manual" could still hide a regression.

Totals: 105 files (42 with `<form>`, 17 with `useForm`, 72 dialogs). See the summary at the end.

## Auth and account (login, register, password, email change, MFA, profile, privacy)

| Route or dialog | File | Validation today | How errors show today | What changed | Tested |
|---|---|---|---|---|---|
| Coach Register Form (form) | `features/auth/components/CoachRegisterForm.tsx` | none / ad hoc | FormField error, toast | Was browser bubbles: field messages; FIDE rating ≤ 4000 and experience ≤ 80 now checked (the API limits) | auto (e2e/form-validation.spec.ts) |
| Forgot Password Form (form) | `features/auth/components/ForgotPasswordForm.tsx` | none / ad hoc | FormField error, toast | Was browser bubble: noValidate + email message | read only |
| Login Form (form) | `features/auth/login-v2/LoginAuthPanel.tsx` + `hooks/useLoginFlow.ts` | touched hook | FormField error, toast | Human messages; noValidate kept; first invalid focused; lockout (429) under the password field; other server errors toast | auto (e2e/form-validation.spec.ts) |
| Profile Form (form) | `features/auth/components/ProfileForm.tsx` | none / ad hoc | toast | No change | not tested |
| Register Form (form) | `features/auth/components/RegisterForm.tsx` | touched hook | FormField error, toast | Was browser bubbles + setCustomValidity: now validateRegisterForm (API password rule, age 3–99), field messages, focus first invalid | auto (e2e/form-validation.spec.ts) |
| Reset Password Form (form) | `features/auth/components/ResetPasswordForm.tsx` | none / ad hoc | FormField error, toast | Was setCustomValidity bubble: password rule and match under their fields | read only |
| Mfa Code Step (form) | `features/auth/components/mfa/MfaCodeStep.tsx` | none / ad hoc | FormField error, toast | Empty/short code message; wrong code toast + field marked; lockout stays under the field | read only |
| Mfa Enrollment (form) | `features/auth/components/mfa/MfaEnrollment.tsx` | none / ad hoc | FormField error, toast | Inherits FormField: error floats, no added height | read only |
| Two Factor Settings (form) | `features/auth/components/mfa/TwoFactorSettings.tsx` | none / ad hoc | FormField error, red Alert banner | Kept: status load banner (disable-form errors via FormField) | read only |
| Account Deletion Section (form, dialog, RHF) | `features/privacy/components/AccountDeletionSection.tsx` | RHF+Zod | FormField error, red Alert banner, toast | Red banner removed (the hook already toasts) | read only |
| Admin Privacy Client (dialog) | `features/privacy/components/AdminPrivacyClient.tsx` | none / ad hoc | none shown | No change | not tested |

## People (students, coaches, admins, sales, invites)

| Route or dialog | File | Validation today | How errors show today | What changed | Tested |
|---|---|---|---|---|---|
| Class Topic Editor (form) | `features/coach/components/upcoming/ClassTopicEditor.tsx` | none / ad hoc | none shown | No change | not tested |
| User Form (RHF) | `features/users/components/UserForm.tsx` | RHF+Zod | none shown | react-hook-form mode onTouched | read only |

## Batches, classes and schedules (incl. cancellation and approval requests)

| Route or dialog | File | Validation today | How errors show today | What changed | Tested |
|---|---|---|---|---|---|
| Admin Requests Client (dialog) | `features/approvals/components/AdminRequestsClient.tsx` | none / ad hoc | none shown | No change | not tested |
| Class Request Dialog (dialog) | `features/approvals/components/ClassRequestDialog.tsx` | Zod parse | inline red <p> | Start/reason messages under their fields; other issues toast; red text removed | auto (`risky-forms.spec.ts`, 2026-11-20) |
| Request Approval Dialog (dialog) | `features/approvals/components/RequestApprovalDialog.tsx` | none / ad hoc | FormField error | Inherits FormField: error floats, no added height | read only |
| Add Member Dialog (dialog) | `features/batches/components/AddMemberDialog.tsx` | none / ad hoc | none shown | No change | not tested |
| Batch Form (RHF) | `features/batches/components/BatchForm.tsx` | RHF+Zod | FormField error | react-hook-form mode onTouched | auto (e2e/form-validation.spec.ts) |
| Class Notes Dialog (dialog, RHF) | `features/coach/components/ClassNotesDialog.tsx` | RHF+Zod | none shown | react-hook-form mode onTouched | read only |

## Live class: pre-class settings and in-room dialogs

| Route or dialog | File | Validation today | How errors show today | What changed | Tested |
|---|---|---|---|---|---|
| Activity Queue Manager (form, dialog) | `features/live-class/components/activity-queue/ActivityQueueManager.tsx` | none / ad hoc | none shown | No change | not tested |
| Queue Library Picker (dialog) | `features/live-class/components/activity-queue/QueueLibraryPicker.tsx` | none / ad hoc | none shown | No change | not tested |
| Meeting Puzzle Panel (form, dialog) | `features/live-class/components/meeting/MeetingPuzzlePanel.tsx` | none / ad hoc | none shown | No change | not tested |
| Puzzle Assign Modal (dialog) | `features/live-class/components/meeting/PuzzleAssignModal.tsx` | none / ad hoc | toast | No change | not tested |
| Share Position Dialog (form, dialog) | `features/live-class/components/meeting/SharePositionDialog.tsx` | none / ad hoc | inline red <p> | Error text via FieldError / getErrorMessage | read only |
| Playout Monitor Gallery (dialog) | `features/live-class/components/meeting/activity-run/PlayoutMonitorGallery.tsx` | none / ad hoc | none shown | No change | not tested |
| Chat Composer (form) | `features/live-class/components/meeting/chat/ChatComposer.tsx` | none / ad hoc | none shown | No change | not tested |
| Chapters Panel (dialog) | `features/live-class/components/meeting/classroom/sidebar/ChaptersPanel.tsx` | none / ad hoc | toast | No change | not tested |
| Classroom Timer Tool (form) | `features/live-class/components/meeting/interactives/tools/ClassroomTimerTool.tsx` | none / ad hoc | inline red <p> | No change | not tested |
| Mystery Box Tool (form) | `features/live-class/components/meeting/interactives/tools/MysteryBoxTool.tsx` | none / ad hoc | none shown | No change | not tested |
| Match Start Dialog (dialog) | `features/live-class/components/meeting/match/MatchStartDialog.tsx` | none / ad hoc | none shown | No change | not tested |
| Simul Coach View (dialog) | `features/live-class/components/meeting/simul/SimulCoachView.tsx` | none / ad hoc | toast | No change | not tested |
| Simul Start Dialog (dialog) | `features/live-class/components/meeting/simul/SimulStartDialog.tsx` | none / ad hoc | inline red <p> | Error text via FieldError / getErrorMessage | read only |
| Preset Form Modal (dialog) | `features/live-class/settings/PresetFormModal.tsx` | Zod parse | inline red <p> | Error text via FieldError / getErrorMessage | read only |

## Assignments, homework, puzzles, puzzle sets, MCQ / Playout, courses, activities

| Route or dialog | File | Validation today | How errors show today | What changed | Tested |
|---|---|---|---|---|---|
| Assignment Form Dialog (form, dialog, RHF) | `features/assignments/components/AssignmentFormDialog.tsx` | RHF, native required | FormField error, inline red <p> | noValidate; solution/batches errors on their group title line | read only |
| Deploy Assignment Dialog (dialog) | `features/assignments/components/DeployAssignmentDialog.tsx` | none / ad hoc | inline red <p> | Batches group + due date messages; red text removed | auto (`risky-forms.spec.ts`, 2026-11-20) |
| Attach Module Modal (dialog) | `features/courses/components/AttachModuleModal.tsx` | none / ad hoc | none shown | No change | not tested |
| Game Sources Card (dialog) | `features/game-analysis/components/GameSourcesCard.tsx` | none / ad hoc | inline red <p>, toast | Error text via FieldError / getErrorMessage | read only |
| Import Game Dialog (dialog) | `features/game-library/components/ImportGameDialog.tsx` | none / ad hoc | inline red <p>, role=alert text | File problems under the PGN; refused import is a toast; red box removed | read only |
| Puzzle Import Dialog (dialog) | `features/puzzles/components/PuzzleImportDialog.tsx` | none / ad hoc | inline red <p>, toast | Error text via FieldError / getErrorMessage | read only |
| Topic Manager (dialog) | `features/puzzles/components/TopicManager.tsx` | none / ad hoc | toast | No change | not tested |
| Activity Library Table (dialog) | `features/puzzles/components/activities/ActivityLibraryTable.tsx` | none / ad hoc | none shown | No change | not tested |
| Bulk Edit Puzzles Dialog (dialog) | `features/puzzles/components/folder/BulkEditPuzzlesDialog.tsx` | none / ad hoc | inline red <p>, toast | Why "Review" is disabled: fixed one-line slot | read only |
| Recommend Revision Dialog (dialog) | `features/revision/components/RecommendRevisionDialog.tsx` | none / ad hoc | inline red <p>, toast | Kept: list load error, not a form error | not tested |

## Tournaments

| Route or dialog | File | Validation today | How errors show today | What changed | Tested |
|---|---|---|---|---|---|
| Admin Tournaments Client (dialog) | `features/tournaments/components/AdminTournamentsClient.tsx` | Zod parse | FormField error, red Alert banner | Kept: load banner | read only |
| Reason Dialog (form, dialog) | `features/tournaments/components/ReasonDialog.tsx` | none / ad hoc | none shown | No change | not tested |
| Studio Client (form) | `features/tournaments/components/StudioClient.tsx` | none / ad hoc | red Alert banner | Kept: load / permission banners | not tested |
| Tournament Editor (form, RHF) | `features/tournaments/components/TournamentEditor.tsx` | RHF+Zod | FormField error, red Alert banner, toast | Kept: red banners are load / permission states; onTouched | read only |

## Payments, discounts, invoices and payroll

| Route or dialog | File | Validation today | How errors show today | What changed | Tested |
|---|---|---|---|---|---|
| Credit Note Dialog (dialog) | `features/invoices/components/CreditNoteDialog.tsx` | none / ad hoc | red Alert banner | Refusal is a toast (dialog stays open); red banner removed | auto (`risky-forms.spec.ts`, 2026-11-20) |
| Gateway Keys Panel (form) | `features/payments/components/GatewayKeysPanel.tsx` | native required | none shown | No change | not tested |
| Manual Payments Panel (dialog) | `features/payments/components/ManualPaymentsPanel.tsx` | none / ad hoc | none shown | No change | not tested |
| Plans Panel (dialog) | `features/payments/components/PlansPanel.tsx` | Zod parse | none shown | No change | not tested |
| Record Manual Payment Dialog (dialog) | `features/payments/components/RecordManualPaymentDialog.tsx` | none / ad hoc | inline red <p> | Error text via FieldError / getErrorMessage | read only |
| Refund Dialog (dialog) | `features/payments/components/RefundDialog.tsx` | none / ad hoc | inline red <p> | Error text via FieldError / getErrorMessage | auto (`risky-forms.spec.ts`, 2026-11-20) |
| Adjustment Dialog (dialog) | `features/payroll/components/AdjustmentDialog.tsx` | none / ad hoc | none shown | No change | not tested |
| Admin Payroll Period Detail Client (dialog) | `features/payroll/components/AdminPayrollPeriodDetailClient.tsx` | none / ad hoc | none shown | No change | not tested |
| Compensation Profile Dialog (dialog) | `features/payroll/components/CompensationProfileDialog.tsx` | none / ad hoc | FormField error | Inherits FormField: error floats, no added height | read only |
| Create Period Dialog (dialog) | `features/payroll/components/CreatePeriodDialog.tsx` | none / ad hoc | inline red <p> | Error text via FieldError / getErrorMessage | read only |
| Mark Payout Paid Dialog (dialog) | `features/payroll/components/MarkPayoutPaidDialog.tsx` | none / ad hoc | none shown | No change | not tested |
| Payroll Tds Panel (form, RHF) | `features/payroll/components/PayrollTdsPanel.tsx` | RHF+Zod | FormField error | react-hook-form mode onTouched | read only |
| Reverse Adjustment Dialog (dialog) | `features/payroll/components/ReverseAdjustmentDialog.tsx` | none / ad hoc | none shown | No change | not tested |
| Rule Dialog (dialog) | `features/payroll/components/RuleDialog.tsx` | none / ad hoc | none shown | No change | not tested |

## Messaging, email, announcements, knowledge base, support settings

| Route or dialog | File | Validation today | How errors show today | What changed | Tested |
|---|---|---|---|---|---|
| Chat Thread (form) | `features/chat/components/ChatThread.tsx` | none / ad hoc | toast | No change | not tested |
| New Chat Dialog (dialog) | `features/chat/components/NewChatDialog.tsx` | none / ad hoc | toast | No change | not tested |
| Direct Email Dialog (dialog, RHF) | `features/email-admin/components/DirectEmailDialog.tsx` | RHF+Zod | FormField error | react-hook-form mode onTouched | read only |
| Email Admin Client (dialog) | `features/email-admin/components/EmailAdminClient.tsx` | none / ad hoc | red Alert banner, toast | Kept: a failed email's status banner | not tested |
| Knowledge Article Editor Client (dialog) | `features/knowledge/components/admin/KnowledgeArticleEditorClient.tsx` | none / ad hoc | toast | No change | not tested |
| Submissions Panel (dialog) | `features/knowledge/components/admin/SubmissionsPanel.tsx` | none / ad hoc | toast | No change | not tested |
| Messaging Rule Editor (dialog) | `features/messaging/components/MessagingRuleEditor.tsx` | none / ad hoc | inline red <p> | Kept: red notices are channel/placeholder advisories, not field errors | not tested |
| System Message Editor (dialog) | `features/messaging/components/SystemMessageEditor.tsx` | none / ad hoc | inline red <p> | Kept: red notices are channel/placeholder advisories, not field errors | not tested |
| Support Saved Replies Client (form, dialog, RHF) | `features/support/components/SupportSavedRepliesClient.tsx` | RHF+Zod | FormField error | react-hook-form mode onTouched | read only |
| Support Settings Client (form, RHF) | `features/support/components/SupportSettingsClient.tsx` | RHF+Zod, native required | FormField error, inline red <p> | noValidate; day closing-time error floats (standalone) | read only |
| Support Ticket Detail Client (form) | `features/support/components/SupportTicketDetailClient.tsx` | none / ad hoc | inline red <p>, toast | Kept: red text is an attachment status | not tested |

## Branding, legal pages and platform / SaaS console

| Route or dialog | File | Validation today | How errors show today | What changed | Tested |
|---|---|---|---|---|---|
| Branding Client (form, RHF) | `features/branding/components/BrandingClient.tsx` | RHF+Zod | FormField error | react-hook-form mode onTouched | read only |
| Whats App Connection Client (form) | `features/branding/components/WhatsAppConnectionClient.tsx` | native required | FormField error | Inherits FormField: error floats, no added height | read only |
| Academy Billing Card (form) | `features/platform/components/AcademyBillingCard.tsx` | none / ad hoc | none shown | No change | not tested |
| Academy Detail Client (form) | `features/platform/components/AcademyDetailClient.tsx` | native required | none shown | No change | not tested |
| Academy Domains Card (form) | `features/platform/components/AcademyDomainsCard.tsx` | none / ad hoc | none shown | No change | not tested |
| Academy Subscription Card (dialog) | `features/platform/components/AcademySubscriptionCard.tsx` | none / ad hoc | none shown | No change | not tested |
| Billing Tab (form) | `features/platform/components/BillingTab.tsx` | none / ad hoc | FormField error | Inherits FormField: error floats, no added height | read only |
| Content Packs Tab (dialog) | `features/platform/components/ContentPacksTab.tsx` | none / ad hoc | none shown | No change | not tested |
| Create Academy Dialog (form, dialog, RHF) | `features/platform/components/CreateAcademyDialog.tsx` | RHF+Zod | FormField error | react-hook-form mode onTouched | read only |
| Plan Editor Dialog (form, dialog, RHF) | `features/platform/components/PlanEditorDialog.tsx` | RHF+Zod | FormField error | react-hook-form mode onTouched | read only |
| Plans Tab (dialog) | `features/platform/components/PlansTab.tsx` | none / ad hoc | none shown | No change | not tested |
| Reason Dialog (dialog) | `features/platform/components/ReasonDialog.tsx` | none / ad hoc | none shown | No change | not tested |

## Leads, demo classes and referrals

| Route or dialog | File | Validation today | How errors show today | What changed | Tested |
|---|---|---|---|---|---|
| /demo/[classId] (form) | `app/demo/[classId]/page.tsx` | native required | inline red <p>, toast | Guest join: noValidate, name/contact field messages; passcode hint static, error floats | read only |
| Demo Booking Section (form) | `features/academy/components/DemoBookingSection.tsx` | Zod parse, native required | role=alert text | noValidate; checks shown as toasts (original page at /academy); red box removed | read only |
| Demo Booking Section (form) | `features/academy/v2/DemoBookingSection.tsx` | Zod parse, native required | red Alert banner | noValidate; field messages; failed send toast; red banner removed | read only |
| Demo Class Form (RHF) | `features/admin/components/DemoClassForm.tsx` | RHF+Zod | FormField error, inline red <p> | react-hook-form mode onTouched | read only |
| Demo Schedule Form Dialog (form, dialog) | `features/admin/components/demo-classes/DemoScheduleFormDialog.tsx` | Zod parse | inline red <p> | Field wrapper: hint static, error floats | read only |
| Lead Details Dialog (dialog) | `features/leads/components/LeadDetailsDialog.tsx` | none / ad hoc | none shown | No change | not tested |
| Rewards Store (dialog) | `features/referrals/components/RewardsStore.tsx` | none / ad hoc | toast | No change | not tested |
| Wallet Dialogs (dialog) | `features/referrals/components/WalletDialogs.tsx` | Zod parse | red Alert banner | Amount / pay-to under fields; red banner removed | read only |
| Bonus Rules Panel (form, dialog, RHF) | `features/referrals/components/admin/BonusRulesPanel.tsx` | RHF+Zod, native required | FormField error | react-hook-form mode onTouched | read only |
| Referral Detail Dialog (dialog) | `features/referrals/components/admin/ReferralDetailDialog.tsx` | none / ad hoc | none shown | No change | not tested |
| Referrers Panel (dialog) | `features/referrals/components/admin/ReferrersPanel.tsx` | Zod parse | red Alert banner | Code / amount / note under fields; red banners removed | read only |
| Sales Access Dialogs (dialog) | `features/referrals/components/admin/SalesAccessDialogs.tsx` | none / ad hoc | red Alert banner | First name / email / phone under fields; link-send failure is a toast; red banner removed | auto (e2e/form-validation.spec.ts) |
| Stages Panel (dialog) | `features/referrals/components/admin/StagesPanel.tsx` | Zod parse | red Alert banner | Each reward value checked under its own field; red banner removed; gap 16px | auto (`risky-forms.spec.ts`, 2026-11-20) |
| Vouchers Panel (form, dialog, RHF) | `features/referrals/components/admin/VouchersPanel.tsx` | RHF+Zod, native required | FormField error, inline red <p> | noValidate; voucher rule problems under the field the rule names | auto (`risky-forms.spec.ts`, 2026-11-20) |
| Withdrawals Panel (dialog) | `features/referrals/components/admin/WithdrawalsPanel.tsx` | none / ad hoc | red Alert banner | Reference / reason under fields; red banner removed | auto (`risky-forms.spec.ts`, 2026-11-20) |

## Feedback forms and settings pages

| Route or dialog | File | Validation today | How errors show today | What changed | Tested |
|---|---|---|---|---|---|
| Feedback Form Editor (dialog, RHF) | `features/feedback/components/admin/FeedbackFormEditor.tsx` | RHF+Zod | inline red <p> | react-hook-form mode onTouched | read only |
| Data Retention Client (dialog) | `features/retention/components/DataRetentionClient.tsx` | none / ad hoc | FormField error, red Alert banner, toast | Kept: preview load banner | read only |

## Other

| Route or dialog | File | Validation today | How errors show today | What changed | Tested |
|---|---|---|---|---|---|
| Form (form) | `components/forms/Form.tsx` | none / ad hoc | none shown | Blocked submit no longer toasts a list of field errors (they show under the fields); root errors still toast | auto (e2e/form-validation.spec.ts) |
| Date Picker (dialog) | `components/ui/DatePicker.tsx` | none / ad hoc | none shown | No change | not tested |
| Correct Attendance Dialog (dialog) | `features/attendance/components/class-detail/CorrectAttendanceDialog.tsx` | none / ad hoc | FormField error | Inherits FormField: error floats, no added height | read only |
| Move Tree View (dialog) | `features/chessboard/components/panels/MoveTreeView.tsx` | none / ad hoc | none shown | No change | not tested |

## Summary

- Files audited: **105**
- Tested automatically: **13** (6 in `form-validation.spec.ts`; 7 added 2026-11-20 in `risky-forms.spec.ts`, which also found and fixed date pickers whose label and error weren't wired to the picker)
- Clicked through by hand: **0**
- Read only (changed or inheriting `FormField`, not driven in a browser): **42**
- Not tested (unchanged): **50**

Kept on purpose (not field errors): red advisory notices in the messaging editors, attachment status in support tickets, and load / permission banners on tournament, retention, 2FA status and email-log screens.
