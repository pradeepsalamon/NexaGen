import { useEffect, useState } from "react";
import { useBoardStore } from "../../context/BoardProvider";
import { Loader2 } from "lucide-react";

interface MasterbaseMove {
  san: string;
  white: number;
  draws: number;
  black: number;
  averageRating: number;
}

interface MasterbaseGame {
  white: { name: string; rating?: number };
  black: { name: string; rating?: number };
  year: number;
  month: string;
  result?: string;
}

interface MasterbaseResponse {
  white: number;
  draws: number;
  black: number;
  moves: MasterbaseMove[];
  topGames: MasterbaseGame[];
  opening?: { eco?: string; name?: string };
}

export function MasterbasePanel() {
  const fen = useBoardStore((state) => state.fen);
  const [data, setData] = useState<MasterbaseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!fen) return;

    const controller = new AbortController();
    const fetchExplorer = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const url = `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(fen)}&topGames=5&moves=10`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`Explorer responded with ${res.status}`);
        const json = (await res.json()) as MasterbaseResponse;
        setData(json);
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to load master games.");
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchExplorer();
    return () => controller.abort();
  }, [fen]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-sm text-app-muted p-4 text-center">
        <span className="font-semibold mb-2">Masterbase Explorer</span>
        <p>{error}</p>
      </div>
    );
  }

  if (isLoading && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-sm text-app-muted p-4 text-center">
        <Loader2 className="animate-spin mb-4" size={24} />
        <p>Searching master games…</p>
      </div>
    );
  }

  if (!data) return null;

  const total = data.white + data.draws + data.black;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const maxMoveGames = Math.max(1, ...data.moves.map((m) => m.white + m.draws + m.black));

  return (
    <div className="flex flex-col gap-4 p-2 text-sm">
      <div>
        <h3 className="font-bold border-b border-app-border pb-2 mb-2">Master Games</h3>
        {data.opening?.name && (
          <p className="text-xs text-app-muted">
            <span className="font-medium">{data.opening.eco ? `${data.opening.eco} — ` : ""}{data.opening.name}</span>
          </p>
        )}
        <p className="text-xs text-app-muted mt-1">{total.toLocaleString()} games in the masters database</p>

        <div className="flex h-3 rounded-full overflow-hidden mt-2 bg-app-border">
          <div className="bg-white border-r border-app-border" style={{ width: `${pct(data.white)}%` }} title={`White ${pct(data.white)}%`} />
          <div className="bg-gray-400" style={{ width: `${pct(data.draws)}%` }} title={`Draws ${pct(data.draws)}%`} />
          <div className="bg-gray-900" style={{ width: `${pct(data.black)}%` }} title={`Black ${pct(data.black)}%`} />
        </div>
        <div className="flex justify-between text-[11px] text-app-muted mt-1">
          <span>White {pct(data.white)}%</span>
          <span>Draws {pct(data.draws)}%</span>
          <span>Black {pct(data.black)}%</span>
        </div>
      </div>

      {data.moves.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-app-muted mb-2">Continuations</h4>
          <div className="flex flex-col gap-1.5 font-mono text-xs">
            {data.moves.slice(0, 8).map((m) => {
              const games = m.white + m.draws + m.black;
              return (
                <div key={m.san} className="flex items-center gap-2">
                  <span className="w-12 font-semibold text-app-text">{m.san}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden bg-app-soft">
                    <div className="h-full bg-primary/70" style={{ width: `${Math.max(4, (games / maxMoveGames) * 100)}%` }} />
                  </div>
                  <span className="w-20 text-right text-app-muted">{games.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.topGames.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-app-muted mb-2">Recent Games</h4>
          <div className="flex flex-col gap-1 text-xs">
            {data.topGames.map((g, i) => (
              <a
                key={i}
                href={`https://lichess.org/masters/search?tags=${g.year}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex justify-between gap-2 py-1 px-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span className="truncate">
                  <span className="font-medium">{g.white.name}</span>
                  <span className="text-app-muted"> vs </span>
                  <span className="font-medium">{g.black.name}</span>
                </span>
                <span className="text-app-muted whitespace-nowrap">{g.month} {g.year}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {total === 0 && data.moves.length === 0 && (
        <p className="text-xs text-app-muted text-center py-4">No master games found for this position.</p>
      )}
    </div>
  );
}
