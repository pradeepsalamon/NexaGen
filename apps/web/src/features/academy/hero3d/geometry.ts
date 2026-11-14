import { type BufferGeometry, ExtrudeGeometry, Path, PlaneGeometry, Shape } from "three";

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

export type BoardGeometries = {
  frame: BufferGeometry;
  inlay: BufferGeometry;
  skirt: BufferGeometry;
  surface: BufferGeometry;
};

/**
 * The board itself (the pieces are a model: `pieces.ts`). The frame and its
 * skirt are rings, not slabs: nothing solid lies under the playing surface,
 * which is what lets the reflections show through it.
 */
export function buildBoard(): BoardGeometries {
  const surface = new PlaneGeometry(8, 8);
  surface.rotateX(-Math.PI / 2);
  return {
    frame: squareRing(9.2, 8.0, 0.56, 0.12, 0.05),
    inlay: squareRing(8.68, 8.52, 0.04, 0.02, 0.012),
    skirt: squareRing(9.7, 8.3, 0.18, 0.16, 0.04),
    surface
  };
}

export function disposeBoard(g: BoardGeometries) {
  Object.values(g).forEach((geometry) => geometry.dispose());
}
