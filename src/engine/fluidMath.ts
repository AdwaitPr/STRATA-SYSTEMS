export interface SimResolution {
  simWidth: number;
  simHeight: number;
  maskWidth: number;
  maskHeight: number;
  aspect: number;
}

export interface NeedleGridLayout {
  cols: number;
  rows: number;
  count: number;
  gridUvs: Float32Array;
}

export interface QuadUvRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VortexImpulse {
  prevX: number;
  prevY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  maskStrength: number;
}

export interface TelemetryEstimatorState {
  peakVelocity: number;
  wakeEnergy: number;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Computes aspect-matched offscreen simulation and X-Ray mask FBO dimensions.
 * - Velocity / Divergence / Curl / Pressure: 256 x round(256 / aspect), clamped 160..320
 * - X-Ray Reveal Mask: 512 x round(512 / aspect), clamped 320..640
 */
export function computeSimResolution(viewportWidth: number, viewportHeight: number): SimResolution {
  const safeW = Math.max(1, Number.isFinite(viewportWidth) ? viewportWidth : 1280);
  const safeH = Math.max(1, Number.isFinite(viewportHeight) ? viewportHeight : 720);
  const aspect = safeW / safeH;

  const simWidth = 256;
  const simHeight = Math.round(clamp(Math.round(256 / aspect), 160, 320));

  const maskWidth = 512;
  const maskHeight = Math.round(clamp(Math.round(512 / aspect), 320, 640));

  return {
    simWidth,
    simHeight,
    maskWidth,
    maskHeight,
    aspect,
  };
}

/**
 * Safely clamps velocity magnitude to prevent numerical instability / NaN propagation.
 */
export function clampVelocity(vx: number, vy: number, maxMagnitude = 40.0): [number, number] {
  const sx = Number.isFinite(vx) ? vx : 0;
  const sy = Number.isFinite(vy) ? vy : 0;
  const magSq = sx * sx + sy * sy;
  const maxSq = maxMagnitude * maxMagnitude;
  if (magSq <= maxSq || magSq === 0) {
    return [sx, sy];
  }
  const scale = maxMagnitude / Math.sqrt(magSq);
  return [sx * scale, sy * scale];
}

/**
 * Converts a browser DOMRect (top-left origin, CSS px) into normalized WebGL UV space
 * (bottom-left origin, 0..1). Returns [x, y, w, h] where (x, y) is the bottom-left corner.
 */
export function domRectToFluidQuadUv(
  rect: { left: number; top: number; width: number; height: number },
  viewportWidth: number,
  viewportHeight: number,
): QuadUvRect {
  const safeW = Math.max(1, viewportWidth);
  const safeH = Math.max(1, viewportHeight);

  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    rect.top >= safeH ||
    rect.top + rect.height <= 0 ||
    rect.left >= safeW ||
    rect.left + rect.width <= 0
  ) {
    return { x: -2, y: -2, w: 0, h: 0 };
  }

  const x = rect.left / safeW;
  const w = rect.width / safeW;
  const h = rect.height / safeH;
  const y = 1.0 - (rect.top + rect.height) / safeH;

  return { x, y, w, h };
}

/**
 * Generates an aspect-matched grid of normalized UV coordinates for the GPU-driven
 * InstancedMesh wind-tunnel micro-vector needle field (~2,800 needles).
 */
export function buildNeedleGrid(aspect: number, targetCount = 2800): NeedleGridLayout {
  const safeAspect = clamp(aspect, 0.45, 3.2);
  const cols = Math.max(24, Math.round(Math.sqrt(targetCount * safeAspect)));
  const rows = Math.max(20, Math.round(cols / safeAspect));
  const count = cols * rows;
  const gridUvs = new Float32Array(count * 2);

  let idx = 0;
  for (let r = 0; r < rows; r++) {
    const v = (r + 0.5) / rows;
    for (let c = 0; c < cols; c++) {
      const u = (c + 0.5) / cols;
      gridUvs[idx++] = u;
      gridUvs[idx++] = v;
    }
  }

  return { cols, rows, count, gridUvs };
}

/**
 * Produces counter-rotating fluid dipole trajectories for the "Release Vortex Pair" action.
 * Stepping phase t in [0, 1] sweeps two opposing jets that shear into twin Kelvin-Helmholtz eddies.
 */
export function sampleVortexDipoleStep(prevT: number, currT: number): VortexImpulse[] {
  const t0 = clamp(prevT, 0, 1);
  const t1 = clamp(currT, 0, 1);
  const dt = Math.max(0.001, t1 - t0);

  // Upper dipole sweeping left-to-right with slight clockwise arc
  const u0x = 0.18 + t0 * 0.64;
  const u0y = 0.58 + Math.sin(t0 * Math.PI * 1.35) * 0.11;
  const u1x = 0.18 + t1 * 0.64;
  const u1y = 0.58 + Math.sin(t1 * Math.PI * 1.35) * 0.11;

  // Lower counter-rotating dipole sweeping right-to-left with opposing counter-clockwise arc
  const l0x = 0.82 - t0 * 0.64;
  const l0y = 0.42 - Math.sin(t0 * Math.PI * 1.35) * 0.11;
  const l1x = 0.82 - t1 * 0.64;
  const l1y = 0.42 - Math.sin(t1 * Math.PI * 1.35) * 0.11;

  const [uvx, uvy] = clampVelocity(((u1x - u0x) / dt) * 18.0, ((u1y - u0y) / dt) * 18.0, 34.0);
  const [lvx, lvy] = clampVelocity(((l1x - l0x) / dt) * 18.0, ((l1y - l0y) / dt) * 18.0, 34.0);

  const envelope = Math.sin(t1 * Math.PI);
  const maskStrength = 0.72 + 0.28 * envelope;

  return [
    {
      prevX: u0x,
      prevY: u0y,
      x: u1x,
      y: u1y,
      vx: uvx,
      vy: uvy,
      maskStrength,
    },
    {
      prevX: l0x,
      prevY: l0y,
      x: l1x,
      y: l1y,
      vx: lvx,
      vy: lvy,
      maskStrength,
    },
  ];
}

/**
 * Pure zero-readback telemetry estimator reflecting live fluid kinetic energy & wake coverage.
 */
export function stepTelemetryEstimator(
  state: TelemetryEstimatorState,
  injectedSpeed: number,
  injectedWake: number,
  velocityDissipation: number,
  healRate: number,
  dt: number,
): TelemetryEstimatorState {
  const safeDt = clamp(dt, 0.001, 0.05);
  const frames = safeDt * 60.0;
  const velDecay = Math.pow(clamp(velocityDissipation, 0.85, 0.999), frames * 1.35);
  const maskDecay = Math.pow(clamp(healRate, 0.85, 0.998), frames * 1.05);

  const nextPeak = clamp(
    Math.max(state.peakVelocity * velDecay, injectedSpeed),
    0,
    40.0,
  );
  const nextWake = clamp(
    state.wakeEnergy * maskDecay + injectedWake * (1.0 - state.wakeEnergy * 0.42),
    0,
    1.0,
  );

  return {
    peakVelocity: nextPeak < 0.04 ? 0 : nextPeak,
    wakeEnergy: nextWake < 0.002 ? 0 : nextWake,
  };
}
