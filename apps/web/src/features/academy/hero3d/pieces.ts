import { BufferAttribute, BufferGeometry, type Texture, TextureLoader } from "three";
import type { PieceType } from "./layout";

/**
 * The sculpted pieces: "Chess Set" by Riley Queen (Poly Haven, CC0), cut down to
 * one mesh per piece by `apps/web/scripts/build-hero-chess-set.mjs`, which also
 * documents the file format. A few thousand triangles each; the carving is in
 * the normal map.
 */
const DIR = "/academy/hero3d";

export type PieceSet = {
  /** Red = ambient occlusion, green = roughness. */
  arm: Texture;
  dispose: () => void;
  geometries: Record<PieceType, BufferGeometry>;
  normal: Texture;
};

type PieceEntry = {
  extent: number;
  index: number;
  indices: number;
  normal: number;
  position: number;
  uv: number;
  vertices: number;
};

function readGeometry(data: ArrayBuffer, base: number, entry: PieceEntry): BufferGeometry {
  const { extent, vertices } = entry;
  const packed = new Int16Array(data, base + entry.position, vertices * 3);
  const position = new Float32Array(vertices * 3);
  for (let i = 0; i < position.length; i += 1) position[i] = (packed[i] / 32767) * extent;

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(position, 3));
  geometry.setAttribute("normal", new BufferAttribute(new Int8Array(data, base + entry.normal, vertices * 3), 3, true));
  geometry.setAttribute("uv", new BufferAttribute(new Uint16Array(data, base + entry.uv, vertices * 2), 2, true));
  geometry.setIndex(new BufferAttribute(new Uint16Array(data, base + entry.index, entry.indices), 1));
  geometry.computeBoundingSphere();
  return geometry;
}

async function loadGeometries(): Promise<Record<PieceType, BufferGeometry>> {
  const response = await fetch(`${DIR}/pieces.bin`);
  if (!response.ok) throw new Error(`pieces.bin: ${response.status}`);
  const data = await response.arrayBuffer();
  const headerLength = new DataView(data).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 4, headerLength))) as {
    pieces: Record<PieceType, PieceEntry>;
  };
  const base = 4 + headerLength;
  const read = (piece: PieceType) => readGeometry(data, base, header.pieces[piece]);
  return { bishop: read("bishop"), king: read("king"), knight: read("knight"), pawn: read("pawn"), queen: read("queen"), rook: read("rook") };
}

export async function loadPieceSet(anisotropy: number): Promise<PieceSet> {
  const loader = new TextureLoader();
  const texture = async (file: string) => {
    const loaded = await loader.loadAsync(`${DIR}/${file}`);
    // The model's texture coordinates start at the top left, as the image does.
    loaded.flipY = false;
    loaded.anisotropy = anisotropy;
    return loaded;
  };
  const [geometries, normal, arm] = await Promise.all([loadGeometries(), texture("pieces-normal.webp"), texture("pieces-arm.webp")]);
  return {
    arm,
    dispose: () => {
      Object.values(geometries).forEach((geometry) => geometry.dispose());
      normal.dispose();
      arm.dispose();
    },
    geometries,
    normal
  };
}
