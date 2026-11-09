import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TournamentCommentaryListResponse, TournamentListTab, TournamentStandingsQuery } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import * as api from "../api/tournamentsApi";

const K = queryKeys.tournaments;

/** Everything about one tournament (detail, live, standings, rounds, games, feed). */
export function useInvalidateTournament() {
  const qc = useQueryClient();
  return (id: string) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: K.detail(id) }),
      qc.invalidateQueries({ queryKey: K.live(id) }),
      qc.invalidateQueries({ queryKey: ["tournaments", "standings", id] }),
      qc.invalidateQueries({ queryKey: K.rounds(id) }),
      qc.invalidateQueries({ queryKey: K.bracket(id) }),
      qc.invalidateQueries({ queryKey: K.players(id) }),
      qc.invalidateQueries({ queryKey: ["tournaments", "games", id] }),
      qc.invalidateQueries({ queryKey: K.myGame(id) }),
      qc.invalidateQueries({ queryKey: K.certificates(id) }),
      qc.invalidateQueries({ queryKey: ["tournaments", "list"] })
    ]);
}

export const useCapabilities = () => useQuery({ queryFn: api.getCapabilities, queryKey: K.capabilities, staleTime: 60_000 });

export function useTournamentList(tab: TournamentListTab, filters: { page: number; search: string; format: string }) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => api.listTournaments(tab, { ...filters, pageSize: 12 }),
    queryKey: K.list({ tab, ...filters })
  });
}

export const useTournament = (id: string) => useQuery({ enabled: id !== "", queryFn: () => api.getTournament(id), queryKey: K.detail(id) });

export function useTournamentLive(id: string, options: { enabled?: boolean; realtime: boolean }) {
  return useQuery({
    enabled: options.enabled ?? true,
    queryFn: () => api.getLive(id),
    queryKey: K.live(id),
    // A nudge refetches at once; the poll is the safety net (and the only path without LiveKit).
    refetchInterval: options.realtime ? 30_000 : 4_000
  });
}

export function useStandings(id: string, query: TournamentStandingsQuery, options: { realtime: boolean; enabled?: boolean }) {
  return useQuery({
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
    queryFn: () => api.getStandings(id, query),
    queryKey: K.standings(id, query as Record<string, unknown>),
    refetchInterval: options.realtime ? 60_000 : 10_000
  });
}

export const useRounds = (id: string, enabled = true) => useQuery({ enabled, queryFn: () => api.getRounds(id), queryKey: K.rounds(id) });
export const useBracket = (id: string, enabled = true) => useQuery({ enabled, queryFn: () => api.getBracket(id), queryKey: K.bracket(id) });
export const usePlayers = (id: string) => useQuery({ queryFn: () => api.getPlayers(id), queryKey: K.players(id) });
export const useCandidates = (id: string, q: string, enabled: boolean) =>
  useQuery({ enabled, placeholderData: keepPreviousData, queryFn: () => api.getCandidates(id, q), queryKey: K.candidates(id, q) });

export const useHostCandidates = (id: string, q: string, enabled: boolean) =>
  useQuery({ enabled, placeholderData: keepPreviousData, queryFn: () => api.getHostCandidates(id, q), queryKey: [...K.candidates(id, q), "hosts"] });

export function useGames(id: string, filters: { status?: string; round?: number; playerId?: string; page?: number }, realtime: boolean) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => api.getGames(id, { ...filters, pageSize: 50 }),
    queryKey: K.games(id, filters),
    refetchInterval: realtime ? 60_000 : 8_000
  });
}

export function useGame(id: string, gameId: string, options: { realtime: boolean; live: boolean; enabled?: boolean; slow?: boolean }) {
  return useQuery({
    enabled: (options.enabled ?? true) && gameId !== "",
    queryFn: () => api.getGame(id, gameId),
    queryKey: K.game(id, gameId),
    // The two players poll fast without LiveKit; spectators see the delayed view anyway.
    refetchInterval: (q) => (q.state.data?.game.status === "FINISHED" && !q.state.data.game.delayed ? false : options.realtime ? 20_000 : options.live ? 1_500 : options.slow ? 10_000 : 4_000)
  });
}

export const useMyGame = (id: string, enabled: boolean) =>
  useQuery({ enabled, queryFn: () => api.getMyGame(id), queryKey: K.myGame(id), refetchInterval: enabled ? 5_000 : false });

export function useCommentary(id: string, realtime: boolean) {
  return useInfiniteQuery({
    getNextPageParam: (last: TournamentCommentaryListResponse) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.getCommentary(id, pageParam),
    queryKey: K.commentary(id),
    refetchInterval: realtime ? 60_000 : 6_000
  });
}

export const useAudit = (id: string, page: number) => useQuery({ placeholderData: keepPreviousData, queryFn: () => api.getAudit(id, page), queryKey: K.audit(id, page) });
export const useCertificates = (id: string, enabled = true) => useQuery({ enabled, queryFn: () => api.getCertificates(id), queryKey: K.certificates(id) });
export const useCertificateRules = (id: string, enabled = true) =>
  useQuery({ enabled, queryFn: () => api.getCertificateRules(id), queryKey: K.certificateRules(id) });
export const useActiveTemplates = (enabled = true) => useQuery({ enabled, queryFn: api.getActiveTemplates, queryKey: K.templates });
export const useMyHistory = () => useQuery({ queryFn: api.getMyHistory, queryKey: K.history(null) });
export const useStudentHistory = (userId: string) => useQuery({ queryFn: () => api.getStudentHistory(userId), queryKey: K.history(userId) });

export const useAdminOverview = () => useQuery({ queryFn: api.getAdminOverview, queryKey: K.admin.overview });
export const useAdminRegistrations = (page: number) =>
  useQuery({ placeholderData: keepPreviousData, queryFn: () => api.getAdminRegistrations(page), queryKey: K.admin.registrations(page) });
export const useTournamentSettings = () => useQuery({ queryFn: api.getSettings, queryKey: K.admin.settings });
export const useAdminTemplates = () => useQuery({ queryFn: api.getAdminTemplates, queryKey: K.admin.templates });

/** A mutation that refreshes everything about the tournament afterwards. */
export function useTournamentMutation<TArgs, TResult>(id: string, fn: (args: TArgs) => Promise<TResult>) {
  const invalidate = useInvalidateTournament();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidate(id) });
}

export function useAdminMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ["tournaments", "admin"] }) });
}
