import { splitPgnGames } from '@nexa-chess/types';
import {
  pgnHeaders,
  pgnPlayedAt,
  providerGet,
  ProviderUnavailableError,
  type FetchLike,
  type GameSourceProvider,
  type ProviderGamesPage,
  type ProviderProfile,
} from './provider';

const BASE = 'https://lichess.org';
/** Standard chess only (variants have no meaning for our analysis). */
const PERF_TYPES = 'ultraBullet,bullet,blitz,rapid,classical,correspondence';

/**
 * Lichess public API (https://lichess.org/api):
 *  - profile: GET /api/user/{username} → `profile.bio` holds the verification code;
 *  - games:   GET /api/games/user/{username}?since=&max=&sort=dateAsc (PGN stream).
 * Anonymous requests are allowed; the stream is consumed in one go and the
 * client never runs two requests at once, as Lichess asks.
 * Cursor = createdAt (ms) of the newest game imported, + 1.
 */
export class LichessProvider implements GameSourceProvider {
  readonly provider = 'LICHESS' as const;

  constructor(private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike) {}

  async fetchProfile(username: string): Promise<ProviderProfile> {
    const text = await providerGet(this.fetchImpl, `${BASE}/api/user/${encodeURIComponent(username)}`, 'application/json');
    let body: { disabled?: boolean; closed?: boolean; profile?: { bio?: string } };
    try {
      body = JSON.parse(text);
    } catch {
      throw new ProviderUnavailableError('Lichess returned something unexpected.');
    }
    if (body.disabled || body.closed) return { exists: false, verificationText: null };
    return { exists: true, verificationText: body.profile?.bio ?? null };
  }

  async fetchGames(username: string, cursor: string | null, limit: number, since: Date): Promise<ProviderGamesPage> {
    const from = cursor && /^\d+$/.test(cursor) ? Number(cursor) : since.getTime();
    // One extra tells us whether more are waiting.
    const params = new URLSearchParams({
      clocks: 'true',
      max: String(limit + 1),
      opening: 'true',
      perfType: PERF_TYPES,
      since: String(from),
      sort: 'dateAsc',
    });
    const text = await providerGet(
      this.fetchImpl,
      `${BASE}/api/games/user/${encodeURIComponent(username)}?${params}`,
      'application/x-chess-pgn',
    );
    // Lichess returned at most limit + 1 games; one beyond the page means more are waiting.
    const texts = splitPgnGames(text, limit + 1);
    const processed = texts.slice(0, limit);
    let lastPlayed: Date | null = null;
    const games = processed
      .map((pgn) => {
        const headers = pgnHeaders(pgn);
        const id = headers.GameId ?? /lichess\.org\/([A-Za-z0-9]{8})/.exec(headers.Site ?? '')?.[1];
        const playedAt = pgnPlayedAt(headers);
        if (playedAt) lastPlayed = playedAt;
        if (!id || !playedAt || (headers.Variant && headers.Variant !== 'Standard')) return null;
        return { externalId: id, pgn, playedAt, url: `${BASE}/${id}` };
      })
      .filter((g): g is NonNullable<typeof g> => g !== null);
    // The cursor moves past everything looked at, skipped variants included.
    const last = lastPlayed as Date | null;
    return {
      games,
      more: texts.length > limit,
      nextCursor: last ? String(last.getTime() + 1000) : cursor,
    };
  }
}
