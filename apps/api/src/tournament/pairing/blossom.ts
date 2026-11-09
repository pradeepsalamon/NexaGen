// ─────────────────────────────────────────────────────────────────────────────
// Maximum-weight matching in a general graph (Edmonds' blossom algorithm with
// dual variables, O(n³)). A TypeScript port of the well-known public-domain
// reference implementation by Joris van Rantwijk ("mwmatching.py"), which
// follows Galil, "Efficient algorithms for finding maximum matching in graphs"
// (ACM Computing Surveys, 1986).
//
// Used by the Swiss pairing engine: vertices are players, an edge's weight is
// how good that pairing is, and `maxCardinality` makes the result pair as many
// players as possible before maximising the total weight. Weights must be
// integers (the Swiss engine only builds integer weights), which keeps the
// dual arithmetic exact.
// ─────────────────────────────────────────────────────────────────────────────

export type WeightedEdge = [number, number, number];

/**
 * Returns `mate` where `mate[v]` is the vertex matched to `v`, or -1.
 * Vertices are 0..n-1 (n = 1 + the largest vertex in `edges`).
 */
export function maxWeightMatching(edges: readonly WeightedEdge[], maxCardinality = false): number[] {
  if (edges.length === 0) return [];
  const nedge = edges.length;
  let nvertex = 0;
  for (const [i, j] of edges) {
    if (i < 0 || j < 0 || i === j) throw new Error("maxWeightMatching: bad edge");
    nvertex = Math.max(nvertex, i + 1, j + 1);
  }
  let maxweight = 0;
  for (const [, , w] of edges) maxweight = Math.max(maxweight, w);

  // endpoint[p] is the vertex at endpoint p: edge k has endpoints 2k and 2k+1.
  const endpoint: number[] = new Array(2 * nedge);
  for (let p = 0; p < 2 * nedge; p += 1) endpoint[p] = edges[Math.floor(p / 2)][p % 2];

  // neighbend[v]: the remote endpoints of the edges at v.
  const neighbend: number[][] = Array.from({ length: nvertex }, () => []);
  for (let k = 0; k < nedge; k += 1) {
    const [i, j] = edges[k];
    neighbend[i].push(2 * k + 1);
    neighbend[j].push(2 * k);
  }

  const mate: number[] = new Array(nvertex).fill(-1);
  // label: 0 free, 1 S, 2 T (for top-level blossoms; index up to 2n).
  const label: number[] = new Array(2 * nvertex).fill(0);
  const labelend: number[] = new Array(2 * nvertex).fill(-1);
  const inblossom: number[] = Array.from({ length: nvertex }, (_, v) => v);
  const blossomparent: number[] = new Array(2 * nvertex).fill(-1);
  const blossomchilds: (number[] | null)[] = new Array(2 * nvertex).fill(null);
  const blossombase: number[] = [...Array.from({ length: nvertex }, (_, v) => v), ...new Array(nvertex).fill(-1)];
  const blossomendps: (number[] | null)[] = new Array(2 * nvertex).fill(null);
  const bestedge: number[] = new Array(2 * nvertex).fill(-1);
  const blossombestedges: (number[] | null)[] = new Array(2 * nvertex).fill(null);
  const unusedblossoms: number[] = Array.from({ length: nvertex }, (_, i) => nvertex + i);
  const dualvar: number[] = [...new Array(nvertex).fill(maxweight), ...new Array(nvertex).fill(0)];
  const allowedge: boolean[] = new Array(nedge).fill(false);
  let queue: number[] = [];

  const slack = (k: number) => {
    const [i, j, wt] = edges[k];
    return dualvar[i] + dualvar[j] - 2 * wt;
  };

  function* blossomLeaves(b: number): Generator<number> {
    if (b < nvertex) {
      yield b;
    } else {
      for (const t of blossomchilds[b]!) {
        if (t < nvertex) yield t;
        else yield* blossomLeaves(t);
      }
    }
  }

  const assignLabel = (w: number, t: number, p: number) => {
    const b = inblossom[w];
    label[w] = label[b] = t;
    labelend[w] = labelend[b] = p;
    bestedge[w] = bestedge[b] = -1;
    if (t === 1) {
      for (const v of blossomLeaves(b)) queue.push(v);
    } else if (t === 2) {
      const base = blossombase[b];
      assignLabel(endpoint[mate[base]], 1, mate[base] ^ 1);
    }
  };

  const scanBlossom = (vIn: number, wIn: number): number => {
    let v = vIn;
    let w = wIn;
    const path: number[] = [];
    let base = -1;
    while (v !== -1 || w !== -1) {
      let b = inblossom[v];
      if (label[b] & 4) {
        base = blossombase[b];
        break;
      }
      path.push(b);
      label[b] = 5;
      if (labelend[b] === -1) {
        v = -1;
      } else {
        v = endpoint[labelend[b]];
        b = inblossom[v];
        v = endpoint[labelend[b]];
      }
      if (w !== -1) {
        const t = v;
        v = w;
        w = t;
      }
    }
    for (const b of path) label[b] = 1;
    return base;
  };

  const addBlossom = (base: number, k: number) => {
    let [v, w] = edges[k];
    const bb = inblossom[base];
    let bv = inblossom[v];
    let bw = inblossom[w];
    const b = unusedblossoms.pop()!;
    blossombase[b] = base;
    blossomparent[b] = -1;
    blossomparent[bb] = b;
    const path: number[] = [];
    const endps: number[] = [];
    blossomchilds[b] = path;
    blossomendps[b] = endps;
    while (bv !== bb) {
      blossomparent[bv] = b;
      path.push(bv);
      endps.push(labelend[bv]);
      v = endpoint[labelend[bv]];
      bv = inblossom[v];
    }
    path.push(bb);
    path.reverse();
    endps.reverse();
    endps.push(2 * k);
    while (bw !== bb) {
      blossomparent[bw] = b;
      path.push(bw);
      endps.push(labelend[bw] ^ 1);
      w = endpoint[labelend[bw]];
      bw = inblossom[w];
    }
    label[b] = 1;
    labelend[b] = labelend[bb];
    dualvar[b] = 0;
    for (const leaf of blossomLeaves(b)) {
      if (label[inblossom[leaf]] === 2) queue.push(leaf);
      inblossom[leaf] = b;
    }
    const bestedgeto: number[] = new Array(2 * nvertex).fill(-1);
    for (const sub of path) {
      let nblists: number[][];
      if (blossombestedges[sub] === null) {
        nblists = [];
        for (const leaf of blossomLeaves(sub)) nblists.push(neighbend[leaf].map((p) => Math.floor(p / 2)));
      } else {
        nblists = [blossombestedges[sub]!];
      }
      for (const nblist of nblists) {
        for (const kk of nblist) {
          let [i, j] = edges[kk];
          if (inblossom[j] === b) {
            const t = i;
            i = j;
            j = t;
          }
          const bj = inblossom[j];
          if (bj !== b && label[bj] === 1 && (bestedgeto[bj] === -1 || slack(kk) < slack(bestedgeto[bj]))) {
            bestedgeto[bj] = kk;
          }
        }
      }
      blossombestedges[sub] = null;
      bestedge[sub] = -1;
    }
    blossombestedges[b] = bestedgeto.filter((kk) => kk !== -1);
    bestedge[b] = -1;
    for (const kk of blossombestedges[b]!) {
      if (bestedge[b] === -1 || slack(kk) < slack(bestedge[b])) bestedge[b] = kk;
    }
  };

  const expandBlossom = (b: number, endstage: boolean) => {
    for (const s of blossomchilds[b]!) {
      blossomparent[s] = -1;
      if (s < nvertex) inblossom[s] = s;
      else if (endstage && dualvar[s] === 0) expandBlossom(s, endstage);
      else for (const v of blossomLeaves(s)) inblossom[v] = s;
    }
    if (!endstage && label[b] === 2) {
      const childs = blossomchilds[b]!;
      const endps = blossomendps[b]!;
      const entrychild = inblossom[endpoint[labelend[b] ^ 1]];
      let j = childs.indexOf(entrychild);
      let jstep: number;
      let endptrick: number;
      if (j & 1) {
        j -= childs.length;
        jstep = 1;
        endptrick = 0;
      } else {
        jstep = -1;
        endptrick = 1;
      }
      const at = (arr: number[], idx: number) => arr[((idx % arr.length) + arr.length) % arr.length];
      let p = labelend[b];
      while (j !== 0) {
        label[endpoint[p ^ 1]] = 0;
        label[endpoint[at(endps, j - endptrick) ^ endptrick ^ 1]] = 0;
        assignLabel(endpoint[p ^ 1], 2, p);
        allowedge[Math.floor(at(endps, j - endptrick) / 2)] = true;
        j += jstep;
        p = at(endps, j - endptrick) ^ endptrick;
        allowedge[Math.floor(p / 2)] = true;
        j += jstep;
      }
      const bv = at(childs, j);
      label[endpoint[p ^ 1]] = label[bv] = 2;
      labelend[endpoint[p ^ 1]] = labelend[bv] = p;
      bestedge[bv] = -1;
      j += jstep;
      while (at(childs, j) !== entrychild) {
        const bvv = at(childs, j);
        if (label[bvv] === 1) {
          j += jstep;
          continue;
        }
        let found = -1;
        for (const v of blossomLeaves(bvv)) {
          if (label[v] !== 0) {
            found = v;
            break;
          }
        }
        if (found !== -1) {
          label[found] = 0;
          label[endpoint[mate[blossombase[bvv]]]] = 0;
          assignLabel(found, 2, labelend[found]);
        }
        j += jstep;
      }
    }
    label[b] = labelend[b] = -1;
    blossomchilds[b] = blossomendps[b] = null;
    blossombase[b] = -1;
    blossombestedges[b] = null;
    bestedge[b] = -1;
    unusedblossoms.push(b);
  };

  const augmentBlossom = (b: number, v: number) => {
    let t = v;
    while (blossomparent[t] !== b) t = blossomparent[t];
    if (t >= nvertex) augmentBlossom(t, v);
    const childs = blossomchilds[b]!;
    const endps = blossomendps[b]!;
    const i = childs.indexOf(t);
    let j = i;
    let jstep: number;
    let endptrick: number;
    if (i & 1) {
      j -= childs.length;
      jstep = 1;
      endptrick = 0;
    } else {
      jstep = -1;
      endptrick = 1;
    }
    const at = (arr: number[], idx: number) => arr[((idx % arr.length) + arr.length) % arr.length];
    while (j !== 0) {
      j += jstep;
      let tt = at(childs, j);
      const p = at(endps, j - endptrick) ^ endptrick;
      if (tt >= nvertex) augmentBlossom(tt, endpoint[p]);
      j += jstep;
      tt = at(childs, j);
      if (tt >= nvertex) augmentBlossom(tt, endpoint[p ^ 1]);
      mate[endpoint[p]] = p ^ 1;
      mate[endpoint[p ^ 1]] = p;
    }
    const rotate = (arr: number[], by: number) => [...arr.slice(by), ...arr.slice(0, by)];
    blossomchilds[b] = rotate(childs, i);
    blossomendps[b] = rotate(endps, i);
    blossombase[b] = blossombase[blossomchilds[b]![0]];
  };

  const augmentMatching = (k: number) => {
    const [v, w] = edges[k];
    for (const [sStart, pStart] of [
      [v, 2 * k + 1],
      [w, 2 * k]
    ]) {
      let s = sStart;
      let p = pStart;
      for (;;) {
        const bs = inblossom[s];
        if (bs >= nvertex) augmentBlossom(bs, s);
        mate[s] = p;
        if (labelend[bs] === -1) break;
        const t = endpoint[labelend[bs]];
        const bt = inblossom[t];
        s = endpoint[labelend[bt]];
        const j = endpoint[labelend[bt] ^ 1];
        if (bt >= nvertex) augmentBlossom(bt, j);
        mate[j] = labelend[bt];
        p = labelend[bt] ^ 1;
      }
    }
  };

  for (let stage = 0; stage < nvertex; stage += 1) {
    label.fill(0);
    bestedge.fill(-1);
    for (let b = nvertex; b < 2 * nvertex; b += 1) blossombestedges[b] = null;
    allowedge.fill(false);
    queue = [];
    for (let v = 0; v < nvertex; v += 1) {
      if (mate[v] === -1 && label[inblossom[v]] === 0) assignLabel(v, 1, -1);
    }
    let augmented = false;
    for (;;) {
      while (queue.length && !augmented) {
        const v = queue.pop()!;
        for (const p of neighbend[v]) {
          const k = Math.floor(p / 2);
          const w = endpoint[p];
          if (inblossom[v] === inblossom[w]) continue;
          let kslack = 0;
          if (!allowedge[k]) {
            kslack = slack(k);
            if (kslack <= 0) allowedge[k] = true;
          }
          if (allowedge[k]) {
            if (label[inblossom[w]] === 0) {
              assignLabel(w, 2, p ^ 1);
            } else if (label[inblossom[w]] === 1) {
              const base = scanBlossom(v, w);
              if (base >= 0) addBlossom(base, k);
              else {
                augmentMatching(k);
                augmented = true;
                break;
              }
            } else if (label[w] === 0) {
              label[w] = 2;
              labelend[w] = p ^ 1;
            }
          } else if (label[inblossom[w]] === 1) {
            const b = inblossom[v];
            if (bestedge[b] === -1 || kslack < slack(bestedge[b])) bestedge[b] = k;
          } else if (label[w] === 0) {
            if (bestedge[w] === -1 || kslack < slack(bestedge[w])) bestedge[w] = k;
          }
        }
      }
      if (augmented) break;

      // Dual adjustment.
      let deltatype = -1;
      let delta = 0;
      let deltaedge = -1;
      let deltablossom = -1;
      if (!maxCardinality) {
        deltatype = 1;
        delta = Math.min(...dualvar.slice(0, nvertex));
      }
      for (let v = 0; v < nvertex; v += 1) {
        if (label[inblossom[v]] === 0 && bestedge[v] !== -1) {
          const d = slack(bestedge[v]);
          if (deltatype === -1 || d < delta) {
            delta = d;
            deltatype = 2;
            deltaedge = bestedge[v];
          }
        }
      }
      for (let b = 0; b < 2 * nvertex; b += 1) {
        if (blossomparent[b] === -1 && label[b] === 1 && bestedge[b] !== -1) {
          const kslack = slack(bestedge[b]);
          const d = kslack / 2;
          if (deltatype === -1 || d < delta) {
            delta = d;
            deltatype = 3;
            deltaedge = bestedge[b];
          }
        }
      }
      for (let b = nvertex; b < 2 * nvertex; b += 1) {
        if (blossombase[b] >= 0 && blossomparent[b] === -1 && label[b] === 2 && (deltatype === -1 || dualvar[b] < delta)) {
          delta = dualvar[b];
          deltatype = 4;
          deltablossom = b;
        }
      }
      if (deltatype === -1) {
        // No further improvement possible (max-cardinality mode).
        deltatype = 1;
        delta = Math.max(0, Math.min(...dualvar.slice(0, nvertex)));
      }
      for (let v = 0; v < nvertex; v += 1) {
        if (label[inblossom[v]] === 1) dualvar[v] -= delta;
        else if (label[inblossom[v]] === 2) dualvar[v] += delta;
      }
      for (let b = nvertex; b < 2 * nvertex; b += 1) {
        if (blossombase[b] >= 0 && blossomparent[b] === -1) {
          if (label[b] === 1) dualvar[b] += delta;
          else if (label[b] === 2) dualvar[b] -= delta;
        }
      }
      if (deltatype === 1) break;
      else if (deltatype === 2) {
        allowedge[deltaedge] = true;
        let [i, j] = edges[deltaedge];
        if (label[inblossom[i]] === 0) {
          const t = i;
          i = j;
          j = t;
        }
        queue.push(i);
      } else if (deltatype === 3) {
        allowedge[deltaedge] = true;
        const [i] = edges[deltaedge];
        queue.push(i);
      } else if (deltatype === 4) {
        expandBlossom(deltablossom, false);
      }
    }
    if (!augmented) break;
    for (let b = nvertex; b < 2 * nvertex; b += 1) {
      if (blossomparent[b] === -1 && blossombase[b] >= 0 && label[b] === 1 && dualvar[b] === 0) expandBlossom(b, true);
    }
  }

  for (let v = 0; v < nvertex; v += 1) if (mate[v] >= 0) mate[v] = endpoint[mate[v]];
  return mate;
}
