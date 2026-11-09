import {
  API_ROUTES,
  type AddTournamentPlayersRequest,
  type AddTournamentPlayersResponse,
  type AdminTournamentOverviewDto,
  type AdminTournamentRegistrationsResponse,
  type CertificateTemplateDto,
  type CertificateTemplateRequest,
  type CertificateTemplatesResponse,
  type CertificateVerificationDto,
  type CreateTournamentCommentaryRequest,
  type CreateTournamentRequest,
  type DecideTournamentPlayerRequest,
  type PublicTournamentCommentaryDto,
  type PublicTournamentDto,
  type PublicTournamentGameDto,
  type PublicTournamentListResponse,
  type PublicTournamentLiveDto,
  type PublicTournamentStandingDto,
  type PublishTournamentResponse,
  type RemoveTournamentPlayerRequest,
  type SetTournamentCertificateRulesRequest,
  type SetTournamentFeaturedRequest,
  type SetTournamentHostsRequest,
  type TournamentAuditResponse,
  type TournamentBracketResponse,
  type TournamentCandidatesResponse,
  type TournamentCapabilitiesResponse,
  type TournamentCertificateRulesResponse,
  type TournamentCertificatesResponse,
  type TournamentCommentaryListResponse,
  type TournamentCommentaryResponse,
  type TournamentGameActionRequest,
  type TournamentGameDecisionRequest,
  type TournamentGameResponse,
  type TournamentHostCandidatesResponse,
  type TournamentGamesResponse,
  type TournamentHistoryResponse,
  type TournamentImageKind,
  type TournamentListResponse,
  type TournamentListTab,
  type TournamentLiveDto,
  type TournamentPlayerResponse,
  type TournamentPlayersResponse,
  type TournamentRealtimeTokenResponse,
  type TournamentResponse,
  type TournamentRoundsResponse,
  type TournamentSettingsResponse,
  type TournamentStandingsQuery,
  type TournamentStandingsResponse,
  type UpdateTournamentRequest,
  type UpdateTournamentSettingsRequest
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";
import { apiUrl } from "@/lib/apiBase";

const T = API_ROUTES.tournaments;
const P = API_ROUTES.publicTournaments;
const clean = (params: Record<string, unknown>) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""));

// ── discovery and lifecycle ──
export const getCapabilities = () => apiFetch<TournamentCapabilitiesResponse>(T.capabilities);
export const listTournaments = (tab: TournamentListTab, filters: { page?: number; pageSize?: number; search?: string; format?: string }) =>
  apiFetch<TournamentListResponse>(T.list, { params: clean({ tab, ...filters }) });
export const getTournament = (id: string) => apiFetch<TournamentResponse>(T.get(id));
export const createTournament = (body: CreateTournamentRequest) => apiFetch<TournamentResponse>(T.create, { body, method: "POST" });
export const updateTournament = (id: string, body: UpdateTournamentRequest) => apiFetch<TournamentResponse>(T.update(id), { body, method: "PATCH" });
export const deleteTournament = (id: string) => apiFetch<{ deleted: true }>(T.delete(id), { method: "DELETE" });
export const publishTournament = (id: string, reason?: string) => apiFetch<PublishTournamentResponse>(T.publish(id), { body: reason ? { reason } : {}, method: "POST" });
export const cancelTournament = (id: string, reason: string) => apiFetch<TournamentResponse>(T.cancel(id), { body: { reason }, method: "POST" });
export const getHostCandidates = (id: string, search: string) =>
  apiFetch<TournamentHostCandidatesResponse>(T.hostCandidates(id), { params: clean({ search }) });
export const setHosts = (id: string, body: SetTournamentHostsRequest) => apiFetch<TournamentResponse>(T.hosts(id), { body, method: "PUT" });
export function uploadTournamentImage(id: string, kind: TournamentImageKind, file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<TournamentResponse>(T.image(id, kind), { body: form, method: "POST" });
}
export const removeTournamentImage = (id: string, kind: TournamentImageKind) => apiFetch<TournamentResponse>(T.image(id, kind), { method: "DELETE" });

