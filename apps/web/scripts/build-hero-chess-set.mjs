#!/usr/bin/env node
// Builds the sculpted chess pieces of the home page's 3D board
// (`src/features/academy/hero3d`). Run it only to rebuild the two files:
//
//   node apps/web/scripts/build-hero-chess-set.mjs
//
// Source: "Chess Set" by Riley Queen on Poly Haven, licence CC0
// (https://polyhaven.com/a/chess_set). It downloads the glTF, keeps one mesh of
// each of the six pieces and writes into `public/academy/hero3d/`:
//
//   pieces.bin          the six meshes, quantized (format below)
//   pieces-normal.webp  their shared normal map (the fine carving)
//   pieces-arm.webp     red = ambient occlusion, green = roughness
//
// Commit all three. Only the shapes and their surface detail are used; the
// scene gives the pieces its own gold and ebony materials.
//
// pieces.bin: uint32 LE header length, a JSON header, then the data. The header
// lists, per piece, `vertices`, `indices`, `extent` and the byte offsets (from
// the start of the data) of `position` (int16 x3, value / 32767 * extent),
// `normal` (int8 x3, value / 127), `uv` (uint16 x2, value / 65535) and `index`
// (uint16). One board square is 1 unit; a piece stands on y = 0 at its centre.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(WEB_ROOT, "public/academy/hero3d");
const BASE = "https://dl.polyhaven.org/file/ph-assets/Models";
const GLTF = `${BASE}/gltf/1k/chess_set/chess_set_1k.gltf`;
const BIN = `${BASE}/gltf/1k/chess_set/chess_set.bin`;
const NORMAL = `${BASE}/jpg/2k/chess_set/chess_set_pieces_white_nor_gl_2k.jpg`;
const ARM = `${BASE}/jpg/1k/chess_set/chess_set_pieces_white_arm_1k.jpg`;

/** The model's squares are 58 mm; the scene's are 1 unit. */
const SCALE = 1 / 0.058;
const NODES = {
  bishop: "piece_bishop_white_01",
  king: "piece_king_white",
  knight: "piece_knight_white_01",
  pawn: "piece_pawn_white_01",
  queen: "piece_queen_white",
  rook: "piece_rook_white_01"
};

async function download(url) {
  const response = await fetch(url, { headers: { "User-Agent": "asset-fetch/1.0" } });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function readAccessor(gltf, bin, index) {
  const accessor = gltf.accessors[index];
  const view = gltf.bufferViews[accessor.bufferView];
  if (view.byteStride) throw new Error("interleaved buffers are not handled");
  const offset = bin.byteOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const length = accessor.count * COMPONENTS[accessor.type];
  const Type = { 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[accessor.componentType];
  if (!Type) throw new Error(`component type ${accessor.componentType} is not handled`);
  // Copied: the offset inside the file is not always aligned for a typed-array view.
  return new Type(bin.buffer.slice(offset, offset + length * Type.BYTES_PER_ELEMENT));
}

async function main() {
  const [gltfFile, bin, normal, arm] = await Promise.all([GLTF, BIN, NORMAL, ARM].map(download));
  const gltf = JSON.parse(gltfFile.toString("utf8"));

  const header = { pieces: {}, source: "Poly Haven 'Chess Set' by Riley Queen, CC0" };
  const chunks = [];
  let offset = 0;
  const push = (typed) => {
    const at = offset;
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const padding = (4 - (bytes.length % 4)) % 4;
    chunks.push(bytes, Buffer.alloc(padding));
    offset += bytes.length + padding;
    return at;
  };

  for (const [piece, nodeName] of Object.entries(NODES)) {
    const node = gltf.nodes.find((candidate) => candidate.name === nodeName);
    if (!node) throw new Error(`${nodeName} is missing from the model`);
    if (node.rotation || node.scale) throw new Error(`${nodeName} has a transform this script does not apply`);
    const primitive = gltf.meshes[node.mesh].primitives[0];
    const position = readAccessor(gltf, bin, primitive.attributes.POSITION);
    const normal3 = readAccessor(gltf, bin, primitive.attributes.NORMAL);
    const uv = readAccessor(gltf, bin, primitive.attributes.TEXCOORD_0);
    const index = readAccessor(gltf, bin, primitive.indices);
    const vertices = position.length / 3;
    if (vertices > 65535) throw new Error(`${nodeName} has too many vertices for 16-bit indices`);

    // The knight looks along +z in the model; the scene expects +x (a quarter turn about y).
    const turn = piece === "knight";
    const scaled = new Float32Array(position.length);
    const normals = new Int8Array(vertices * 3);
    let extent = 0;
    for (let i = 0; i < vertices; i += 1) {
      const [x, y, z] = [position[i * 3], position[i * 3 + 1], position[i * 3 + 2]];
      const [nx, ny, nz] = [normal3[i * 3], normal3[i * 3 + 1], normal3[i * 3 + 2]];
      const p = turn ? [z, y, -x] : [x, y, z];
      const n = turn ? [nz, ny, -nx] : [nx, ny, nz];
      for (let k = 0; k < 3; k += 1) {
        scaled[i * 3 + k] = p[k] * SCALE;
        extent = Math.max(extent, Math.abs(scaled[i * 3 + k]));
        normals[i * 3 + k] = Math.round(Math.max(-1, Math.min(1, n[k])) * 127);
      }
    }
    const positions = Int16Array.from(scaled, (value) => Math.round((value / extent) * 32767));
    // Kept as the model has them (origin top left): the textures are loaded unflipped.
    const uvs = Uint16Array.from(uv, (value) => Math.round(Math.max(0, Math.min(1, value)) * 65535));

    header.pieces[piece] = {
      extent,
      index: push(Uint16Array.from(index)),
      indices: index.length,
      normal: push(normals),
      position: push(positions),
      uv: push(uvs),
      vertices
    };
  }

  const json = Buffer.from(JSON.stringify(header), "utf8");
  const jsonPadded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(jsonPadded.length);
  const pieces = Buffer.concat([length, jsonPadded, ...chunks]);

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "pieces.bin"), pieces);
  const normalOut = await sharp(normal).webp({ quality: 86 }).toFile(path.join(OUT_DIR, "pieces-normal.webp"));
  // Blue (metalness) is not used: the scene decides which pieces are metal.
  const armOut = await sharp(arm)
    .recomb([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 0]
    ])
    .webp({ quality: 82 })
    .toFile(path.join(OUT_DIR, "pieces-arm.webp"));

  const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
  console.log(`pieces.bin ${kb(pieces.length)}, pieces-normal.webp ${kb(normalOut.size)}, pieces-arm.webp ${kb(armOut.size)}`);
  for (const [piece, info] of Object.entries(header.pieces)) {
    console.log(`  ${piece}: ${info.vertices} vertices, ${info.indices / 3} triangles`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
