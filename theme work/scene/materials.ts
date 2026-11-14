import * as THREE from 'three'
import { DARK, LIGHT, lerp } from './palette'

export interface Materials {
  gold: THREE.MeshPhysicalMaterial
  darkPiece: THREE.MeshPhysicalMaterial
  squareLight: THREE.MeshPhysicalMaterial
  squareDark: THREE.MeshPhysicalMaterial
  frame: THREE.MeshPhysicalMaterial
  eye: THREE.MeshStandardMaterial
}

export function createMaterials(): Materials {
  return {
    // Polished champagne gold: full metal, tight clear-coat sheen.
    gold: new THREE.MeshPhysicalMaterial({
      color: LIGHT.gold,
      metalness: 1,
      roughness: 0.2,
      clearcoat: 0.4,
      clearcoatRoughness: 0.16,
    }),
    // Lacquered "dark" pieces.
    darkPiece: new THREE.MeshPhysicalMaterial({
      color: LIGHT.darkPiece,
      metalness: 0.3,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
    }),
    squareLight: new THREE.MeshPhysicalMaterial({
      color: LIGHT.squareLight,
      roughness: 0.42,
      clearcoat: 0.5,
      clearcoatRoughness: 0.28,
    }),
    squareDark: new THREE.MeshPhysicalMaterial({
      color: LIGHT.squareDark,
      roughness: 0.4,
      clearcoat: 0.6,
      clearcoatRoughness: 0.24,
    }),
    frame: new THREE.MeshPhysicalMaterial({
      color: LIGHT.frame,
      metalness: 0.25,
      roughness: 0.32,
      clearcoat: 0.9,
      clearcoatRoughness: 0.14,
    }),
    eye: new THREE.MeshStandardMaterial({ color: LIGHT.eye, roughness: 0.25, metalness: 0.1 }),
  }
}

export function setEnvironment(m: Materials, env: THREE.Texture | null) {
  Object.values(m).forEach((mat) => {
    mat.envMap = env
    mat.needsUpdate = true
  })
}

/** Blend every material between the light (0) and dark (1) palette. */
export function applyMood(m: Materials, mix: number) {
  m.gold.color.lerpColors(LIGHT.gold, DARK.gold, mix)
  m.darkPiece.color.lerpColors(LIGHT.darkPiece, DARK.darkPiece, mix)
  m.squareLight.color.lerpColors(LIGHT.squareLight, DARK.squareLight, mix)
  m.squareDark.color.lerpColors(LIGHT.squareDark, DARK.squareDark, mix)
  m.frame.color.lerpColors(LIGHT.frame, DARK.frame, mix)
  m.eye.color.lerpColors(LIGHT.eye, DARK.eye, mix)

  // Reflections: gold keeps its brilliance at night, lacquer & stone get moodier.
  m.gold.envMapIntensity = lerp(1.35, 1.1, mix)
  m.darkPiece.envMapIntensity = lerp(0.95, 0.75, mix)
  m.squareLight.envMapIntensity = lerp(0.6, 0.5, mix)
  m.squareDark.envMapIntensity = lerp(0.6, 0.55, mix)
  m.frame.envMapIntensity = lerp(0.8, 0.5, mix)
}

export function disposeMaterials(m: Materials) {
  Object.values(m).forEach((mat) => mat.dispose())
}
