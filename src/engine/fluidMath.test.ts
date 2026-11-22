import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNeedleGrid,
  clampVelocity,
  computeSimResolution,
  domRectToFluidQuadUv,
  sampleVortexDipoleStep,
  stepTelemetryEstimator,
} from './fluidMath';

test('computeSimResolution clamps FBO dimensions to spec bounds across aspect ratios', () => {
  const desktop = computeSimResolution(1440, 900);
  assert.equal(desktop.simWidth, 256);
  assert.equal(desktop.simHeight, 160);
  assert.equal(desktop.maskWidth, 512);
  assert.equal(desktop.maskHeight, 320);

  const ultrawide = computeSimResolution(2560, 1080);
  assert.equal(ultrawide.simHeight, 160);
  assert.equal(ultrawide.maskHeight, 320);

  const mobile = computeSimResolution(390, 844);
  assert.equal(mobile.simHeight, 320);
  assert.equal(mobile.maskHeight, 640);
});

test('clampVelocity bounds magnitude to <= 40.0 and eliminates NaN/Infinity', () => {
  const [vx, vy] = clampVelocity(300, 400, 40.0);
  assert.ok(Math.abs(Math.hypot(vx, vy) - 40.0) < 1e-6);
  assert.ok(vx > 0 && vy > 0);

  const [nx, ny] = clampVelocity(Number.NaN, Number.POSITIVE_INFINITY, 40.0);
  assert.equal(nx, 0);
  assert.equal(ny, 0);
});

test('domRectToFluidQuadUv flips Y axis cleanly into normalized WebGL UV space', () => {
  const uv = domRectToFluidQuadUv({ left: 100, top: 200, width: 400, height: 300 }, 1000, 1000);
  assert.ok(Math.abs(uv.x - 0.1) < 1e-6);
  assert.ok(Math.abs(uv.y - 0.5) < 1e-6); // bottom = 200+300=500 -> 1 - 0.5 = 0.5
  assert.ok(Math.abs(uv.w - 0.4) < 1e-6);
  assert.ok(Math.abs(uv.h - 0.3) < 1e-6);

  const offscreen = domRectToFluidQuadUv({ left: 100, top: 1200, width: 400, height: 300 }, 1000, 1000);
  assert.equal(offscreen.w, 0);
  assert.equal(offscreen.h, 0);
});

test('buildNeedleGrid produces aspect-matched ~2800 instanced UV coordinates in (0,1)', () => {
  const grid = buildNeedleGrid(1440 / 900, 2800);
  assert.ok(grid.count >= 2400 && grid.count <= 3200);
  assert.equal(grid.gridUvs.length, grid.count * 2);
  for (let i = 0; i < grid.gridUvs.length; i++) {
    assert.ok(grid.gridUvs[i] > 0 && grid.gridUvs[i] < 1);
  }
});

test('sampleVortexDipoleStep produces two counter-rotating opposing jets', () => {
  const [upper, lower] = sampleVortexDipoleStep(0.2, 0.25);
  assert.ok(upper.vx > 0, 'Upper dipole moves left-to-right');
  assert.ok(lower.vx < 0, 'Lower dipole moves right-to-left');
  assert.ok(Math.hypot(upper.vx, upper.vy) <= 40.0);
  assert.ok(Math.hypot(lower.vx, lower.vy) <= 40.0);
});

test('stepTelemetryEstimator rises on impulse and organically heals back to 0', () => {
  let state = { peakVelocity: 0, wakeEnergy: 0 };
  state = stepTelemetryEstimator(state, 18.0, 0.45, 0.985, 0.965, 1 / 60);
  assert.ok(state.peakVelocity > 15);
  assert.ok(state.wakeEnergy > 0.3);

  for (let i = 0; i < 240; i++) {
    state = stepTelemetryEstimator(state, 0, 0, 0.985, 0.95, 1 / 60);
  }
  assert.ok(state.wakeEnergy < 0.05);
  assert.ok(state.peakVelocity < 0.5);
});
