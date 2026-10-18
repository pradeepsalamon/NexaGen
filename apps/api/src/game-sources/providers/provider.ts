import type { ExternalChessProvider } from '@nexa-chess/types';

/** One game as a provider returned it. Only the PGN and identity are kept. */
export type ProviderGame = {
  externalId: string;
  url: string | null;
  pgn: string;
  playedAt: Date;
};

export type ProviderGamesPage = {
  games: ProviderGame[];
  /** Resume point for the next sync (provider-specific, opaque to callers). */
  nextCursor: string | null;
  /** The provider has more games after this page. */
  more: boolean;
};

export type ProviderProfile = { exists: boolean; verificationText: string | null };

/** Provider said 429 — wait before asking again. */
export class ProviderRateLimitedError extends Error {
  constructor(readonly retryAfterMs: number | null) {
    super('The provider asked us to slow down.');
  }
}

export class ProviderNotFoundError extends Error {
  constructor() {
    super('That account was not found.');
  }
}

/** Network failure, timeout or unexpected response. */
export class ProviderUnavailableError extends Error {}

/**
 * A source of a student's own games through a provider's documented public
 * API. Username only: no password, no token, no scraping.
 */
export interface GameSourceProvider {
  readonly provider: ExternalChessProvider;
  /** Public profile text the verification code must appear in. */
  fetchProfile(username: string): Promise<ProviderProfile>;
  /** Standard-chess games after `cursor` (oldest first), at most `limit`. */
  fetchGames(username: string, cursor: string | null, limit: number, since: Date): Promise<ProviderGamesPage>;
}

export const PROVIDER_USER_AGENT = 'NexaChess/1.0 (+https://nexachess.in; game import for a student\'s own account)';
const TIMEOUT_MS = 15_000;

export type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

/** GET with a timeout and the provider error mapping every adapter shares. */
export async function providerGet(fetchImpl: FetchLike, url: string, accept: string): Promise<string> {
  let res;
  try {
    res = await fetchImpl(url, {
      headers: { Accept: accept, 'User-Agent': PROVIDER_USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ProviderUnavailableError('The provider could not be reached.');
  }
  if (res.status === 404 || res.status === 410) throw new ProviderNotFoundError();
  if (res.status === 429) {
    const retry = Number(res.headers.get('retry-after'));
    throw new ProviderRateLimitedError(Number.isFinite(retry) && retry > 0 ? retry * 1000 : null);
  }
  if (!res.ok) throw new ProviderUnavailableError(`The provider answered ${res.status}.`);
  return res.text();
}

/** "[UTCDate "2024.01.01"] [UTCTime "18:23:37"]" → Date; falls back to Date. */
export function pgnPlayedAt(headers: Record<string, string>): Date | null {
  const date = headers.UTCDate ?? headers.Date;
  const m = date ? /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(date.trim()) : null;
  if (!m) return null;
  const t = /^(\d{2}):(\d{2}):(\d{2})$/.exec((headers.UTCTime ?? '12:00:00').trim()) ?? ['', '12', '00', '00'];
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(t[1]), Number(t[2]), Number(t[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Header block of one PGN text (no move parsing). */
export function pgnHeaders(pgn: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of pgn.matchAll(/^\s*\[\s*([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/gm)) {
    out[m[1]] = m[2].replace(/\\(["\\])/g, '$1');
  }
  return out;
}
