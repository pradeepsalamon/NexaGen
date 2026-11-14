import * as THREE from 'three'

/**
 * A tiny procedural "photo studio": soft boxes + strip lights on a gradient dome.
 * Baked through PMREM it gives gold and lacquer something rich to reflect —
 * without shipping an HDR file or pulling in extra dependencies.
 */
export function createStudioEnvironment(): THREE.Scene {
  const scene = new THREE.Scene()

  const R = 40
  const dome = new THREE.SphereGeometry(R, 48, 24)
  const pos = dome.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const top = new THREE.Color('#fff1d8').multiplyScalar(0.75)
  const horizon = new THREE.Color('#a8957a').multiplyScalar(0.32)
  const bottom = new THREE.Color('#251c14').multiplyScalar(0.1)
  const tmp = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / R
    if (t > 0) tmp.copy(horizon).lerp(top, Math.pow(t, 0.7))
    else tmp.copy(horizon).lerp(bottom, Math.pow(-t, 0.6))
    colors.set([tmp.r, tmp.g, tmp.b], i * 3)
  }
  dome.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  scene.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })))

  const panel = (w: number, h: number, hex: string, intensity: number, at: [number, number, number]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(intensity), side: THREE.DoubleSide }),
    )
    m.position.set(...at)
    m.lookAt(0, 0, 0)
    scene.add(m)
  }

  panel(22, 12, '#fff2d9', 7, [-14, 22, 16]) // key soft box
  panel(4, 26, '#ffffff', 6, [28, 8, 6]) // right strip
  panel(4, 26, '#cfdcff', 4, [-30, 8, -10]) // cool left strip
  panel(34, 6, '#ffc766', 5, [0, 9, -30]) // golden back light
  panel(40, 40, '#ffe6bd', 1.1, [0, -22, 0]) // warm floor bounce
  return scene
}
