import {
  providerGet,
  ProviderUnavailableError,
  type FetchLike,
  type GameSourceProvider,
  type ProviderGame,
  type ProviderGamesPage,
  type ProviderProfile,
} from './provider';

const BASE = 'https://api.chess.com/pub/player';
/** Monthly archives read per sync — bounds the requests one sync makes. */
const MAX_MONTHS_PER_SYNC = 3;

type ArchiveGame = { url?: string; uuid?: string; pgn?: string; end_time?: number; rules?: string };

/**
 * Chess.com Published-Data API (https://www.chess.com/news/view/published-data-api):
 *  - profile: GET /pub/player/{username} → `location` holds the verification code
 *    (the PubAPI exposes no "about" text);
 *  - games:   GET /pub/player/{username}/games/archives, then one month at a
 *    time: GET /pub/player/{username}/games/{YYYY}/{MM}.
 * Public data only, read serially (the PubAPI rate-limits parallel requests).
 * Chess.com's own `accuracies` field is deliberately ignored — NexaGen's
 * figures come from its own analysis. Cursor = "YYYY/MM:<end_time>".
 */
export class ChessComProvider implements GameSourceProvider {
  readonly provider = 'CHESS_COM' as const;

  constructor(private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike) {}

  async fetchProfile(username: string): Promise<ProviderProfile> {
    const body = this.json<{ location?: string; status?: string }>(
      await providerGet(this.fetchImpl, `${BASE}/${encodeURIComponent(username.toLowerCase())}`, 'application/json'),
    );
    if (body.status === 'closed' || body.status?.startsWith('closed:')) return { exists: false, verificationText: null };
    return { exists: true, verificationText: body.location ?? null };
  }

  async fetchGames(username: string, cursor: string | null, limit: number, since: Date): Promise<ProviderGamesPage> {
    const user = encodeURIComponent(username.toLowerCase());
    const archives = this.json<{ archives?: string[] }>(
      await providerGet(this.fetchImpl, `${BASE}/${user}/games/archives`, 'application/json'),
    ).archives ?? [];

    const parsed = /^(\d{4})\/(\d{2}):(\d+)$/.exec(cursor ?? '');
    const fromMonth = parsed ? `${parsed[1]}/${parsed[2]}` : `${since.getUTCFullYear()}/${String(since.getUTCMonth() + 1).padStart(2, '0')}`;
    const afterEnd = parsed ? Number(parsed[3]) : Math.floor(since.getTime() / 1000);
    const months = archives
      .map((url) => /\/games\/(\d{4})\/(\d{2})$/.exec(url))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => `${m[1]}/${m[2]}`)
      .filter((month) => month >= fromMonth)
      .sort();

    const collected: ProviderGame[] = [];
    let lastMonth: string | null = null;
    let monthsRead = 0;
    let more = false;
    for (const month of months) {
      if (monthsRead >= MAX_MONTHS_PER_SYNC || collected.length > limit) {
        more = true;
        break;
      }
      monthsRead += 1;
      const games = (this.json<{ games?: ArchiveGame[] }>(
        await providerGet(this.fetchImpl, `${BASE}/${user}/games/${month}`, 'application/json'),
      ).games ?? [])
        .filter((g) => g.rules === 'chess' && g.pgn && g.end_time && g.end_time > afterEnd)
        .sort((a, b) => (a.end_time ?? 0) - (b.end_time ?? 0));
      for (const g of games) {
        const id = g.uuid ?? g.url?.split('/').pop();
        if (!id) continue;
        collected.push({ externalId: id, pgn: g.pgn!, playedAt: new Date(g.end_time! * 1000), url: g.url ?? null });
      }
      lastMonth = month;
    }
    if (collected.length > limit) more = true;
    const page = collected.slice(0, limit);
    const last = page[page.length - 1];
    const lastPageMonth = last
      ? `${last.playedAt.getUTCFullYear()}/${String(last.playedAt.getUTCMonth() + 1).padStart(2, '0')}`
      : lastMonth;
    return {
      games: page,
      more,
      nextCursor: last ? `${lastPageMonth}:${Math.floor(last.playedAt.getTime() / 1000)}` : cursor,
    };
  }

  private json<T>(text: string): T {
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ProviderUnavailableError('Chess.com returned something unexpected.');
    }
  }
}

/** Chess.com's ECOUrl slug → readable opening name (their naming; never invented). */
export function chessComOpeningName(ecoUrl: string | undefined): string | null {
  const slug = ecoUrl?.split('/openings/')[1];
  if (!slug) return null;
  const words: string[] = [];
  for (const token of slug.split('-')) {
    if (/^\d/.test(token)) break;
    words.push(token);
  }
  const name = words.join(' ').trim();
  return name ? name.slice(0, 120) : null;
}
