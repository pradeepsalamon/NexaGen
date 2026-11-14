import {
  type BufferGeometry,
  CatmullRomCurve3,
  ConeGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Path,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  SplineCurve,
  TorusGeometry,
  Vector2,
  Vector3
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { PieceType } from "./layout";

type Pt = [radiusOrX: number, y: number];

/** A turned profile (radius, height) spun round its axis; the spline keeps it smooth. */
function lathe(points: Pt[], segments: number): BufferGeometry {
  const curve = new SplineCurve(points.map(([r, y]) => new Vector2(r, y)));
  const smooth = curve.getPoints(points.length * 6).map((p) => new Vector2(Math.max(0, p.x), p.y));
  smooth[0].x = 0;
  smooth[smooth.length - 1].x = 0;
  return new LatheGeometry(smooth, segments);
}

function ring(radius: number, y: number, tube: number, segments: number) {
  const g = new TorusGeometry(radius, tube, 8, segments);
  g.rotateX(Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

function sphere(r: number, x: number, y: number, z: number, scale?: [number, number, number]) {
  const g = new SphereGeometry(r, 16, 10);
  if (scale) g.scale(...scale);
  g.translate(x, y, z);
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, radius = 0.02) {
  const g = new RoundedBoxGeometry(w, h, d, 3, radius);
  g.translate(x, y, z);
  return g;
}

/** One geometry from many parts. The parts mix indexed and non-indexed, so all are flattened; no piece is textured, so UVs go. */
function merge(parts: BufferGeometry[]) {
  const flat = parts.map((part) => {
    const g = part.index ? part.toNonIndexed() : part.clone();
    g.deleteAttribute("uv");
    return g;
  });
  const merged = mergeGeometries(flat, false);
  parts.forEach((p) => p.dispose());
  flat.forEach((p) => p.dispose());
  return merged;
}

/** The foot every piece shares, so the set reads as one family: a felt-line step, a bead, then the sweep up. */
const FOOT: Pt[] = [
  [0, 0],
  [0.43, 0],
  [0.45, 0.04],
  [0.44, 0.09],
  [0.4, 0.13],
  [0.33, 0.19]
];

function pawn(seg: number) {
  const body = lathe(
    [...FOOT, [0.21, 0.31], [0.145, 0.5], [0.15, 0.6], [0.27, 0.65], [0.27, 0.7], [0.16, 0.75], [0.2, 0.83], [0.215, 0.93], [0.17, 1.04], [0.08, 1.1], [0, 1.11]],
    seg
  );
  return merge([body, ring(0.215, 0.66, 0.028, seg)]);
}

function rook(seg: number) {
  const body = lathe(
    [...FOOT, [0.26, 0.34], [0.235, 0.62], [0.3, 0.7], [0.37, 0.75], [0.37, 0.93], [0.34, 0.95], [0.0, 0.95]],
    seg
  );
  const parts: BufferGeometry[] = [body, ring(0.27, 0.68, 0.03, seg)];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const merlon = box(0.17, 0.2, 0.13, 0, 1.0, 0, 0.025);
    merlon.rotateY(-a);
    merlon.translate(Math.cos(a) * 0.29, 0, Math.sin(a) * 0.29);
    parts.push(merlon);
  }
  return merge(parts);
}

function bishop(seg: number) {
  const body = lathe(
    [...FOOT, [0.2, 0.36], [0.14, 0.6], [0.16, 0.7], [0.29, 0.745], [0.29, 0.79], [0.16, 0.86], [0.24, 1.0], [0.265, 1.16], [0.2, 1.33], [0.1, 1.45], [0.06, 1.5], [0, 1.51]],
    seg
  );
  return merge([body, ring(0.215, 0.7, 0.028, seg), ring(0.2, 1.335, 0.014, seg), sphere(0.085, 0, 1.6, 0)]);
}

function queen(seg: number) {
  const body = lathe(
    [...FOOT, [0.21, 0.4], [0.15, 0.7], [0.17, 0.82], [0.31, 0.87], [0.31, 0.92], [0.17, 0.99], [0.25, 1.15], [0.3, 1.35], [0.37, 1.55], [0.35, 1.62], [0.0, 1.62]],
    seg
  );
  const parts: BufferGeometry[] = [body, ring(0.24, 0.84, 0.03, seg), sphere(0.105, 0, 1.78, 0)];
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * Math.PI * 2;
    parts.push(sphere(0.065, Math.cos(a) * 0.335, 1.66, Math.sin(a) * 0.335));
  }
  return merge(parts);
}

function king(seg: number) {
  const body = lathe(
    [...FOOT, [0.22, 0.42], [0.16, 0.78], [0.18, 0.9], [0.32, 0.95], [0.32, 1.0], [0.18, 1.07], [0.26, 1.25], [0.32, 1.45], [0.36, 1.62], [0.3, 1.69], [0.18, 1.72], [0, 1.73]],
    seg
  );
  return merge([
    body,
    ring(0.245, 0.92, 0.03, seg),
    box(0.11, 0.38, 0.11, 0, 1.93, 0, 0.03),
    box(0.3, 0.1, 0.1, 0, 1.97, 0, 0.03)
  ]);
}

export const KNIGHT_BASE_H = 0.26;
/** The knight's body sits a little behind the centre of its plinth, so the head is over the square. */
const KNIGHT_BODY_X = -0.16;

/**
 * The knight, in profile facing +x: a closed outline (chest, throat, jaw,
 * muzzle, forehead, crest, back of the neck) extruded with a deep bevel, made
 * thinner toward the muzzle and the top of the head, then re-smoothed so the
 * metal takes long continuous highlights. Ears, a ridged mane and the plinth
 * are merged in; the eyes and nostrils are a second, dark geometry.
 */
function knight(seg: number) {
  const outline: Pt[] = [
    [-0.36, 0.0],
    [-0.12, 0.0],
    [0.12, 0.0],
    [0.36, 0.0],
    [0.385, 0.14],
    [0.33, 0.3],
    [0.27, 0.44],
    [0.265, 0.54],
    [0.33, 0.6],
    [0.45, 0.585],
    [0.56, 0.575],
    [0.645, 0.6],
    [0.7, 0.665],
    [0.705, 0.745],
    [0.665, 0.82],
    [0.58, 0.93],
    [0.47, 1.06],
    [0.36, 1.18],
    [0.28, 1.27],
    [0.17, 1.35],
    [0.03, 1.31],
    [-0.1, 1.16],
    [-0.23, 0.94],
    [-0.33, 0.7],
    [-0.385, 0.46],
    [-0.4, 0.24],
    [-0.385, 0.09]
  ];
  const curve = new CatmullRomCurve3(
    outline.map(([x, y]) => new Vector3(x, y, 0)),
    true,
    "centripetal"
  );
  const shape = new Shape(curve.getPoints(260).map((p) => new Vector2(p.x, p.y)));

  // A shallow slab with a deep round bevel: the sides are curved all the way, so they catch varied light.
  const depth = 0.1;
  const extruded = new ExtrudeGeometry(shape, {
    bevelEnabled: true,
    bevelSegments: 14,
    bevelSize: 0.085,
    bevelThickness: 0.18,
    curveSegments: 1,
    depth
  });
  extruded.translate(0, 0, -depth / 2);

  const pos = extruded.attributes.position;
  const smooth = (a: number, b: number, v: number) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // Full at the chest; a cheek swell at the jaw; slim at the muzzle and the crest.
    const cheek = 0.1 * Math.exp(-((x - 0.36) ** 2 + (y - 0.86) ** 2) / 0.03);
    const factor = 1 - 0.36 * smooth(0.1, 0.7, x) - 0.12 * smooth(0.85, 1.4, y) + cheek;
    pos.setZ(i, pos.getZ(i) * factor);
  }
  extruded.deleteAttribute("normal");
  extruded.deleteAttribute("uv");
  const body = mergeVertices(extruded, 1e-4);
  extruded.dispose();
  body.computeVertexNormals();

  const ear = (z: number) => {
    const g = new ConeGeometry(0.058, 0.25, 14);
    g.scale(1, 1, 0.7);
    g.rotateZ(-0.22);
    g.rotateX(z > 0 ? 0.2 : -0.2);
    g.translate(0.2, 1.41, z);
    return g;
  };

  // The mane: overlapping ridges down the back of the neck, each leaning back a little.
  const manePath: Pt[] = [
    [0.0, 1.3],
    [-0.085, 1.2],
    [-0.16, 1.08],
    [-0.225, 0.96],
    [-0.28, 0.83],
    [-0.325, 0.7],
    [-0.36, 0.57],
    [-0.385, 0.44],
    [-0.4, 0.31]
  ];
  const mane = manePath.map(([x, y], i) => sphere(0.082 - i * 0.002, x - 0.02, y, 0, [1, 1.25, 1.15]));

  const plinth = lathe([[0, 0], [0.45, 0], [0.47, 0.06], [0.43, 0.15], [0.35, 0.22], [0.31, 0.27], [0, 0.27]], seg);

  const upper = merge([body, ear(0.085), ear(-0.085), ...mane]);
  upper.translate(KNIGHT_BODY_X, KNIGHT_BASE_H - 0.02, 0);
  const gold = merge([plinth, ring(0.4, 0.16, 0.028, seg), upper]);

  const details = merge([
    sphere(0.042, 0.37, 1.0, 0.165),
    sphere(0.042, 0.37, 1.0, -0.165),
    sphere(0.028, 0.655, 0.71, 0.105),
    sphere(0.028, 0.655, 0.71, -0.105)
  ]);
  details.translate(KNIGHT_BODY_X, KNIGHT_BASE_H - 0.02, 0);

  return { details, gold };
}