// ── registration ──
export const getPlayers = (id: string) => apiFetch<TournamentPlayersResponse>(T.players(id));
export const getCandidates = (id: string, search: string) => apiFetch<TournamentCandidatesResponse>(T.candidates(id), { params: clean({ search }) });
export const addPlayers = (id: string, body: AddTournamentPlayersRequest) => apiFetch<AddTournamentPlayersResponse>(T.players(id), { body, method: "POST" });
export const decidePlayer = (id: string, playerId: string, body: DecideTournamentPlayerRequest) =>
  apiFetch<TournamentPlayerResponse>(T.player(id, playerId), { body, method: "PATCH" });
export const register = (id: string) => apiFetch<TournamentPlayerResponse>(T.registration(id), { method: "POST" });
export const withdraw = (id: string) => apiFetch<TournamentPlayerResponse>(T.registration(id), { method: "DELETE" });
export const acceptInvitation = (id: string) => apiFetch<TournamentPlayerResponse>(T.invitationAccept(id), { method: "POST" });
export const declineInvitation = (id: string) => apiFetch<TournamentPlayerResponse>(T.invitationDecline(id), { method: "POST" });

// ── running ──
const hostAction = (path: string) => apiFetch<TournamentResponse>(path, { method: "POST" });
export const startTournament = (id: string) => hostAction(T.start(id));
export const pauseTournament = (id: string) => hostAction(T.pause(id));
export const resumeTournament = (id: string) => hostAction(T.resume(id));
export const startNextRound = (id: string) => hostAction(T.nextRound(id));
export const finishTournament = (id: string) => hostAction(T.finish(id));
export const publishResults = (id: string) => hostAction(T.publishResults(id));
export const removePlayer = (id: string, playerId: string, body: RemoveTournamentPlayerRequest) =>
  apiFetch<TournamentResponse>(T.withdrawPlayer(id, playerId), { body, method: "POST" });
export const recomputeStandings = (id: string) => apiFetch<TournamentStandingsResponse>(T.recomputeStandings(id), { method: "POST" });
export const getAudit = (id: string, page: number) => apiFetch<TournamentAuditResponse>(T.audit(id), { params: { page, pageSize: 25 } });

// ── views ──
export const getLive = (id: string) => apiFetch<TournamentLiveDto>(T.live(id), { silent: true });
export const getStandings = (id: string, query: TournamentStandingsQuery) => apiFetch<TournamentStandingsResponse>(T.standings(id), { params: clean(query) });
export const getRounds = (id: string) => apiFetch<TournamentRoundsResponse>(T.rounds(id));
export const getBracket = (id: string) => apiFetch<TournamentBracketResponse>(T.bracket(id));
export const getGames = (id: string, filters: { status?: string; round?: number; playerId?: string; page?: number; pageSize?: number }) =>
  apiFetch<TournamentGamesResponse & { pagination: TournamentListResponse["pagination"] }>(T.games(id), { params: clean(filters) });
export const getGame = (id: string, gameId: string) => apiFetch<TournamentGameResponse>(T.game(id, gameId), { silent: true });
export const getMyGame = (id: string) => apiFetch<{ gameId: string | null }>(T.myGame(id), { silent: true });

// ── play ──
export const sendMove = (id: string, gameId: string, body: { uci: string; ply: number }) =>
  apiFetch<TournamentGameResponse>(T.gameMove(id, gameId), { body, method: "POST", silent: true });
export const sendGameAction = (id: string, gameId: string, body: TournamentGameActionRequest) =>
  apiFetch<TournamentGameResponse>(T.gameAction(id, gameId), { body, method: "POST" });
export const decideGame = (id: string, gameId: string, body: TournamentGameDecisionRequest) =>
  apiFetch<TournamentGameResponse>(T.gameDecision(id, gameId), { body, method: "POST" });
export const arenaJoin = (id: string) => apiFetch<{ paused: boolean }>(T.arenaJoin(id), { method: "POST" });
export const arenaLeave = (id: string) => apiFetch<{ paused: boolean }>(T.arenaLeave(id), { method: "POST" });

// ── broadcast ──
export const getCommentary = (id: string, cursor?: string) =>
  apiFetch<TournamentCommentaryListResponse>(T.commentary(id), { params: clean({ cursor }), silent: true });
export const postCommentary = (id: string, body: CreateTournamentCommentaryRequest) =>
  apiFetch<TournamentCommentaryResponse>(T.commentary(id), { body, method: "POST" });
export const pinCommentary = (id: string, itemId: string, pinned: boolean) =>
  apiFetch<TournamentCommentaryResponse>(T.commentaryPin(id, itemId), { body: { pinned }, method: "POST" });
