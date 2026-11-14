import {
  API_ROUTES,
  type AdjustReferralCreditsRequest,
  type AdminReferralDetail,
  type AdminReferralLedgerItem,
  type LinkReferredUserRequest,
  type AdminReferralItem,
  type AdminReferralOverview,
  type CancelReferralRewardRequest,
  type CreateReferralBonusRuleRequest,
  type CreateReferralVoucherRequest,
  type CreateReferralStageRequest,
  type MoveReferralStageRequest,
  type PayReferralWithdrawalRequest,
  type ReferralPage,
  type ReferralRewardItem,
  type ReferralBonusRuleItem,
  type ReferralRedemptionItem,
  type ReferralVoucherItem,
  type ReferralSettingsItem,
  type ReferralStageItem,
  type ReferralWithdrawalItem,
  type ReferrerStatsItem,
  type RejectReferralRedemptionRequest,
  type RejectReferralWithdrawalRequest,
  type SendReferrerAccessLinkRequest,
  type SendReferrerAccessLinkResponse,
  type UpdateReferralBonusRuleRequest,
  type UpdateReferralSettingsRequest,
  type UpdateReferralVoucherRequest,
  type UpdateReferralStageRequest,
  type UpdateReferrerCodeRequest
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";
import { withQuery, type ReferralListParams } from "../lib/referralQuery";

const routes = API_ROUTES.adminReferrals;
type Ok = { ok: true };

export const referralAdminApi = {
  overview: () => apiFetch<AdminReferralOverview>(routes.overview),
  list: (params: ReferralListParams) => apiFetch<ReferralPage<AdminReferralItem>>(withQuery(routes.list, params)),
  get: (id: string) => apiFetch<AdminReferralDetail>(routes.get(id)),
  deleteReferral: (id: string) => apiFetch<Ok>(routes.delete(id), { method: "DELETE" }),
  sendAccessLink: (userId: string, body: SendReferrerAccessLinkRequest) =>
    apiFetch<SendReferrerAccessLinkResponse>(routes.referrerAccessLink(userId), { body, method: "POST" }),
  moveStage: (id: string, body: MoveReferralStageRequest) =>
    apiFetch<AdminReferralDetail>(routes.moveStage(id), { body, method: "PATCH" }),
  linkUser: (id: string, body: LinkReferredUserRequest) =>
    apiFetch<AdminReferralDetail>(routes.linkUser(id), { body, method: "PUT" }),
  ledger: (params: ReferralListParams) => apiFetch<ReferralPage<AdminReferralLedgerItem>>(withQuery(routes.ledger, params)),

  referrers: (params: ReferralListParams) => apiFetch<ReferralPage<ReferrerStatsItem>>(withQuery(routes.referrers, params)),
  updateReferrerCode: (userId: string, body: UpdateReferrerCodeRequest) =>
    apiFetch<{ code: string; isActive: boolean }>(routes.referrerCode(userId), { body, method: "PATCH" }),
  adjustCredits: (body: AdjustReferralCreditsRequest) => apiFetch<Ok>(routes.adjustCredits, { body, method: "POST" }),

  stages: () => apiFetch<ReferralStageItem[]>(routes.stages),
  createStage: (body: CreateReferralStageRequest) => apiFetch<ReferralStageItem>(routes.stages, { body, method: "POST" }),
  updateStage: (id: string, body: UpdateReferralStageRequest) =>
    apiFetch<ReferralStageItem>(routes.stage(id), { body, method: "PATCH" }),
  deleteStage: (id: string) => apiFetch<Ok>(routes.stage(id), { method: "DELETE" }),
  reorderStages: (stageIds: string[]) =>
    apiFetch<ReferralStageItem[]>(routes.reorderStages, { body: { stageIds }, method: "POST" }),

  bonusRules: () => apiFetch<ReferralBonusRuleItem[]>(routes.bonusRules),
  createBonusRule: (body: CreateReferralBonusRuleRequest) =>
    apiFetch<ReferralBonusRuleItem>(routes.bonusRules, { body, method: "POST" }),
  updateBonusRule: (id: string, body: UpdateReferralBonusRuleRequest) =>
    apiFetch<ReferralBonusRuleItem>(routes.bonusRule(id), { body, method: "PATCH" }),
  deleteBonusRule: (id: string) => apiFetch<{ deleted: boolean }>(routes.bonusRule(id), { method: "DELETE" }),

  vouchers: () => apiFetch<ReferralVoucherItem[]>(routes.vouchers),
  createVoucher: (body: CreateReferralVoucherRequest) => apiFetch<ReferralVoucherItem>(routes.vouchers, { body, method: "POST" }),
  updateVoucher: (id: string, body: UpdateReferralVoucherRequest) =>
    apiFetch<ReferralVoucherItem>(routes.voucher(id), { body, method: "PATCH" }),
  deleteVoucher: (id: string) => apiFetch<{ deleted: boolean }>(routes.voucher(id), { method: "DELETE" }),

  redemptions: (params: ReferralListParams) =>
    apiFetch<ReferralPage<ReferralRedemptionItem>>(withQuery(routes.redemptions, params)),
  approveRedemption: (id: string) => apiFetch<Ok>(routes.approveRedemption(id), { method: "POST" }),
  rejectRedemption: (id: string, body: RejectReferralRedemptionRequest) =>
    apiFetch<Ok>(routes.rejectRedemption(id), { body, method: "POST" }),
  revokeRedemption: (id: string, body: RejectReferralRedemptionRequest) =>
    apiFetch<Ok>(routes.revokeRedemption(id), { body, method: "POST" }),

  rewards: (params: ReferralListParams) => apiFetch<ReferralPage<ReferralRewardItem>>(withQuery(routes.rewards, params)),
  approveReward: (id: string) => apiFetch<Ok>(routes.approveReward(id), { method: "POST" }),
  cancelReward: (id: string, body: CancelReferralRewardRequest) =>
    apiFetch<Ok>(routes.cancelReward(id), { body, method: "POST" }),

  withdrawals: (params: ReferralListParams) =>
    apiFetch<ReferralPage<ReferralWithdrawalItem>>(withQuery(routes.withdrawals, params)),
  payWithdrawal: (id: string, body: PayReferralWithdrawalRequest) =>
    apiFetch<Ok>(routes.payWithdrawal(id), { body, method: "POST" }),
  rejectWithdrawal: (id: string, body: RejectReferralWithdrawalRequest) =>
    apiFetch<Ok>(routes.rejectWithdrawal(id), { body, method: "POST" }),

  settings: () => apiFetch<ReferralSettingsItem>(routes.settings),
  updateSettings: (body: UpdateReferralSettingsRequest) =>
    apiFetch<ReferralSettingsItem>(routes.settings, { body, method: "PUT" })
};
