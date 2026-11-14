import { useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { DARK, LIGHT, lerp } from './palette'
import type { Mood } from './useMood'

function shadowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(c)
}

/** Soft contact shadow far below the floating board. It shrinks and lightens as the board rises. */
export function GroundShadow({
  mood,
  floatY,
}: {
  mood: MutableRefObject<Mood>
  floatY: MutableRefObject<number>
}) {
  const mesh = useRef<THREE.Mesh>(null)
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  const map = useMemo(shadowTexture, [])

  useFrame(() => {
    const m = mood.current.mix
    const lift = floatY.current
    if (mat.current) {
      mat.current.color.lerpColors(LIGHT.shadow, DARK.shadow, m)
      mat.current.opacity = lerp(0.34, 0.62, m) * (1 - lift * 0.35)
    }
    if (mesh.current) mesh.current.scale.setScalar(1 - lift * 0.12)
  })

  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.35, 0]} renderOrder={-1}>
      <planeGeometry args={[15, 15]} />
      <meshBasicMaterial ref={mat} map={map} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}
