// Branching move tree for analysis boards and the Game Library.
//
// One tree per game: the root is the starting position, every node is one
// half-move, and `children[0]` is always the main continuation — later
// children are alternatives (variations). Playing a move that differs from
// the existing continuation never rewrites it: it is added as another child.
// Only `promoteToMainline` reorders children, and it keeps every line.
//
// This module is pure and chess-library-free. Anything that has to validate a
// move or compute a position takes a `MoveTreeChessFactory`, so the web app
// and the API each pass their own castling-sanitised `Chess` wrapper.

export const STANDARD_START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Upper bound on nodes accepted from an imported PGN or a client payload. */
export const MAX_MOVE_TREE_NODES = 5000;

export interface MoveTreeNode {
  /** Stable within one tree instance; NOT part of the PGN, regenerated on parse. */
  id: string;
  san: string;
  /** e.g. "e2e4", "e7e8q". */
  uci: string;
  /** Position after this move. */
  fen: string;
  /** Comment after the move (`{...}` following it in PGN). */
  comment?: string;
  /** Comment written before the move — only the first move of a line uses it. */
  preComment?: string;
  /** Numeric Annotation Glyphs ($1 = "!", $2 = "?", ...). */
  nags?: number[];
  /** children[0] = main continuation; the rest are variations. */
  children: MoveTreeNode[];
}

export interface MoveTree {
  rootFen: string;
  /** Comment before the first move. */
  rootComment?: string;
  children: MoveTreeNode[];
}

/**
 * A path is the child index taken at each depth from the root. `[]` is the
 * start position, `[0, 0, 1]` = mainline 1st move, mainline 2nd move, then the
 * first alternative at the 3rd half-move.
 */
export type MoveTreePath = number[];

export interface MoveTreeMoveInput {
  san: string;
  uci: string;
  fen: string;
}

/** Minimal chess engine surface the parser needs (chess.js satisfies it via an adapter). */
export interface MoveTreeChess {
  /** Applies a SAN move; returns null when illegal. */
  move(san: string): { san: string; from: string; to: string; promotion?: string } | null;
  fen(): string;
}
export type MoveTreeChessFactory = (fen: string) => MoveTreeChess;

