import { ChessComProvider, chessComOpeningName } from './chess-com.provider';
import { LichessProvider } from './lichess.provider';
import {
  PROVIDER_USER_AGENT,
  ProviderNotFoundError,
  ProviderRateLimitedError,
  ProviderUnavailableError,
  pgnPlayedAt,
  type FetchLike,
} from './provider';

// No network: every request goes to a scripted fake.
type Route = { status?: number; body: string; headers?: Record<string, string> };
function fakeFetch(routes: Record<string, Route | ((url: string) => Route)>) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ headers: init?.headers ?? {}, url });
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) return { headers: { get: () => null }, ok: false, status: 404, text: async () => '' };
    const r = typeof routes[key] === 'function' ? (routes[key] as (u: string) => Route)(url) : (routes[key] as Route);
    const status = r.status ?? 200;
    return {
      headers: { get: (name: string) => r.headers?.[name.toLowerCase()] ?? null },
      ok: status >= 200 && status < 300,
      status,
      text: async () => r.body,
    };
  };
  return { calls, impl };
}

const lichessGame = (id: string, date: string, time: string, variant = 'Standard') =>
  `[Event "Rated blitz game"]\n[Site "https://lichess.org/${id}"]\n[GameId "${id}"]\n[UTCDate "${date}"]\n[UTCTime "${time}"]\n[White "alice"]\n[Black "bob"]\n[Result "1-0"]\n[Variant "${variant}"]\n\n1. e4 e5 1-0`;

describe('LichessProvider', () => {
  it('reads the verification text from the public profile bio', async () => {
    const { impl, calls } = fakeFetch({
      'https://lichess.org/api/user/alice': { body: JSON.stringify({ profile: { bio: 'hi nexa-1234abcd' } }) },
    });
    await expect(new LichessProvider(impl).fetchProfile('alice')).resolves.toEqual({
      exists: true,
      verificationText: 'hi nexa-1234abcd',
    });
    expect(calls[0].headers['User-Agent']).toBe(PROVIDER_USER_AGENT);
  });

  it('treats a closed account as not existing', async () => {
    const { impl } = fakeFetch({ 'https://lichess.org/api/user/': { body: JSON.stringify({ closed: true }) } });
    await expect(new LichessProvider(impl).fetchProfile('gone')).resolves.toEqual({ exists: false, verificationText: null });
  });

  it('exports standard games forward from the cursor and reports when more wait', async () => {
    const { impl, calls } = fakeFetch({
      'https://lichess.org/api/games/user/alice': {
        body: [
          lichessGame('aaaaaaaa', '2026.01.01', '10:00:00'),
          lichessGame('bbbbbbbb', '2026.01.02', '10:00:00', 'Chess960'),
          lichessGame('cccccccc', '2026.01.03', '10:00:00'),
          lichessGame('dddddddd', '2026.01.04', '10:00:00'),
        ].join('\n\n'),
      },
    });
    const page = await new LichessProvider(impl).fetchGames('alice', '1700000000000', 3, new Date(0));
    // The Chess960 game is skipped, and the cursor still moves past it.
    expect(page.games.map((g) => g.externalId)).toEqual(['aaaaaaaa', 'cccccccc']);
    expect(page.more).toBe(true);
    expect(page.nextCursor).toBe(String(Date.UTC(2026, 0, 3, 10) + 1000));
    const url = new URL(calls[0].url);
    expect(url.searchParams.get('since')).toBe('1700000000000');
    expect(url.searchParams.get('sort')).toBe('dateAsc');
    expect(url.searchParams.get('max')).toBe('4');
    expect(calls[0].headers.Accept).toBe('application/x-chess-pgn');
  });

  it('maps 429 to a rate-limit error with the Retry-After delay', async () => {
    const { impl } = fakeFetch({ 'https://lichess.org/api/games/user/': { body: '', headers: { 'retry-after': '60' }, status: 429 } });
    await expect(new LichessProvider(impl).fetchGames('alice', null, 10, new Date(0))).rejects.toMatchObject({
      constructor: ProviderRateLimitedError,
      retryAfterMs: 60_000,
    });
  });

  it('maps 404 and 5xx', async () => {
    await expect(new LichessProvider(fakeFetch({}).impl).fetchProfile('nobody')).rejects.toBeInstanceOf(ProviderNotFoundError);
    const { impl } = fakeFetch({ 'https://lichess.org/': { body: '', status: 503 } });
    await expect(new LichessProvider(impl).fetchProfile('alice')).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});

describe('ChessComProvider', () => {
  const base = 'https://api.chess.com/pub/player/bob';
  const month = (games: object[]) => ({ body: JSON.stringify({ games }) });

  it('reads the verification text from the profile location', async () => {
    const { impl } = fakeFetch({ [base]: { body: JSON.stringify({ location: 'nexa-feedbeef', status: 'basic' }) } });
    await expect(new ChessComProvider(impl).fetchProfile('Bob')).resolves.toEqual({
      exists: true,
      verificationText: 'nexa-feedbeef',
    });
  });

  it('walks monthly archives from the cursor, standard chess only, oldest first', async () => {
    const { impl, calls } = fakeFetch({
      [`${base}/games/archives`]: {
        body: JSON.stringify({ archives: [`${base}/games/2025/12`, `${base}/games/2026/01`, `${base}/games/2026/02`] }),
      },
      [`${base}/games/2026/01`]: month([
        { end_time: 100, pgn: 'x', rules: 'chess', url: 'https://www.chess.com/game/live/1', uuid: 'u1' },
        { end_time: 300, pgn: 'y', rules: 'chess960', uuid: 'u2' },
        { end_time: 200, pgn: 'z', rules: 'chess', uuid: 'u3' },
      ]),
      [`${base}/games/2026/02`]: month([{ end_time: 2_000_000_000, pgn: 'w', rules: 'chess', uuid: 'u4' }]),
    });
    const page = await new ChessComProvider(impl).fetchGames('bob', '2026/01:50', 10, new Date(0));
    expect(page.games.map((g) => g.externalId)).toEqual(['u1', 'u3', 'u4']);
    // The 2025/12 archive is before the cursor and is never requested.
    expect(calls.some((c) => c.url.endsWith('/2025/12'))).toBe(false);
    expect(page.nextCursor).toBe(`2033/05:2000000000`);
  });

  it('humanises the ECOUrl slug without inventing a name', () => {
    expect(chessComOpeningName('https://www.chess.com/openings/Closed-Sicilian-Defense-Grand-Prix-Attack-3...g6-4.Bc4')).toBe(
      'Closed Sicilian Defense Grand Prix Attack',
    );
    expect(chessComOpeningName(undefined)).toBeNull();
  });
});

describe('pgnPlayedAt', () => {
  it('uses UTCDate + UTCTime and rejects garbage', () => {
    expect(pgnPlayedAt({ UTCDate: '2026.01.02', UTCTime: '03:04:05' })?.toISOString()).toBe('2026-01-02T03:04:05.000Z');
    expect(pgnPlayedAt({ Date: '????.??.??' })).toBeNull();
  });
});
