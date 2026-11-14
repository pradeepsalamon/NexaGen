import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AlwaysStencilFunc,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  EqualStencilFunc,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Points,
  PointsMaterial,
  ReplaceStencilOp,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer
} from "three";
import { buildGeometries, disposeGeometries } from "./geometry";
import { KNIGHT_SQUARE, PIECES } from "./layout";
import { DARK, lerp, LIGHT, STUDIO } from "./palette";
import { createBoardTexture, createGlowTexture } from "./textures";

export type HeroSceneOptions = {
  canvas: HTMLCanvasElement;
  /** The element the canvas fills; the scene is sized to it. */
  container: HTMLElement;
  dark: boolean;
  /** Phones, tablets and small machines: no reflections, smaller shadow map, lower pixel ratio. */
  lowPower: boolean;
  /** Called if the device proved too slow and the scene became a still picture. */
  onFrozen: () => void;
  /** Called once, after the first frames are on screen. */
  onReady: () => void;
  /** No motion at all: the finished scene is drawn once and redrawn only when it must be. */
  reducedMotion: boolean;
};

export type HeroScene = {
  dispose: () => void;
  /** Frames are drawn only while active (on screen, tab visible). */
  setActive: (active: boolean) => void;
  /** `instant` when the page itself changes theme in one step (the circular reveal). */
  setDark: (dark: boolean, instant: boolean) => void;
};

/** Something that arrives in the intro: a piece and, when there are reflections, its mirror image. */
type Actor = {
  delay: number;
  mirror: Object3D | null;
  object: Object3D;
  scale: number;
};

const YAWS = [0.4, 2.1, 3.6, 5.2, 1.1, 4.4, 2.8, 0.9, 3.1, 5.6, 1.9, 4.9, 0.2, 3.9];
const KNIGHT_SCALE = 1.34;
/** Three-quarter profile to the camera, which looks along the board's diagonal. */
const KNIGHT_YAW = 0.5;
const PIECE_SCALE = 1.08;
const INTRO_MS = 900;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

/**
 * A baked "photo studio" for the metal to reflect: soft boxes and strip lights
 * on a gradient dome. Procedural, so no HDR file is shipped.
 */
