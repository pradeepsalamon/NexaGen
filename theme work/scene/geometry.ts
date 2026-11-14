import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

type Pt = [r: number, y: number]

/** Smooth turned profile (radius, height) → lathe. Spline keeps the silhouette organic. */
function lathe(points: Pt[], segments = 72): THREE.BufferGeometry {
  const curve = new THREE.SplineCurve(points.map(([r, y]) => new THREE.Vector2(r, y)))
  const smooth = curve.getPoints(points.length * 12).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y))
  smooth[0].x = 0
  smooth[smooth.length - 1].x = 0
  return new THREE.LatheGeometry(smooth, segments)
}

const ring = (R: number, y: number, tube = 0.03) => {
  const g = new THREE.TorusGeometry(R, tube, 16, 64)
  g.rotateX(Math.PI / 2)
  g.translate(0, y, 0)
  return g
}
const sphere = (r: number, x: number, y: number, z: number) => {
  const g = new THREE.SphereGeometry(r, 24, 16)
  g.translate(x, y, z)
  return g
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number, rad = 0.02) => {
  const g = new RoundedBoxGeometry(w, h, d, 3, rad)
  g.translate(x, y, z)
  return g
}
const merge = (parts: THREE.BufferGeometry[]) => {
  // RoundedBoxGeometry is non-indexed while lathe/torus/sphere are indexed; merging needs them uniform.
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p))
  const merged = mergeGeometries(flat, false)
  parts.forEach((p) => p.dispose())
  flat.forEach((p) => p.dispose())
  return merged
}

/** Shared foot used by every piece so the set feels like one family. */
const FOOT: Pt[] = [
  [0, 0],
  [0.42, 0],
  [0.44, 0.05],
  [0.41, 0.12],
  [0.31, 0.19],
]

function pawn() {
  const body = lathe([
    ...FOOT,
    [0.2, 0.31],
    [0.145, 0.5],
    [0.15, 0.6],
    [0.27, 0.65],
    [0.27, 0.7],
    [0.16, 0.75],
    [0.2, 0.83],
    [0.215, 0.93],
    [0.17, 1.04],
    [0.08, 1.1],
    [0, 1.11],
  ])
  return merge([body, ring(0.215, 0.66, 0.028)])
}

function rook() {
  const body = lathe([
    ...FOOT,
    [0.25, 0.34],
    [0.23, 0.62],
    [0.3, 0.7],
    [0.37, 0.75],
    [0.37, 0.93],
    [0.34, 0.95],
    [0.0, 0.95],
  ])
  const parts: THREE.BufferGeometry[] = [body, ring(0.27, 0.68, 0.03)]
  const n = 6
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const m = box(0.17, 0.2, 0.13, 0, 1.0, 0, 0.025)
    m.rotateY(-a)
    m.translate(Math.cos(a) * 0.29, 0, Math.sin(a) * 0.29)
    parts.push(m)
  }
  return merge(parts)
}

function bishop() {
  const body = lathe([
    ...FOOT,
    [0.2, 0.36],
    [0.14, 0.6],
    [0.16, 0.7],
    [0.29, 0.745],
    [0.29, 0.79],
    [0.16, 0.86],
    [0.24, 1.0],
    [0.265, 1.16],
    [0.2, 1.33],
    [0.1, 1.45],
    [0.06, 1.5],
    [0, 1.51],
  ])
  const notch = box(0.025, 0.2, 0.7, 0.14, 1.2, 0, 0.01)
  notch.rotateZ(-0.7)
  notch.translate(-0.05, 0, 0)
  return merge([body, ring(0.215, 0.7, 0.028), sphere(0.085, 0, 1.6, 0), notch])
}

function queen() {
  const body = lathe([
    ...FOOT,
    [0.21, 0.4],
    [0.15, 0.7],
    [0.17, 0.82],
    [0.31, 0.87],
    [0.31, 0.92],
    [0.17, 0.99],
    [0.25, 1.15],
    [0.3, 1.35],
    [0.37, 1.55],
    [0.35, 1.62],
    [0.0, 1.62],
  ])
  const parts: THREE.BufferGeometry[] = [body, ring(0.24, 0.84, 0.03), sphere(0.105, 0, 1.78, 0)]
  const n = 9
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    parts.push(sphere(0.065, Math.cos(a) * 0.335, 1.66, Math.sin(a) * 0.335))
  }
  return merge(parts)
}

function king() {
  const body = lathe([
    ...FOOT,
    [0.22, 0.42],
    [0.16, 0.78],
    [0.18, 0.9],
    [0.32, 0.95],
    [0.32, 1.0],
    [0.18, 1.07],
    [0.26, 1.25],
    [0.32, 1.45],
    [0.36, 1.62],
    [0.3, 1.69],
    [0.18, 1.72],
    [0, 1.73],
  ])
  return merge([
    body,
    ring(0.245, 0.92, 0.03),
    box(0.11, 0.38, 0.11, 0, 1.93, 0, 0.03),
    box(0.3, 0.1, 0.1, 0, 1.97, 0, 0.03),
  ])
}

