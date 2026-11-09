import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import * as api from "../api/tournamentsApi";

const K = queryKeys.tournaments.public;

/** Anonymous spectating (docs/TOURNAMENTS.md §4.1): numbers and public names only, delayed moves. */
export const usePublicList = () => useQuery({ queryFn: api.getPublicList, queryKey: K.list, refetchInterval: 60_000 });
export const usePublicLive = (id: string, realtime: boolean) =>
  useQuery({ queryFn: () => api.getPublicLive(id), queryKey: K.live(id), refetchInterval: realtime ? 30_000 : 6_000, retry: 1 });
export const usePublicStandings = (id: string, realtime: boolean) =>
  useQuery({ queryFn: () => api.getPublicStandings(id), queryKey: K.standings(id), refetchInterval: realtime ? 60_000 : 15_000 });
export const usePublicGame = (id: string, gameId: string, realtime: boolean) =>
  useQuery({
    enabled: gameId !== "",
    queryFn: () => api.getPublicGame(id, gameId),
    queryKey: K.game(id, gameId),
    refetchInterval: (q) => (q.state.data?.game.status === "FINISHED" && !q.state.data.game.delayed ? false : realtime ? 20_000 : 4_000)
  });
export const usePublicCommentary = (id: string, realtime: boolean) =>
  useQuery({ queryFn: () => api.getPublicCommentary(id), queryKey: K.commentary(id), refetchInterval: realtime ? 60_000 : 10_000 });
export const useCertificateCheck = (code: string) => useQuery({ queryFn: () => api.verifyCertificate(code), queryKey: K.certificate(code), retry: false });