export const hideCommentary = (id: string, itemId: string, reason: string) =>
  apiFetch<TournamentCommentaryResponse>(T.commentaryHide(id, itemId), { body: { reason }, method: "POST" });
export const setFeatured = (id: string, body: SetTournamentFeaturedRequest) =>
  apiFetch<TournamentCommentaryListResponse>(T.featured(id), { body, method: "PUT" });
export const getRealtimeToken = (id: string) => apiFetch<TournamentRealtimeTokenResponse>(T.realtimeToken(id), { method: "POST", silent: true });

// ── records ──
export const getCertificates = (id: string) => apiFetch<TournamentCertificatesResponse>(T.certificates(id));
export const getCertificateRules = (id: string) => apiFetch<TournamentCertificateRulesResponse>(T.certificateRules(id));
export const setCertificateRules = (id: string, body: SetTournamentCertificateRulesRequest) =>
  apiFetch<TournamentCertificateRulesResponse>(T.certificateRules(id), { body, method: "PUT" });
export const issueCertificates = (id: string) => apiFetch<TournamentCertificatesResponse>(T.issueCertificates(id), { method: "POST" });
export const revokeCertificate = (id: string, certificateId: string, reason: string) =>
  apiFetch<TournamentCertificatesResponse>(T.revokeCertificate(id, certificateId), { body: { reason }, method: "POST" });
export const certificatePdfUrl = (certificateId: string) => apiUrl(T.certificatePdf(certificateId));
export const getActiveTemplates = () => apiFetch<CertificateTemplatesResponse>(T.templates);
export const getMyHistory = () => apiFetch<TournamentHistoryResponse>(T.myHistory);
export const getStudentHistory = (userId: string) => apiFetch<TournamentHistoryResponse>(T.studentHistory(userId));

// ── academy admin ──
export const getAdminOverview = () => apiFetch<AdminTournamentOverviewDto>(T.adminOverview);
export const getAdminRegistrations = (page: number) => apiFetch<AdminTournamentRegistrationsResponse>(T.adminRegistrations, { params: { page, pageSize: 20 } });
export const getSettings = () => apiFetch<TournamentSettingsResponse>(T.adminSettings);
export const saveSettings = (body: UpdateTournamentSettingsRequest) => apiFetch<TournamentSettingsResponse>(T.adminSettings, { body, method: "PUT" });
export const getAdminTemplates = () => apiFetch<CertificateTemplatesResponse>(T.adminTemplates);
export const createTemplate = (body: CertificateTemplateRequest) => apiFetch<{ template: CertificateTemplateDto }>(T.adminTemplates, { body, method: "POST" });
export const updateTemplate = (id: string, body: CertificateTemplateRequest) => apiFetch<{ template: CertificateTemplateDto }>(T.adminTemplate(id), { body, method: "PUT" });
export const archiveTemplate = (id: string) => apiFetch<{ template: CertificateTemplateDto }>(T.adminTemplate(id), { method: "DELETE" });

// ── public (anonymous) ──
export const getPublicList = () => apiFetch<PublicTournamentListResponse>(P.list, { silent: true });
export const getPublicTournament = (id: string) => apiFetch<{ tournament: PublicTournamentDto }>(P.get(id), { silent: true });
export const getPublicLive = (id: string) => apiFetch<PublicTournamentLiveDto>(P.live(id), { silent: true });
export const getPublicStandings = (id: string) =>
  apiFetch<{ standings: PublicTournamentStandingDto[]; pointsUnit: "half-points" | "arena-points" }>(P.standings(id), { silent: true });
export const getPublicGame = (id: string, gameId: string) => apiFetch<{ game: PublicTournamentGameDto }>(P.game(id, gameId), { silent: true });
export const getPublicCommentary = (id: string) =>
  apiFetch<{ items: PublicTournamentCommentaryDto[]; pinned: PublicTournamentCommentaryDto[]; nextCursor: string | null }>(P.commentary(id), { silent: true });
export const getPublicRealtimeToken = (id: string) => apiFetch<TournamentRealtimeTokenResponse>(P.realtimeToken(id), { method: "POST", silent: true });
export const verifyCertificate = (code: string) => apiFetch<CertificateVerificationDto>(P.verifyCertificate(code), { silent: true });
