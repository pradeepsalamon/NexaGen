import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { pointer } from '../lib/pointer'
import { KNIGHT_BASE_H, type PieceGeometries } from './geometry'
import { KNIGHT_SQUARE, PIECES } from './layout'
import type { Materials } from './materials'

const YAWS = [0.4, 2.1, 3.6, 5.2, 1.1, 4.4, 2.8, 0.9, 3.1, 5.6, 1.9, 4.9, 0.2, 3.9]

export function Pieces({
  geos,
  mats,
  reducedMotion,
}: {
  geos: PieceGeometries
  mats: Materials
  reducedMotion: boolean
}) {
  return (
    <group>
      {PIECES.map((p, i) => (
        <mesh
          key={`${p.type}-${p.side}-${p.f}-${p.r}`}
          geometry={geos[p.type]}
          material={p.side === 'gold' ? mats.gold : mats.darkPiece}
          position={[p.f - 3.5, 0, p.r - 3.5]}
          rotation={[0, YAWS[i % YAWS.length], 0]}
          scale={p.scale ?? 1}
          castShadow
          receiveShadow
        />
      ))}
      <Knight geos={geos} mats={mats} reducedMotion={reducedMotion} />
    </group>
  )
}

/** The hero: gold knight on the centre square, slowly swaying and turning toward the pointer. */
function Knight({ geos, mats, reducedMotion }: { geos: PieceGeometries; mats: Materials; reducedMotion: boolean }) {
  const ref = useRef<THREE.Group>(null)

  useFrame(({ clock }, dt) => {
    const g = ref.current
    if (!g) return
    const t = clock.elapsedTime
    const sway = reducedMotion ? 0 : Math.sin(t * 0.55) * 0.5 + Math.sin(t * 0.23) * 0.18
    const look = reducedMotion ? 0 : pointer.x * 0.45
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, sway + look - 0.15, 4, dt)
  })

  return (
    <group position={[KNIGHT_SQUARE.f - 3.5, 0, KNIGHT_SQUARE.r - 3.5]} scale={1.28}>
      <group ref={ref}>
        <mesh geometry={geos.knightBase} material={mats.gold} castShadow receiveShadow />
        <group position={[-0.16, KNIGHT_BASE_H - 0.02, 0]}>
          <mesh geometry={geos.knightBody} material={mats.gold} castShadow receiveShadow />
          <mesh geometry={geos.knightMane} material={mats.gold} castShadow />
          <mesh geometry={geos.knightDetails} material={mats.eye} />
        </group>
      </group>
    </group>
  )
}
