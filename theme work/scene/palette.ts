import * as THREE from 'three'

const c = (hex: string) => new THREE.Color(hex)

/** Scene colours per theme. Gold is intentionally (almost) constant — it is the brand. */
export const LIGHT = {
  squareLight: c('#F7EFDC'),
  squareDark: c('#2C3B5E'),
  darkPiece: c('#18223D'),
  frame: c('#1A2542'),
  gold: c('#E2AE45'),
  eye: c('#0B0D14'),
  hemiSky: c('#FFF3DA'),
  hemiGround: c('#D9C79F'),
  key: c('#FFF0D2'),
  rim: c('#C3D3FF'),
  glow: c('#FFC25A'),
  shadow: c('#2B3350'),
  dust: c('#D3A03A'),
}

export const DARK = {
  squareLight: c('#45435C'),
  squareDark: c('#171A29'),
  darkPiece: c('#2A2940'),
  frame: c('#0B0E17'),
  gold: c('#EBBC57'),
  eye: c('#05060B'),
  hemiSky: c('#56608C'),
  hemiGround: c('#161326'),
  key: c('#FFD9A0'),
  rim: c('#8A84D6'),
  glow: c('#FFBE55'),
  shadow: c('#000000'),
  dust: c('#FFDB8F'),
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