let idCounter = 0;
function nextId() {
  idCounter = (idCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `m${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function createMoveTree(rootFen: string = STANDARD_START_FEN): MoveTree {
  return { rootFen, children: [] };
}

/** Linear tree (no variations) from a list of moves already played. */
export function moveTreeFromMoves(rootFen: string, moves: MoveTreeMoveInput[]): MoveTree {
  const tree = createMoveTree(rootFen);
  let level = tree.children;
  for (const m of moves) {
    const node: MoveTreeNode = { id: nextId(), san: m.san, uci: m.uci, fen: m.fen, children: [] };
    level.push(node);
    level = node.children;
  }
  return tree;
}

export function getMoveTreeNode(tree: MoveTree, path: MoveTreePath): MoveTreeNode | null {
  let level = tree.children;
  let node: MoveTreeNode | null = null;
  for (const index of path) {
    node = level[index] ?? null;
    if (!node) return null;
    level = node.children;
  }
  return node;
}

/** Nodes from the root down to (and including) the node at `path`. */
export function nodesAlongPath(tree: MoveTree, path: MoveTreePath): MoveTreeNode[] {
  const nodes: MoveTreeNode[] = [];
  let level = tree.children;
  for (const index of path) {
    const node = level[index];
    if (!node) break;
    nodes.push(node);
    level = node.children;
  }
  return nodes;
}

/** FEN at `path` (the root FEN for `[]`). */
export function fenAtPath(tree: MoveTree, path: MoveTreePath): string {
  if (path.length === 0) return tree.rootFen;
  return getMoveTreeNode(tree, path)?.fen ?? tree.rootFen;
}

/**
 * The full line `path` lies on: the moves to it, then the main continuation
 * after it to the end. This is what a linear move list shows and what an
 * older client that only understands one line receives.
 */
export function lineThroughPath(tree: MoveTree, path: MoveTreePath): {
  nodes: MoveTreeNode[];
  path: MoveTreePath;
} {
  const nodes = nodesAlongPath(tree, path);
  const fullPath = path.slice(0, nodes.length);
  let level = nodes.length ? nodes[nodes.length - 1].children : tree.children;
  while (level.length > 0) {
    nodes.push(level[0]);
    fullPath.push(0);
    level = level[0].children;
  }
  return { nodes, path: fullPath };
}

export function mainlineNodes(tree: MoveTree): MoveTreeNode[] {
  return lineThroughPath(tree, []).nodes;
}

export function isMainlinePath(path: MoveTreePath): boolean {
  return path.every((index) => index === 0);
}

export function findMoveTreePath(tree: MoveTree, nodeId: string): MoveTreePath | null {
  const walk = (level: MoveTreeNode[], prefix: number[]): number[] | null => {
    for (let i = 0; i < level.length; i += 1) {
      const node = level[i];
      const here = [...prefix, i];
      if (node.id === nodeId) return here;
      const found = walk(node.children, here);
      if (found) return found;
    }
    return null;
  };
  return walk(tree.children, []);
}

export function countMoveTreeNodes(tree: MoveTree): number {
  let count = 0;
  const walk = (level: MoveTreeNode[]) => {
    for (const node of level) {
      count += 1;
      walk(node.children);
    }
  };
  walk(tree.children);
  return count;
}

export function moveTreeHasVariations(tree: MoveTree): boolean {
  const walk = (level: MoveTreeNode[]): boolean => {
    if (level.length > 1) return true;
    return level.some((node) => walk(node.children));
  };
  return walk(tree.children);
}

/**
 * Copy-on-write: clone the root and every node along `path`, leaving all other
 * subtrees shared. Returns the clone and the cloned node list (index i = depth
 * i+1), so callers can mutate them without touching the original tree.
 */
function cloneAlong(tree: MoveTree, path: MoveTreePath): { tree: MoveTree; nodes: MoveTreeNode[] } {
  const root: MoveTree = { ...tree, children: [...tree.children] };
  const nodes: MoveTreeNode[] = [];
  let level = root.children;
  for (const index of path) {
    const original = level[index];
    if (!original) break;
    const copy: MoveTreeNode = { ...original, children: [...original.children] };
    level[index] = copy;
    nodes.push(copy);
    level = copy.children;
  }
  return { tree: root, nodes };
}

/**
 * Plays `move` from the position at `path`. An existing child with the same
 * move is reused (navigation, no duplicate); otherwise the move is appended —
 * as the continuation when there is none yet, else as a new variation. The
 * existing mainline is never modified.
 */
export function addMoveToTree(
  tree: MoveTree,
  path: MoveTreePath,
  move: MoveTreeMoveInput,
): { tree: MoveTree; path: MoveTreePath; created: boolean } {
  const parent = path.length ? getMoveTreeNode(tree, path) : null;
  if (path.length && !parent) return { tree, path, created: false };
  const siblings = parent ? parent.children : tree.children;
  const existing = siblings.findIndex((child) => child.uci === move.uci);
  if (existing >= 0) return { tree, path: [...path, existing], created: false };

  const { tree: next, nodes } = cloneAlong(tree, path);
  const level = path.length ? nodes[nodes.length - 1].children : next.children;
  level.push({ id: nextId(), san: move.san, uci: move.uci, fen: move.fen, children: [] });
  return { tree: next, path: [...path, level.length - 1], created: true };
}

/**
 * Makes the line through `path` the mainline at every depth, keeping each
 * former main continuation as the first alternative at its branch point. No
 * node, comment or nested variation is dropped. Returns the moved node's new
 * path (all zeros).
 */
export function promoteToMainline(
  tree: MoveTree,
  path: MoveTreePath,
): { tree: MoveTree; path: MoveTreePath } {
  if (isMainlinePath(path) || !getMoveTreeNode(tree, path)) return { tree, path };
  const { tree: next, nodes } = cloneAlong(tree, path);
  const levels: MoveTreeNode[][] = [next.children, ...nodes.map((n) => n.children)];
  path.forEach((index, depth) => {
    if (index === 0) return;
    const level = levels[depth];
    const [promoted] = level.splice(index, 1);
    level.unshift(promoted);
  });
  return { tree: next, path: path.map(() => 0) };
}

/**
 * Moves the variation at `path` one place up among its siblings (towards the
 * mainline) without touching any other depth.
 */
export function promoteVariationOneLevel(
  tree: MoveTree,
  path: MoveTreePath,
): { tree: MoveTree; path: MoveTreePath } {
  // Find the deepest branch point on the path that isn't already main.
  let depth = -1;
  for (let i = path.length - 1; i >= 0; i -= 1) {
    if (path[i] !== 0) {
      depth = i;
      break;
    }
  }
  if (depth < 0) return { tree, path };
  if (!getMoveTreeNode(tree, path.slice(0, depth + 1))) return { tree, path };
  const { tree: next, nodes } = cloneAlong(tree, path.slice(0, depth));
  const level = depth === 0 ? next.children : nodes[depth - 1].children;
  const index = path[depth];
  [level[index - 1], level[index]] = [level[index], level[index - 1]];
  const newPath = [...path];
  newPath[depth] = index - 1;
  return { tree: next, path: newPath };
}

/** Removes the node at `path` and everything after it. Returns the parent path. */
export function deleteFromPath(
  tree: MoveTree,
  path: MoveTreePath,
): { tree: MoveTree; path: MoveTreePath } {
  if (path.length === 0 || !getMoveTreeNode(tree, path)) return { tree, path };
  const parentPath = path.slice(0, -1);
  const { tree: next, nodes } = cloneAlong(tree, parentPath);
  const level = parentPath.length ? nodes[nodes.length - 1].children : next.children;
  level.splice(path[path.length - 1], 1);
  return { tree: next, path: parentPath };
}

export function setMoveComment(tree: MoveTree, path: MoveTreePath, comment: string): MoveTree {
  const text = comment.trim();
  if (path.length === 0) {
    return { ...tree, rootComment: text || undefined };
  }
  if (!getMoveTreeNode(tree, path)) return tree;
  const { tree: next, nodes } = cloneAlong(tree, path);
  const node = nodes[nodes.length - 1];
  if (text) node.comment = text;
  else delete node.comment;
  return next;
}

// ── Move numbering ──────────────────────────────────────────────────────────

interface FenTurn {
  whiteToMove: boolean;
  fullmove: number;
}

function fenTurn(fen: string): FenTurn {
  const parts = fen.trim().split(/\s+/);
  const fullmove = Number.parseInt(parts[5] ?? "1", 10);
  return { whiteToMove: parts[1] !== "b", fullmove: Number.isFinite(fullmove) && fullmove > 0 ? fullmove : 1 };
}

/** Move number and colour of the half-move at `depth` (0 = first move from the root). */
export function moveNumberAt(rootFen: string, depth: number): { number: number; white: boolean } {
  const { whiteToMove, fullmove } = fenTurn(rootFen);
  const offset = whiteToMove ? depth : depth + 1;
  return { number: fullmove + Math.floor(offset / 2), white: offset % 2 === 0 };
}

/** "12." for white, "12..." for black. */
export function moveNumberLabel(rootFen: string, depth: number): string {
  const { number, white } = moveNumberAt(rootFen, depth);
  return white ? `${number}.` : `${number}...`;
}

// ── PGN export ──────────────────────────────────────────────────────────────

const NAG_SYMBOLS: Record<number, string> = { 1: "!", 2: "?", 3: "!!", 4: "??", 5: "!?", 6: "?!" };
const SYMBOL_NAGS: Record<string, number> = Object.fromEntries(
  Object.entries(NAG_SYMBOLS).map(([nag, symbol]) => [symbol, Number(nag)]),
);

export function nagSymbol(nag: number): string {
  return NAG_SYMBOLS[nag] ?? `$${nag}`;
}

function escapeComment(text: string) {
  // A "}" would end the PGN comment early.
  return text.replace(/}/g, ")");
}

function escapeHeader(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Standard Seven Tag Roster order first, then the rest in insertion order. */
const STR_ORDER = ["Event", "Site", "Date", "Round", "White", "Black", "Result"];

export type PgnHeaders = Record<string, string>;

/**
 * Serialises the tree, variations, comments and NAGs included, with correct
 * move numbers (a black move after a variation or comment restates "N...").
 * `headers.Result` (default "*") is also written as the termination marker. A
 * non-standard start adds `[SetUp "1"]` + `[FEN ...]`.
 */
export function moveTreeToPgn(tree: MoveTree, headers: PgnHeaders = {}): string {
  const result = headers.Result || "*";
  const allHeaders: PgnHeaders = { ...headers, Result: result };
  if (tree.rootFen !== STANDARD_START_FEN) {
    allHeaders.SetUp = "1";
    allHeaders.FEN = tree.rootFen;
  } else {
    delete allHeaders.SetUp;
    delete allHeaders.FEN;
  }
  const keys = [
    ...STR_ORDER.filter((key) => key in allHeaders),
    ...Object.keys(allHeaders).filter((key) => !STR_ORDER.includes(key)),
  ];
  const headerText = keys.map((key) => `[${key} "${escapeHeader(allHeaders[key])}"]`).join("\n");
  const movetext = moveTreeMovetext(tree);
  return `${headerText}\n\n${movetext ? `${movetext} ` : ""}${result}\n`;
}

/** Movetext only (no headers, no result). */
export function moveTreeMovetext(tree: MoveTree): string {
  const out: string[] = [];
  if (tree.rootComment) out.push(`{${escapeComment(tree.rootComment)}}`);

  const writeMove = (node: MoveTreeNode, depth: number, forceNumber: boolean) => {
    if (node.preComment) out.push(`{${escapeComment(node.preComment)}}`);
    const { number, white } = moveNumberAt(tree.rootFen, depth);
    if (white) out.push(`${number}. ${node.san}`);
    else if (forceNumber || node.preComment) out.push(`${number}... ${node.san}`);
    else out.push(node.san);
    for (const nag of node.nags ?? []) out.push(`$${nag}`);
    if (node.comment) out.push(`{${escapeComment(node.comment)}}`);
  };

  const writeLine = (level: MoveTreeNode[], depth: number, forceNumber: boolean) => {
    if (level.length === 0) return;
    const [main, ...alternatives] = level;
    writeMove(main, depth, forceNumber);
    for (const alt of alternatives) {
      out.push("(");
      writeMove(alt, depth, true);
      writeLine(alt.children, depth + 1, Boolean(alt.comment));
      out.push(")");
    }
    writeLine(main.children, depth + 1, alternatives.length > 0 || Boolean(main.comment));
  };

  writeLine(tree.children, 0, true);
  return out.join(" ").replace(/\( /g, "(").replace(/ \)/g, ")");
}

// ── PGN import ──────────────────────────────────────────────────────────────

type Token =
  | { kind: "move"; san: string; nag?: number }
  | { kind: "comment"; text: string }
  | { kind: "nag"; nag: number }
  | { kind: "open" }
  | { kind: "close" }
  | { kind: "result"; value: string };

export class PgnParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PgnParseError";
  }
}

export interface ParsedPgnGame {
  headers: PgnHeaders;
  tree: MoveTree;
  /** "1-0" | "0-1" | "1/2-1/2" | "*" — from the termination marker, else the Result header. */
  result: string;
}

const RESULT_TOKENS = new Set(["1-0", "0-1", "1/2-1/2", "*"]);

/** Splits off the header block and the first game's movetext. */
function splitFirstGame(pgn: string): { headers: PgnHeaders; movetext: string } {
  const text = pgn.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const headers: PgnHeaders = {};
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length && (lines[i].trim() === "" || lines[i].trim().startsWith("%"))) i += 1;
  for (; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line === "") {
      if (Object.keys(headers).length > 0) {
        i += 1;
        break;
      }
      continue;
    }
    const match = /^\[\s*([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]$/.exec(line);
    if (!match) break;
    headers[match[1]] = match[2].replace(/\\(["\\])/g, "$1");
  }
  // The movetext runs until the next game's header block.
  const rest: string[] = [];
  for (; i < lines.length; i += 1) {
    if (rest.length > 0 && /^\s*\[\s*[A-Za-z0-9_]+\s+"/.test(lines[i]) && /(?:^|\s)(1-0|0-1|1\/2-1\/2|\*)\s*$/.test(rest.join(" "))) {
      break;
    }
    rest.push(lines[i]);
  }
  return { headers, movetext: rest.join("\n") };
}

function tokenize(movetext: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = movetext.length;
  while (i < n) {
    const ch = movetext[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "{") {
      const end = movetext.indexOf("}", i + 1);
      if (end < 0) throw new PgnParseError("A comment is missing its closing \"}\".");
      tokens.push({ kind: "comment", text: movetext.slice(i + 1, end).replace(/\s+/g, " ").trim() });
      i = end + 1;
      continue;
    }
    if (ch === ";") {
      const end = movetext.indexOf("\n", i);
      const stop = end < 0 ? n : end;
      tokens.push({ kind: "comment", text: movetext.slice(i + 1, stop).trim() });
      i = stop;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "open" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "close" });
      i += 1;
      continue;
    }
    if (ch === "$") {
      const match = /^\$(\d+)/.exec(movetext.slice(i));
      if (!match) throw new PgnParseError(`Unexpected "$" near "${movetext.slice(i, i + 12)}".`);
      tokens.push({ kind: "nag", nag: Number(match[1]) });
      i += match[0].length;
      continue;
    }
    // A word: move number, result, SAN (optionally with !/? suffix).
    let j = i;
    while (j < n && !/[\s{}();$]/.test(movetext[j])) j += 1;
    const word = movetext.slice(i, j);
    i = j;
    if (RESULT_TOKENS.has(word)) {
      tokens.push({ kind: "result", value: word });
      continue;
    }
    // "12." / "12..." / "12...e5" (number glued to the move)
    const numbered = /^\d+\.+(.*)$/.exec(word);
    const san = numbered ? numbered[1] : word;
    if (!san) continue;
    if (/^[!?]+$/.test(san)) {
      const nag = SYMBOL_NAGS[san];
      if (nag) tokens.push({ kind: "nag", nag });
      continue;
    }
    const suffix = /([!?]{1,2})$/.exec(san);
    const bare = suffix ? san.slice(0, -suffix[1].length) : san;
    tokens.push({ kind: "move", san: bare, ...(suffix && SYMBOL_NAGS[suffix[1]] ? { nag: SYMBOL_NAGS[suffix[1]] } : {}) });
  }
  return tokens;
}

function normaliseSan(san: string) {
  // "0-0" (zeros) is common in hand-typed PGN; "e8Q" lacks the "=".
  return san.replace(/^0-0-0/, "O-O-O").replace(/^0-0/, "O-O").replace(/^([a-h][18])([QRBN])/, "$1=$2");
}

/**
 * Parses the first game of a PGN, variations included, validating every move
 * (mainline and variations) with the supplied chess factory. Throws
 * `PgnParseError` with a readable message on the first problem.
 */
export function parsePgnToMoveTree(pgn: string, createChess: MoveTreeChessFactory): ParsedPgnGame {
  const { headers, movetext } = splitFirstGame(pgn);
  let rootFen = headers.FEN?.trim() || STANDARD_START_FEN;
  try {
    rootFen = createChess(rootFen).fen();
  } catch {
    throw new PgnParseError("The [FEN] header is not a valid position.");
  }

  const tree = createMoveTree(rootFen);
  const tokens = tokenize(movetext);

  // Each frame is one line being read: `parent` is the node the next move is
  // played from (null = root), `last` the most recently added move in it.
  type Frame = { parent: MoveTreeNode | null; last: MoveTreeNode | null; pendingComment?: string };
  const stack: Frame[] = [];
  let frame: Frame = { parent: null, last: null };
  let result = headers.Result && RESULT_TOKENS.has(headers.Result) ? headers.Result : "*";
  let nodeCount = 0;

  const fenOf = (node: MoveTreeNode | null) => (node ? node.fen : rootFen);
  const childrenOf = (node: MoveTreeNode | null) => (node ? node.children : tree.children);

  tokenLoop: for (const token of tokens) {
    switch (token.kind) {
      case "move": {
        const fromFen = fenOf(frame.last ?? frame.parent);
        const chess = createChess(fromFen);
        const san = normaliseSan(token.san);
        let played: ReturnType<MoveTreeChess["move"]> = null;
        try {
          played = chess.move(san);
        } catch {
          played = null;
        }
        if (!played) {
          const { number, white } = moveNumberAt(rootFen, depthOf(tree, frame.last ?? frame.parent));
          throw new PgnParseError(`Illegal move "${token.san}" at ${number}${white ? "." : "..."}`);
        }
        nodeCount += 1;
        if (nodeCount > MAX_MOVE_TREE_NODES) {
          throw new PgnParseError(`This PGN has more than ${MAX_MOVE_TREE_NODES} moves.`);
        }
        const uci = `${played.from}${played.to}${played.promotion ?? ""}`;
        const siblings = childrenOf(frame.last ?? frame.parent);
        let node = siblings.find((child) => child.uci === uci);
        if (!node) {
          node = { id: nextId(), san: played.san, uci, fen: chess.fen(), children: [] };
          siblings.push(node);
        }
        if (frame.pendingComment) {
          node.preComment = frame.pendingComment;
          frame.pendingComment = undefined;
        }
        if (token.nag) node.nags = [...(node.nags ?? []), token.nag];
        frame.parent = frame.last ?? frame.parent;
        frame.last = node;
        break;
      }
      case "comment": {
        if (!token.text) break;
        if (frame.last) {
          frame.last.comment = frame.last.comment ? `${frame.last.comment} ${token.text}` : token.text;
        } else if (stack.length === 0) {
          tree.rootComment = tree.rootComment ? `${tree.rootComment} ${token.text}` : token.text;
        } else {
          frame.pendingComment = token.text;
        }
        break;
      }
      case "nag": {
        if (frame.last) frame.last.nags = [...(frame.last.nags ?? []), token.nag];
        break;
      }
      case "open": {
        if (!frame.last) throw new PgnParseError("A variation \"(\" appears before any move.");
        stack.push(frame);
        // An alternative to the last move: played from the position before it.
        frame = { parent: frame.parent, last: null };
        break;
      }
      case "close": {
        const previous = stack.pop();
        if (!previous) throw new PgnParseError("Unmatched \")\" in the PGN.");
        frame = previous;
        break;
      }
      case "result": {
        if (stack.length === 0) {
          // The game is over; anything after it is not this game's movetext.
          result = token.value;
          break tokenLoop;
        }
        break;
      }
    }
  }
  if (stack.length > 0) throw new PgnParseError("A variation \"(\" is never closed.");

  return { headers, tree, result };
}

/** Depth (number of half-moves from the root) of a node; 0 for the root itself. */
function depthOf(tree: MoveTree, node: MoveTreeNode | null): number {
  if (!node) return 0;
  const path = findMoveTreePath(tree, node.id);
  return path ? path.length : 0;
}

/** Re-assigns fresh ids (e.g. after JSON round-tripping a tree from another client). */
export function reidentifyMoveTree(tree: MoveTree): MoveTree {
  const walk = (level: MoveTreeNode[]): MoveTreeNode[] =>
    level.map((node) => ({ ...node, id: nextId(), children: walk(node.children) }));
  return { ...tree, children: walk(tree.children) };
}
