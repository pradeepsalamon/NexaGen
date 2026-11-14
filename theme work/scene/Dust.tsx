import { useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { DARK, LIGHT, lerp } from './palette'
import type { Mood } from './useMood'

const COUNT = 80

function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Golden motes drifting slowly around the board. */
export function Dust({ mood, reducedMotion }: { mood: MutableRefObject<Mood>; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null)
  const mat = useRef<THREE.PointsMaterial>(null)

  const { geometry, texture } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 3.4 + Math.random() * 4.2
      pos[i * 3] = Math.cos(a) * r
      pos[i * 3 + 1] = -1.2 + Math.random() * 5.6
      pos[i * 3 + 2] = Math.sin(a) * r
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return { geometry: g, texture: glowTexture() }
  }, [])

  useFrame(({ clock }) => {
    const m = mood.current.mix
    if (mat.current) {
      mat.current.color.lerpColors(LIGHT.dust, DARK.dust, m)
      mat.current.opacity = lerp(0.6, 0.95, m)
    }
    if (group.current && !reducedMotion) {
      const t = clock.elapsedTime
      group.current.rotation.y = t * 0.05
      group.current.position.y = Math.sin(t * 0.4) * 0.15
    }
  })

  return (
    <group ref={group}>
      <points geometry={geometry}>
        <pointsMaterial
          ref={mat}
          map={texture}
          size={7}
          sizeAttenuation={false}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  )
}