/** Knight plinth — gold, with a bead ring. */
function knightBase() {
  const body = lathe([
    [0, 0],
    [0.45, 0],
    [0.47, 0.06],
    [0.43, 0.15],
    [0.35, 0.22],
    [0.31, 0.27],
    [0, 0.27],
  ])
  return merge([body, ring(0.4, 0.16, 0.028)])
}

export const KNIGHT_BASE_H = 0.26

/**
 * The hero: a stylised Staunton knight. A closed centripetal Catmull-Rom outline is
 * extruded with a generous bevel, tapered toward the muzzle, then re-smoothed so the
 * metal catches soft, continuous highlights instead of faceted ones.
 */
function knightBody() {
  const outline: Pt[] = [
    [-0.36, 0.0],
    [-0.18, 0.0],
    [0.0, 0.0],
    [0.18, 0.0],
    [0.36, 0.0],
    [0.37, 0.16],
    [0.29, 0.34],
    [0.25, 0.46],
    [0.31, 0.54],
    [0.46, 0.52],
    [0.6, 0.55],
    [0.67, 0.66],
    [0.62, 0.82],
    [0.47, 0.99],
    [0.31, 1.15],
    [0.17, 1.27],
    [0.12, 1.43],
    [0.0, 1.31],
    [-0.1, 1.14],
    [-0.23, 0.9],
    [-0.33, 0.62],
    [-0.38, 0.3],
  ]
  const curve = new THREE.CatmullRomCurve3(
    outline.map(([x, y]) => new THREE.Vector3(x, y, 0)),
    true,
    'centripetal',
  )
  const shape = new THREE.Shape(curve.getPoints(260).map((p) => new THREE.Vector2(p.x, p.y)))

  const depth = 0.24
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.11,
    bevelSize: 0.075,
    bevelSegments: 10,
    curveSegments: 1,
  })
  geo.translate(0, 0, -depth / 2)

  // Taper thickness: full body at the chest, slimmer head and muzzle.
  const pos = geo.attributes.position
  const smooth = (a: number, b: number, v: number) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
    return t * t * (3 - 2 * t)
  }
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const f = 1 - 0.34 * smooth(0.1, 0.68, x) - 0.12 * smooth(0.85, 1.4, y)
    pos.setZ(i, pos.getZ(i) * f)
  }

  geo.deleteAttribute('normal')
  geo.deleteAttribute('uv')
  const welded = mergeVertices(geo, 1e-4)
  geo.dispose()
  welded.computeVertexNormals()
  return welded
}

/** Eyes + nostrils — tiny dark inlays that give the knight a face. */
function knightDetails() {
  const eye = (z: number) => sphere(0.045, 0.3, 0.92, z)
  const nostril = (z: number) => sphere(0.03, 0.6, 0.66, z)
  return merge([eye(0.17), eye(-0.17), nostril(0.12), nostril(-0.12)])
}

/** Fine mane ridge: a row of small spheres along the back of the neck. */
function knightMane() {
  const pts: THREE.BufferGeometry[] = []
  const path: Pt[] = [
    [-0.37, 0.5],
    [-0.35, 0.68],
    [-0.3, 0.84],
    [-0.23, 0.99],
    [-0.15, 1.12],
    [-0.06, 1.24],
  ]
  path.forEach(([x, y], i) => pts.push(sphere(0.062 - i * 0.004, x, y, 0)))
  return merge(pts)
}

export interface PieceGeometries {
  pawn: THREE.BufferGeometry
  rook: THREE.BufferGeometry
  bishop: THREE.BufferGeometry
  queen: THREE.BufferGeometry
  king: THREE.BufferGeometry
  knightBase: THREE.BufferGeometry
  knightBody: THREE.BufferGeometry
  knightDetails: THREE.BufferGeometry
  knightMane: THREE.BufferGeometry
  square: THREE.BufferGeometry
  slab: THREE.BufferGeometry
  plinth: THREE.BufferGeometry
  trimH: THREE.BufferGeometry
  trimV: THREE.BufferGeometry
}

export function buildGeometries(): PieceGeometries {
  return {
    pawn: pawn(),
    rook: rook(),
    bishop: bishop(),
    queen: queen(),
    king: king(),
    knightBase: knightBase(),
    knightBody: knightBody(),
    knightDetails: knightDetails(),
    knightMane: knightMane(),
    square: new RoundedBoxGeometry(0.992, 0.22, 0.992, 3, 0.022),
    slab: new RoundedBoxGeometry(9.2, 0.5, 9.2, 4, 0.07),
    plinth: new RoundedBoxGeometry(9.6, 0.16, 9.6, 4, 0.05),
    trimH: new RoundedBoxGeometry(8.54, 0.1, 0.26, 3, 0.03),
    trimV: new RoundedBoxGeometry(0.26, 0.1, 8.0, 3, 0.03),
  }
}

export function disposeGeometries(g: PieceGeometries) {
  Object.values(g).forEach((geo) => geo.dispose())
}
