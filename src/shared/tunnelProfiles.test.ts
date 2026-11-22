import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEEDED_TUNNEL_PROFILES,
  computeReynoldsLabel,
  validateTunnelProfileInput,
} from './tunnelProfiles';

test('seeded tunnel profiles contain the 4 curated aerodynamic presets', () => {
  assert.equal(SEEDED_TUNNEL_PROFILES.length, 4);
  const names = SEEDED_TUNNEL_PROFILES.map((p) => p.name);
  assert.deepEqual(names, [
    'Laminar Calm',
    'High-Vorticity Eddy',
    'Slow-Heal X-Ray',
    'Supersonic Shear',
  ]);
  for (const profile of SEEDED_TUNNEL_PROFILES) {
    const result = validateTunnelProfileInput(profile);
    assert.equal(result.ok, true, `Seeded profile "${profile.name}" should pass validation`);
  }
});

test('validateTunnelProfileInput rejects empty names and out-of-range parameters', () => {
  const emptyName = validateTunnelProfileInput({
    name: '   ',
    description: 'test',
    vorticityEps: 18,
    healRate: 0.965,
    splatRadius: 0.0022,
    velocityDissipation: 0.985,
    showNeedles: true,
    surfaceMode: 'alabaster',
  });
  assert.equal(emptyName.ok, false);

  const badVorticity = validateTunnelProfileInput({
    name: 'Extreme Test',
    vorticityEps: 999,
    healRate: 0.965,
    splatRadius: 0.0022,
    velocityDissipation: 0.985,
    showNeedles: true,
    surfaceMode: 'alabaster',
  });
  assert.equal(badVorticity.ok, false);

  const nanInput = validateTunnelProfileInput({
    name: 'NaN Test',
    vorticityEps: Number.NaN,
    healRate: 0.965,
    splatRadius: 0.0022,
    velocityDissipation: 0.985,
    showNeedles: true,
    surfaceMode: 'obsidian',
  });
  assert.equal(nanInput.ok, false);

  const badTheme = validateTunnelProfileInput({
    name: 'Theme Test',
    vorticityEps: 12,
    healRate: 0.96,
    splatRadius: 0.002,
    velocityDissipation: 0.98,
    showNeedles: true,
    surfaceMode: 'neon-pink',
  });
  assert.equal(badTheme.ok, false);
});

test('validateTunnelProfileInput trims valid input and computes Reynolds label', () => {
  const valid = validateTunnelProfileInput({
    name: '  Boundary   Shear  04 ',
    description: '  Custom calibration  ',
    vorticityEps: 24.5,
    healRate: 0.972,
    splatRadius: 0.0018,
    velocityDissipation: 0.988,
    showNeedles: false,
    surfaceMode: 'obsidian',
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.data.name, 'Boundary Shear 04');
    assert.equal(valid.data.description, 'Custom calibration');
    assert.equal(valid.data.showNeedles, false);
    const reLabel = computeReynoldsLabel(valid.data);
    assert.match(reLabel, /^Re \d+\.\d×10[³⁴⁵]$/);
  }
});
