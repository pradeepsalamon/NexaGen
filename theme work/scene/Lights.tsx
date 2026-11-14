import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Mood } from './useMood'
import { DARK, LIGHT, lerp } from './palette'
import type { MutableRefObject } from 'react'

/** Studio rig whose colour/intensity blends with the theme mix. */
export function Lights({ mood, reducedMotion }: { mood: MutableRefObject<Mood>; reducedMotion: boolean }) {
  const hemi = useRef<THREE.HemisphereLight>(null)
  const key = useRef<THREE.DirectionalLight>(null)
  const rim = useRef<THREE.DirectionalLight>(null)
  const glow = useRef<THREE.PointLight>(null)
  const gl = useRef<THREE.WebGLRenderer | null>(null)

  useFrame((state) => {
    const m = mood.current.mix
    gl.current = state.gl
    state.gl.toneMappingExposure = lerp(1.05, 0.95, m)

    if (hemi.current) {
      hemi.current.color.lerpColors(LIGHT.hemiSky, DARK.hemiSky, m)
      hemi.current.groundColor.lerpColors(LIGHT.hemiGround, DARK.hemiGround, m)
      hemi.current.intensity = lerp(0.8, 0.38, m)
    }
    if (key.current) {
      key.current.color.lerpColors(LIGHT.key, DARK.key, m)
      key.current.intensity = lerp(2.5, 1.7, m)
    }
    if (rim.current) {
      rim.current.color.lerpColors(LIGHT.rim, DARK.rim, m)
      rim.current.intensity = lerp(1.0, 1.7, m)
    }
    if (glow.current) {
      glow.current.color.lerpColors(LIGHT.glow, DARK.glow, m)
      const pulse = reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 1.3) * 0.08
      glow.current.intensity = lerp(14, 20, m) * (1 + pulse)
    }
  })

  return (
    <>
      <hemisphereLight ref={hemi} />
      <directionalLight
        ref={key}
        position={[3, 13, 10]}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-7.5}
        shadow-camera-right={7.5}
        shadow-camera-top={7.5}
        shadow-camera-bottom={-7.5}
        shadow-camera-near={1}
        shadow-camera-far={34}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-radius={5}
      />
      <directionalLight ref={rim} position={[-10, 6, -9]} />
      <pointLight ref={glow} position={[0.5, 3.1, 0.5]} distance={11} decay={2} />
    </>
  )
}
