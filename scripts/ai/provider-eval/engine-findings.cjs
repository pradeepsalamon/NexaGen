// Builds docs/ai/provider-eval/inputs/game-*.json: two public-domain 19th-century
// games, scanned with the local Stockfish (depth 14) from the student's side, in
// the shape the app sends to the outside AI (`pseudonymisePlay`, ai/outside).
// Thresholds follow the Lichess win% loss rules (10 / 20 / 30 points); a
// simplification of the app's own engine review, for test data only.
// Usage: NODE_PATH=<repo>/node_modules node engine-findings.cjs <outDir>
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");

const GAMES = [
  {
    id: "game-legal",
    about: "Legall de Kermeur vs Saint Brie, Paris 1750 (public domain, 'Legal's mate'). The student played Black and lost in 7 moves.",
    side: "black",
    pgn: "1.e4 e5 2.Bc4 d6 3.Nf3 Bg4 4.Nc3 g6 5.Nxe5 Bxd1 6.Bxf7+ Ke7 7.Nd5#",
    result: "1-0"
  },
  {
    id: "game-immortal",
    about: "Anderssen vs Kieseritzky, London 1851 (public domain). The student played White and won with sacrifices the engine does not all like.",
    side: "white",
    pgn: "1.e4 e5 2.f4 exf4 3.Bc4 Qh4+ 4.Kf1 b5 5.Bxb5 Nf6 6.Nf3 Qh6 7.d3 Nh5 8.Nh4 Qg5 9.Nf5 c6 10.g4 Nf6 11.Rg1 cxb5 12.h4 Qg6 13.h5 Qg5 14.Qf3 Ng8 15.Bxf4 Qf6 16.Nc3 Bc5 17.Nd5 Qxb2 18.Bd6 Bxg1 19.e5 Qxa1+ 20.Ke2 Na6 21.Nxg7+ Kd8 22.Qf6+ Nxf6 23.Be7#",
    result: "1-0"
  }
];

function engine() {
  const sf = spawn("stockfish");
  let buf = "";
  let waiter = null;
  sf.stdout.on("data", (d) => {
    buf += d;
    if (waiter && buf.includes(waiter.token)) {
      const out = buf;
      buf = "";
      const w = waiter;
      waiter = null;
      w.resolve(out);
    }
  });
  const send = (cmd, token) =>
    new Promise((resolve) => {
      waiter = token ? { resolve, token } : null;
      sf.stdin.write(cmd + "\n");
      if (!token) resolve("");
    });
  return {
    async init() {
      await send("uci", "uciok");
      await send("setoption name Threads value 1");
      await send("isready", "readyok");
    },
    // White-relative centipawns (mate = ±10000) and the best move in UCI.
    async evalFen(fen) {
      await send(`position fen ${fen}`);
      const out = await send("go depth 14", "bestmove");
      const infos = out.split("\n").filter((l) => l.startsWith("info") && l.includes(" score "));
      const last = infos[infos.length - 1] ?? "";
      const m = last.match(/score (cp|mate) (-?\d+)/);
      let cp = m ? (m[1] === "cp" ? Number(m[2]) : Math.sign(Number(m[2]) || 1) * 10000) : 0;
      if (fen.split(" ")[1] === "b") cp = -cp;
      const best = out.match(/bestmove (\S+)/)?.[1] ?? null;
      return { best, cp };
    },
    quit: () => sf.kill()
  };
}

const winPercent = (cp) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, cp)))) - 1);

(async () => {
  const outDir = process.argv[2];
  const sf = engine();
  await sf.init();
  for (const game of GAMES) {
    const chess = new Chess();
    const sans = game.pgn.replace(/\d+\./g, " ").trim().split(/\s+/);
    const moves = [];
    const findings = [];
    let accSum = 0;
    let accN = 0;
    for (const [i, san] of sans.entries()) {
      const fenBefore = chess.fen();
      const mover = chess.turn() === "w" ? "white" : "black";
      const own = mover === game.side;
      let before = null;
      if (own) before = await sf.evalFen(fenBefore);
      chess.move(san);
      moves.push(`${own ? "*" : ""}${san}`);
      if (!own) continue;
      const after = chess.isCheckmate() ? { cp: mover === "white" ? 10000 : -10000 } : await sf.evalFen(chess.fen());
      const sign = mover === "white" ? 1 : -1;
      const loss = Math.max(0, winPercent(sign * before.cp) - winPercent(sign * after.cp));
      accSum += Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
      accN += 1;
      if (process.env.DEBUG) console.log(san, before.cp, after.cp, loss.toFixed(1));
      const kind = loss >= 30 ? "BLUNDER" : loss >= 20 ? "MISTAKE" : loss >= 10 ? "INACCURACY" : null;
      if (!kind) continue;
      const tmp = new Chess(fenBefore);
      const bestUci = before.best;
      let better = null;
      try {
        better = tmp.move({ from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), promotion: bestUci[4] }).san;
      } catch {}
      if (better === san) continue;
      findings.push({ better, kind, motif: null, moveNumber: Math.ceil((i + 1) / 2), played: san, segment: 0, winPercentLoss: Math.round(loss) });
    }
    const play = {
      accuracy: Math.round(accSum / accN),
      findings: findings.map(({ winPercentLoss, ...f }) => f),
      kind: "Own game",
      segments: [{ label: null, moves, playerSide: game.side, result: game.result, startFen: new Chess().fen() }]
    };
    const file = { about: game.about, engine: "Stockfish 16, depth 14, 1 thread", findingsWithLoss: findings, id: game.id, play };
    fs.writeFileSync(path.join(outDir, `${game.id}.json`), JSON.stringify(file, null, 2) + "\n");
    console.log(game.id, "accuracy", play.accuracy, "findings", findings.map((f) => `${f.moveNumber}.${f.played}->${f.better} ${f.kind}`).join(", "));
  }
  sf.quit();
})();