function createStudio(): { dispose: () => void; scene: Scene } {
  const scene = new Scene();
  const disposables: { dispose: () => void }[] = [];
  const radius = 40;
  const dome = new SphereGeometry(radius, 48, 24);
  const pos = dome.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = new Color(STUDIO.top).multiplyScalar(0.75);
  const horizon = new Color(STUDIO.horizon).multiplyScalar(0.32);
  const bottom = new Color(STUDIO.bottom).multiplyScalar(0.1);
  const tmp = new Color();
  for (let i = 0; i < pos.count; i += 1) {
    const t = pos.getY(i) / radius;
    if (t > 0) tmp.copy(horizon).lerp(top, t ** 0.7);
    else tmp.copy(horizon).lerp(bottom, (-t) ** 0.6);
    colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  dome.setAttribute("color", new BufferAttribute(colors, 3));
  const domeMaterial = new MeshBasicMaterial({ side: BackSide, vertexColors: true });
  scene.add(new Mesh(dome, domeMaterial));
  disposables.push(dome, domeMaterial);

  const panel = (w: number, h: number, colour: string, intensity: number, at: [number, number, number]) => {
    const geometry = new PlaneGeometry(w, h);
    const material = new MeshBasicMaterial({ color: new Color(colour).multiplyScalar(intensity), side: DoubleSide });
    const mesh = new Mesh(geometry, material);
    mesh.position.set(...at);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
    disposables.push(geometry, material);
  };
  panel(22, 12, STUDIO.keyBox, 7, [-14, 22, 16]);
  panel(4, 26, STUDIO.strip, 6, [28, 8, 6]);
  panel(4, 26, STUDIO.coolStrip, 4, [-30, 8, -10]);
  panel(34, 6, STUDIO.backLight, 5, [0, 9, -30]);
  // Wide: flat flanks seen from above reflect the floor far in front of them.
  panel(140, 140, STUDIO.floorBounce, 1.5, [0, -22, 0]);

  return { dispose: () => disposables.forEach((d) => d.dispose()), scene };
}

/** Lets the browser paint and take input between the heavy steps of building the scene. */
const breathe = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

/**
 * Builds the scene in short steps and compiles its shaders in the background, so the
 * page never stops while it loads. Resolves when the first frame can be drawn at once.
 */
export async function createHeroScene(options: HeroSceneOptions): Promise<HeroScene> {
  const { canvas, container, lowPower, reducedMotion } = options;

  const renderer = new WebGLRenderer({
    alpha: true,
    antialias: true,
    canvas,
    powerPreference: "high-performance",
    // The reflections are drawn only inside the playing surface, which needs a stencil buffer.
    stencil: !lowPower
  });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  // Redrawn every second frame (see `draw`): nothing here moves fast enough to show it.
  renderer.shadowMap.autoUpdate = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));

  const scene = new Scene();
  const camera = new PerspectiveCamera(24, 1, 1, 120);

  const pmrem = new PMREMGenerator(renderer);
  const studio = createStudio();
  const environment = pmrem.fromScene(studio.scene, 0.02);
  studio.dispose();
  pmrem.dispose();
  scene.environment = environment.texture;
  await breathe();

  /* ───────────── materials ───────────── */

  const geometries = buildGeometries(lowPower ? 32 : 48);
  await breathe();
  const boardTexture = createBoardTexture(lowPower ? 1024 : 2048);
  boardTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  await breathe();

  // Polished gold: full metal under a thin clear coat.
  const gold = new MeshPhysicalMaterial({ clearcoat: 0.4, clearcoatRoughness: 0.16, metalness: 1, roughness: 0.2 });
  // Ebony under piano lacquer.
  const ebony = new MeshPhysicalMaterial({ clearcoat: 1, clearcoatRoughness: 0.08, metalness: 0.25, roughness: 0.32 });
  const eye = new MeshStandardMaterial({ metalness: 0.1, roughness: 0.25 });
  const frame = new MeshPhysicalMaterial({ clearcoat: 0.9, clearcoatRoughness: 0.14, metalness: 0.25, roughness: 0.32 });
  // Polished stone. Slightly see-through, so the mirrored pieces drawn under it read as reflections.
  const surface = new MeshPhysicalMaterial({
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    map: boardTexture,
    opacity: lowPower ? 1 : 0.88,
    roughness: 0.34,
    transparent: !lowPower
  });
  // What the see-through stone lies on. It also marks the surface in the stencil buffer.
  const backing = new MeshBasicMaterial({
    depthTest: false,
    depthWrite: false,
    stencilFunc: AlwaysStencilFunc,
    stencilRef: 1,
    stencilWrite: true,
    stencilZPass: ReplaceStencilOp
  });
  const mirrored = <T extends MeshPhysicalMaterial | MeshStandardMaterial>(material: T): T => {
    const copy = material.clone() as T;
    copy.stencilWrite = true;
    copy.stencilRef = 1;
    copy.stencilFunc = EqualStencilFunc;
    return copy;
  };
  const goldMirror = mirrored(gold);
  const ebonyMirror = mirrored(ebony);
  const eyeMirror = mirrored(eye);

  /* ───────────── board ───────────── */

  const board = new Group();
  scene.add(board);

  const add = (geometry: BufferGeometry, material: MeshPhysicalMaterial, x: number, y: number, z: number, shadow = true) => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    board.add(mesh);
  };
  add(geometries.frame, frame, 0, -0.26, 0);
  add(geometries.skirt, frame, 0, -0.6, 0);
  add(geometries.inlay, gold, 0, 0.025, 0, false);

  const backingMesh = new Mesh(geometries.surface, backing);
  backingMesh.renderOrder = -3;
  board.add(backingMesh);

  const surfaceMesh = new Mesh(geometries.surface, surface);
  surfaceMesh.receiveShadow = true;
  board.add(surfaceMesh);

  /* ───────────── pieces and their mirror images ───────────── */

  const pieces = new Group();
  board.add(pieces);
  const mirrors = lowPower ? null : new Group();
  if (mirrors) {
    mirrors.scale.y = -1;
    board.add(mirrors);
  }

  const actors: Actor[] = [];
  const cast = (object: Object3D) =>
    object.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
    });
  const stage = (object: Object3D, mirror: Object3D | null, f: number, r: number, scale: number, yaw: number) => {
    object.position.set(f - 3.5, 0, r - 3.5);
    object.rotation.y = yaw;
    cast(object);
    pieces.add(object);
    if (mirror && mirrors) {
      mirror.traverse((child) => {
        child.renderOrder = -2;
      });
      mirrors.add(mirror);
    }
    // Pieces arrive from the far corner toward the camera, the knight last.
    actors.push({ delay: 220 + (f + r) * 55, mirror: mirrors ? mirror : null, object, scale });
  };

  PIECES.forEach((piece, i) => {
    const geometry = geometries.pieces[piece.type];
    const isGold = piece.side === "gold";
    stage(
      new Mesh(geometry, isGold ? gold : ebony),
      mirrors ? new Mesh(geometry, isGold ? goldMirror : ebonyMirror) : null,
      piece.f,
      piece.r,
      (piece.scale ?? 1) * PIECE_SCALE,
      YAWS[i % YAWS.length]
    );
  });

  const buildKnight = (goldMaterial: MeshPhysicalMaterial, eyeMaterial: MeshStandardMaterial) => {
    const group = new Group();
    group.add(new Mesh(geometries.knightGold, goldMaterial), new Mesh(geometries.knightDetails, eyeMaterial));
    return group;
  };
  const knight = buildKnight(gold, eye);
  stage(knight, mirrors ? buildKnight(goldMirror, eyeMirror) : null, KNIGHT_SQUARE.f, KNIGHT_SQUARE.r, KNIGHT_SCALE, KNIGHT_YAW);
  actors[actors.length - 1].delay = 1150;

  /* ───────────── light ───────────── */

  const hemi = new HemisphereLight();
  const key = new DirectionalLight();
  key.position.set(3, 13, 10);
  key.castShadow = true;
  const shadowSize = lowPower ? 1024 : 2048;
  key.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(key.shadow.camera, { bottom: -7.5, far: 34, left: -7.5, near: 1, right: 7.5, top: 7.5 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  key.shadow.radius = 4;
  const rim = new DirectionalLight();
  rim.position.set(-10, 6, -9);
  // The warm glow around the knight.
  const glow = new PointLight(0xffffff, 1, 11, 2);
  glow.position.set(0.5, 3.4, 0.5);
  scene.add(hemi, key, rim, glow);

  /* ───────────── ground shadow and dust ───────────── */

  const groundTexture = createGlowTexture(256, 0.45);
  const groundGeometry = new PlaneGeometry(15, 15);
  const groundMaterial = new MeshBasicMaterial({ depthWrite: false, map: groundTexture, toneMapped: false, transparent: true });
  const ground = new Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2.35;
  ground.renderOrder = -1;
  scene.add(ground);

  const dustCount = lowPower ? 40 : 80;
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 3.4 + Math.random() * 4.2;
    dustPositions.set([Math.cos(angle) * distance, -1.2 + Math.random() * 5.6, Math.sin(angle) * distance], i * 3);
  }
  const dustGeometry = new BufferGeometry();
  dustGeometry.setAttribute("position", new BufferAttribute(dustPositions, 3));
  const dustTexture = createGlowTexture(64, 0.25);
  dustTexture.colorSpace = SRGBColorSpace;
  const dustMaterial = new PointsMaterial({
    blending: AdditiveBlending,
    depthWrite: false,
    map: dustTexture,
    size: 7,
    sizeAttenuation: false,
    transparent: true
  });
  const dust = new Points(dustGeometry, dustMaterial);
  scene.add(dust);

  /* ───────────── theme ───────────── */

  let mix = options.dark ? 1 : 0;
  let targetMix = mix;
  const applyMood = (pulse: number) => {
    const m = mix;
    gold.color.lerpColors(LIGHT.gold, DARK.gold, m);
    ebony.color.lerpColors(LIGHT.ebony, DARK.ebony, m);
    eye.color.lerpColors(LIGHT.eye, DARK.eye, m);
    goldMirror.color.copy(gold.color);
    ebonyMirror.color.copy(ebony.color);
    eyeMirror.color.copy(eye.color);
    frame.color.lerpColors(LIGHT.frame, DARK.frame, m);
    surface.color.lerpColors(LIGHT.boardTint, DARK.boardTint, m);
    backing.color.lerpColors(LIGHT.backing, DARK.backing, m);
    // Gold keeps its brilliance at night; lacquer and stone get moodier.
    gold.envMapIntensity = goldMirror.envMapIntensity = lerp(1.35, 1.1, m);
    ebony.envMapIntensity = ebonyMirror.envMapIntensity = lerp(0.95, 0.75, m);
    frame.envMapIntensity = lerp(0.8, 0.5, m);
    surface.envMapIntensity = lerp(0.45, 0.4, m);

    renderer.toneMappingExposure = lerp(1.05, 0.95, m);
    hemi.color.lerpColors(LIGHT.hemiSky, DARK.hemiSky, m);
    hemi.groundColor.lerpColors(LIGHT.hemiGround, DARK.hemiGround, m);
    hemi.intensity = lerp(0.8, 0.38, m);
    key.color.lerpColors(LIGHT.key, DARK.key, m);
    key.intensity = lerp(2.5, 1.7, m);
    rim.color.lerpColors(LIGHT.rim, DARK.rim, m);
    rim.intensity = lerp(1.0, 1.7, m);
    glow.color.lerpColors(LIGHT.glow, DARK.glow, m);
    glow.intensity = lerp(7, 11, m) * (1 + pulse);
    dustMaterial.color.lerpColors(LIGHT.dust, DARK.dust, m);
    dustMaterial.opacity = lerp(0.6, 0.95, m);
    groundMaterial.color.lerpColors(LIGHT.shadow, DARK.shadow, m);
  };

  /* ───────────── size and camera ───────────── */

  const fit = () => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Far enough to hold the board's diagonal across and its pieces upward.
    const tan = Math.tan(MathUtils.degToRad(camera.fov / 2));
    const distance = Math.max(7.1 / (tan * camera.aspect), 5.2 / tan);
    camera.position.set(1, 0.82, 1).normalize().multiplyScalar(distance);
    camera.lookAt(0, 0.55, 0);
    camera.updateProjectionMatrix();
  };
  fit();
  const resizeObserver = new ResizeObserver(() => {
    fit();
    if (!looping) draw(0, 0);
  });

  /* ───────────── pointer ───────────── */

  const pointer = { x: 0, y: 0 };
  const onPointerMove = (event: PointerEvent) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  };
  const followsPointer = !reducedMotion && window.matchMedia("(pointer: fine)").matches;
  if (followsPointer) window.addEventListener("pointermove", onPointerMove, { passive: true });

  /* ───────────── frames ───────────── */

  let elapsed = 0;
  let introAt = reducedMotion ? INTRO_MS * 10 : 0;
  let frames = 0;
  let ready = false;
  let looping = false;
  let active = false;
  let disposed = false;
  let raf = 0;
  let last = 0;

  const place = (actor: Actor, progress: number) => {
    const { mirror, object, scale } = actor;
    const arrived = Math.min(1, Math.max(0, progress));
    object.visible = arrived > 0;
    object.scale.setScalar(scale * Math.max(0.001, easeOutBack(arrived)));
    object.position.y = (1 - easeOutCubic(arrived)) * 1.4;
    if (mirror) {
      mirror.visible = object.visible;
      mirror.position.copy(object.position);
      mirror.rotation.copy(object.rotation);
      mirror.scale.copy(object.scale);
    }
  };

  /** `dt` in seconds; 0 draws the scene as it stands. */
  function draw(dt: number, dtMs: number) {
    elapsed += dt;
    introAt += dtMs;
    const t = elapsed;

    mix = dt > 0 ? MathUtils.damp(mix, targetMix, 6, dt) : targetMix;
    if (Math.abs(mix - targetMix) < 0.001) mix = targetMix;
    applyMood(reducedMotion ? 0 : Math.sin(t * 1.3) * 0.08);

    // The board floats, turns slowly and leans toward the pointer.
    const bob = reducedMotion ? 0 : Math.sin(t * 0.9) * 0.18;
    const rise = easeOutCubic(Math.min(1, introAt / 1100));
    const yaw = reducedMotion ? 0 : Math.sin(t * 0.3) * 0.1 + pointer.x * 0.22;
    if (dt > 0) {
      board.position.y = MathUtils.damp(board.position.y, bob + 0.2 - (1 - rise) * 1.2, 8, dt);
      board.rotation.y = MathUtils.damp(board.rotation.y, yaw, 3, dt);
      board.rotation.x = MathUtils.damp(board.rotation.x, pointer.y * 0.06, 3, dt);
      board.rotation.z = MathUtils.damp(board.rotation.z, -pointer.x * 0.04, 3, dt);
    } else {
      board.position.y = 0.2;
    }

    // The knight sways and looks toward the pointer.
    if (!reducedMotion && dt > 0) {
      const sway = Math.sin(t * 0.55) * 0.28 + Math.sin(t * 0.23) * 0.12;
      knight.rotation.y = MathUtils.damp(knight.rotation.y, sway + pointer.x * 0.4 + KNIGHT_YAW, 4, dt);
    }
    for (const actor of actors) place(actor, (introAt - actor.delay) / INTRO_MS);

    // Highlights travel across the metal as the studio turns a little.
    if (!reducedMotion) scene.environmentRotation.y = Math.sin(t * 0.25) * 0.5;

    groundMaterial.opacity = lerp(0.34, 0.62, mix) * (1 - bob * 0.35) * rise;
    ground.scale.setScalar(1 - bob * 0.12);
    if (!reducedMotion) {
      dust.rotation.y = t * 0.05;
      dust.position.y = Math.sin(t * 0.4) * 0.15;
    }

    renderer.shadowMap.needsUpdate = dt === 0 || frames % 2 === 0;
    renderer.render(scene, camera);

    frames += 1;
    if (!ready && frames > 2) {
      ready = true;
      options.onReady();
    }
  }

  // A device that cannot keep up gets a cheaper picture step by step (fewer pixels and
  // a smaller shadow map, then no reflections), and one that still crawls (no GPU, a
  // very old phone) a still one: a frozen board is better than a page that stutters.
  let quality = 0;
  let frozen = false;
  let sampleMs = 0;
  let samples = 0;
  let slowWindows = 0;
  let watchedMs = 0;
  const watchSpeed = (frameMs: number) => {
    if (frozen || !ready) return;
    // Real time, not animation time: the first seconds on screen (shader compile, intro) are not judged.
    watchedMs += frameMs;
    if (watchedMs < 2600) return;
    sampleMs += frameMs;
    samples += 1;
    if (samples < 20 && sampleMs < 1200) return;
    const average = sampleMs / samples;
    sampleMs = 0;
    samples = 0;
    // Under about 38 frames a second the motion no longer looks smooth.
    slowWindows = average > 26 ? slowWindows + 1 : 0;
    const hopeless = average > 120;
    if (!hopeless && slowWindows < 2) return;
    slowWindows = 0;
    const next = hopeless ? 3 : quality + 1;
    if (next === 1) {
      renderer.setPixelRatio(1);
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.map?.dispose();
      key.shadow.map = null;
      fit();
    } else if (next === 2) {
      if (mirrors) {
        mirrors.visible = false;
        surface.opacity = 1;
      }
    } else {
      // The cheapest moving picture is kept unless it is under 24 frames a second.
      if (average <= 42) return;
      frozen = true;
      update();
      options.onFrozen();
    }
    quality = next;
  };

  const tick = (now: number) => {
    if (!looping) return;
    const frameMs = now - last;
    const dtMs = Math.min(50, frameMs);
    last = now;
    draw(dtMs / 1000, dtMs);
    if (!reducedMotion) watchSpeed(frameMs);
    if (looping) raf = window.requestAnimationFrame(tick);
  };

  const update = () => {
    // With reduced motion nothing moves: a few frames to get on screen, then only on demand.
    const shouldLoop = active && !disposed && !frozen && (!reducedMotion || !ready);
    if (shouldLoop === looping) return;
    looping = shouldLoop;
    window.cancelAnimationFrame(raf);
    if (looping) {
      last = performance.now();
      raf = window.requestAnimationFrame(tick);
    }
  };
  const onReadyStop = window.setInterval(() => {
    if (ready || disposed) {
      window.clearInterval(onReadyStop);
      update();
    }
  }, 200);

  const onContextLost = (event: Event) => {
    event.preventDefault();
    active = false;
    update();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);

  // Shaders are compiled off the main thread where the browser can; drawing before
  // this is done would compile them all at once and stop the page for that long.
  await breathe();
  applyMood(0);
  await renderer.compileAsync(scene, camera);
  resizeObserver.observe(container);

  return {
    dispose: () => {
      disposed = true;
      looping = false;
      window.cancelAnimationFrame(raf);
      window.clearInterval(onReadyStop);
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      disposeGeometries(geometries);
      [gold, ebony, eye, frame, surface, backing, goldMirror, ebonyMirror, eyeMirror, groundMaterial, dustMaterial].forEach((m) =>
        m.dispose()
      );
      [boardTexture, groundTexture, dustTexture, environment].forEach((texture) => texture.dispose());
      groundGeometry.dispose();
      dustGeometry.dispose();
      renderer.dispose();
    },
    setActive: (next) => {
      active = next;
      update();
    },
    setDark: (dark, instant) => {
      targetMix = dark ? 1 : 0;
      if (instant || reducedMotion || frozen) {
        mix = targetMix;
        if (!looping && ready) draw(0, 0);
      }
    }
  };
}
