import { useEffect, useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { pointer } from '../lib/pointer'
import type { Theme } from '../theme/types'
import { Board } from './Board'
import { Dust } from './Dust'
import { createStudioEnvironment } from './environment'
import { buildGeometries, disposeGeometries } from './geometry'
import { GroundShadow } from './GroundShadow'
import { Lights } from './Lights'
import { applyMood, createMaterials, disposeMaterials, setEnvironment } from './materials'
import { Pieces } from './Pieces'
import { useMood } from './useMood'

interface Props {
  theme: Theme
  reducedMotion: boolean
  /** Render loop runs only while the hero is on screen. */
  active: boolean
  onReady: () => void
}

export default function ChessScene({ theme, reducedMotion, active, onReady }: Props) {
  return (
    <Canvas
      orthographic
      shadows
      dpr={[1, 2]}
      frameloop={active ? 'always' : 'never'}
      camera={{ position: [10, 10.5, 10], near: 0.1, far: 80, zoom: 40 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.setClearColor(0x000000, 0)
      }}
      aria-label="Interactive 3D chessboard with a gold knight"
      role="img"
    >
      <Stage theme={theme} reducedMotion={reducedMotion} onReady={onReady} />
    </Canvas>
  )
}

function Stage({ theme, reducedMotion, onReady }: Omit<Props, 'active'>) {
  const mood = useMood(theme)
  const { gl, camera, size } = useThree()
  const group = useRef<THREE.Group>(null)
  const floatY = useRef(0)
  const frames = useRef(0)
  const ready = useRef(false)

  const geos = useMemo(buildGeometries, [])
  const mats = useMemo(createMaterials, [])

  // Procedural studio environment → PMREM, assigned to every material.
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const rt = pmrem.fromScene(createStudioEnvironment(), 0.02)
    setEnvironment(mats, rt.texture)
    return () => {
      setEnvironment(mats, null)
      rt.dispose()
      pmrem.dispose()
    }
  }, [gl, mats])

  useEffect(
    () => () => {
      disposeGeometries(geos)
      disposeMaterials(mats)
    },
    [geos, mats],
  )

  // Fit the isometric board to whatever the container is.
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera
    cam.zoom = Math.min(size.width / 15.2, size.height / 11.2)
    cam.lookAt(0, 0.5, 0)
    cam.updateProjectionMatrix()
  }, [camera, size.width, size.height])

  useFrame(({ clock }, dt) => {
    applyMood(mats, mood.current.mix)

    const g = group.current
    if (g) {
      const t = clock.elapsedTime
      const bob = reducedMotion ? 0 : Math.sin(t * 0.9) * 0.18
      floatY.current = bob
      const px = reducedMotion ? 0 : pointer.x
      const py = reducedMotion ? 0 : pointer.y
      const ry = reducedMotion ? 0 : Math.sin(t * 0.3) * 0.1 + px * 0.22
      g.position.y = THREE.MathUtils.damp(g.position.y, bob + 0.2, 8, dt)
      g.rotation.y = THREE.MathUtils.damp(g.rotation.y, ry, 3, dt)
      g.rotation.x = THREE.MathUtils.damp(g.rotation.x, py * 0.06, 3, dt)
      g.rotation.z = THREE.MathUtils.damp(g.rotation.z, -px * 0.04, 3, dt)
    }

    if (!ready.current && ++frames.current > 3) {
      ready.current = true
      onReady()
    }
  })

  return (
    <>
      <Lights mood={mood} reducedMotion={reducedMotion} />
      <GroundShadow mood={mood} floatY={floatY as MutableRefObject<number>} />
      <group ref={group}>
        <Board geos={geos} mats={mats} />
        <Pieces geos={geos} mats={mats} reducedMotion={reducedMotion} />
      </group>
      <Dust mood={mood} reducedMotion={reducedMotion} />
    </>
  )
}
