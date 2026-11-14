import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import type { PieceGeometries } from './geometry'
import type { Materials } from './materials'

/** 64 inlaid squares (two instanced meshes) on a lacquered frame with a gold inlay line. */
export function Board({ geos, mats }: { geos: PieceGeometries; mats: Materials }) {
  const light = useRef<THREE.InstancedMesh>(null)
  const dark = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    let li = 0
    let di = 0
    for (let f = 0; f < 8; f++) {
      for (let r = 0; r < 8; r++) {
        m.makeTranslation(f - 3.5, -0.11, r - 3.5)
        if ((f + r) % 2 === 0) dark.current?.setMatrixAt(di++, m)
        else light.current?.setMatrixAt(li++, m)
      }
    }
    ;[light.current, dark.current].forEach((im) => {
      if (im) im.instanceMatrix.needsUpdate = true
    })
  }, [])

  return (
    <group>
      <instancedMesh ref={light} args={[geos.square, mats.squareLight, 32]} receiveShadow castShadow />
      <instancedMesh ref={dark} args={[geos.square, mats.squareDark, 32]} receiveShadow castShadow />

      <mesh geometry={geos.slab} material={mats.frame} position={[0, -0.29, 0]} receiveShadow castShadow />
      <mesh geometry={geos.plinth} material={mats.frame} position={[0, -0.62, 0]} castShadow />

      {/* gold inlay ring */}
      <mesh geometry={geos.trimH} material={mats.gold} position={[0, -0.045, 4.13]} receiveShadow />
      <mesh geometry={geos.trimH} material={mats.gold} position={[0, -0.045, -4.13]} receiveShadow />
      <mesh geometry={geos.trimV} material={mats.gold} position={[4.13, -0.045, 0]} receiveShadow />
      <mesh geometry={geos.trimV} material={mats.gold} position={[-4.13, -0.045, 0]} receiveShadow />
    </group>
  )
}