/**
 * A square ring lying flat, centred on the origin: a rounded square with a
 * square hole, extruded upward with a small bevel. One piece, so the corners
 * have no seams.
 */
function squareRing(outer: number, inner: number, height: number, corner: number, bevel: number): BufferGeometry {
  const o = outer / 2 - bevel;
  const i = inner / 2 + bevel;
  const shape = new Shape();
  shape.moveTo(-o + corner, -o);
  shape.lineTo(o - corner, -o);
  shape.quadraticCurveTo(o, -o, o, -o + corner);
  shape.lineTo(o, o - corner);
  shape.quadraticCurveTo(o, o, o - corner, o);
  shape.lineTo(-o + corner, o);
  shape.quadraticCurveTo(-o, o, -o, o - corner);
  shape.lineTo(-o, -o + corner);
  shape.quadraticCurveTo(-o, -o, -o + corner, -o);
  const hole = new Path();
  hole.moveTo(-i, -i);
  hole.lineTo(-i, i);
  hole.lineTo(i, i);
  hole.lineTo(i, -i);
  hole.closePath();
  shape.holes.push(hole);
  const geometry = new ExtrudeGeometry(shape, {
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 8,
    depth: height - bevel * 2
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bevel - height / 2, 0);
  return geometry;
}

export type HeroGeometries = {
  frame: BufferGeometry;
  inlay: BufferGeometry;
  knightDetails: BufferGeometry;
  knightGold: BufferGeometry;
  pieces: Record<PieceType, BufferGeometry>;
  skirt: BufferGeometry;
  surface: BufferGeometry;
};

/**
 * `detail` is the number of segments round a turned piece: fewer on small devices.
 * The frame and its skirt are rings, not slabs: nothing solid lies
 * under the playing surface, which is what lets the reflections show through it.
 */
export function buildGeometries(detail: number): HeroGeometries {
  const { details, gold } = knight(detail);
  const surface = new PlaneGeometry(8, 8);
  surface.rotateX(-Math.PI / 2);
  return {
    frame: squareRing(9.2, 8.0, 0.56, 0.12, 0.05),
    inlay: squareRing(8.68, 8.52, 0.04, 0.02, 0.012),
    knightDetails: details,
    knightGold: gold,
    pieces: { bishop: bishop(detail), king: king(detail), pawn: pawn(detail), queen: queen(detail), rook: rook(detail) },
    skirt: squareRing(9.7, 8.3, 0.18, 0.16, 0.04),
    surface
  };
}

export function disposeGeometries(g: HeroGeometries) {
  Object.values(g.pieces).forEach((geometry) => geometry.dispose());
  [g.frame, g.inlay, g.knightDetails, g.knightGold, g.skirt, g.surface].forEach(
    (geometry) => geometry.dispose()
  );
}
