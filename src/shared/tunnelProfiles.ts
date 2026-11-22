export type SurfaceMode = 'alabaster' | 'obsidian';

export interface FluidConfig {
  vorticityEps: number;
  healRate: number;
  splatRadius: number;
  velocityDissipation: number;
  showNeedles: boolean;
  surfaceMode: SurfaceMode;
}

export interface TunnelProfile extends FluidConfig {
  id: string;
  name: string;
  description: string;
  reynoldsLabel: string;
  builtIn: boolean;
  createdAt: string;
}

export interface NewTunnelProfileInput extends FluidConfig {
  name: string;
  description: string;
}

export const FLUID_LIMITS = {
  vorticityEps: { min: 0, max: 45, step: 0.5 },
  healRate: { min: 0.90, max: 0.992, step: 0.002 },
  splatRadius: { min: 0.0005, max: 0.006, step: 0.0001 },
  velocityDissipation: { min: 0.94, max: 0.996, step: 0.001 },
} as const;

export const DEFAULT_FLUID_CONFIG: FluidConfig = {
  vorticityEps: 18.0,
  healRate: 0.965,
  splatRadius: 0.0022,
  velocityDissipation: 0.985,
  showNeedles: true,
  surfaceMode: 'alabaster',
};

export const SEEDED_TUNNEL_PROFILES: TunnelProfile[] = [
  {
    id: 'laminar-calm',
    name: 'Laminar Calm',
    description: 'Low-vorticity architectural boundary flow with crisp, rapid surface recovery.',
    vorticityEps: 9.0,
    healRate: 0.952,
    splatRadius: 0.0024,
    velocityDissipation: 0.978,
    showNeedles: true,
    surfaceMode: 'alabaster',
    reynoldsLabel: 'Re 1.8×10³',
    builtIn: true,
    createdAt: '2026-01-12T09:00:00.000Z',
  },
  {
    id: 'high-vorticity-eddy',
    name: 'High-Vorticity Eddy',
    description: 'Pronounced Fedkiw curl confinement rolling pointer wakes into tight aerodynamic eddies.',
    vorticityEps: 32.0,
    healRate: 0.968,
    splatRadius: 0.0020,
    velocityDissipation: 0.989,
    showNeedles: true,
    surfaceMode: 'alabaster',
    reynoldsLabel: 'Re 6.4×10⁴',
    builtIn: true,
    createdAt: '2026-01-14T11:30:00.000Z',
  },
  {
    id: 'slow-heal-xray',
    name: 'Slow-Heal X-Ray',
    description: 'Extended blueprint dwell aperture exposing structural CAD schematics across obsidian paper.',
    vorticityEps: 16.5,
    healRate: 0.986,
    splatRadius: 0.0032,
    velocityDissipation: 0.986,
    showNeedles: true,
    surfaceMode: 'obsidian',
    reynoldsLabel: 'Re 3.1×10⁴',
    builtIn: true,
    createdAt: '2026-01-18T14:15:00.000Z',
  },
  {
    id: 'supersonic-shear',
    name: 'Supersonic Shear',
    description: 'Razor-narrow shear kernel with high momentum persistence and rapid needle deflection.',
    vorticityEps: 38.5,
    healRate: 0.946,
    splatRadius: 0.0012,
    velocityDissipation: 0.993,
    showNeedles: true,
    surfaceMode: 'obsidian',
    reynoldsLabel: 'Re 1.2×10⁵',
    builtIn: true,
    createdAt: '2026-01-22T16:45:00.000Z',
  },
];

export function computeReynoldsLabel(
  cfg: Pick<FluidConfig, 'vorticityEps' | 'velocityDissipation'>,
): string {
  const dissipationFactor = Math.max(0.004, 1 - cfg.velocityDissipation);
  const score = (cfg.vorticityEps + 4) / (dissipationFactor * 12);
  if (score >= 100) {
    return `Re ${(score / 100).toFixed(1)}×10⁵`;
  }
  if (score >= 10) {
    return `Re ${(score / 10).toFixed(1)}×10⁴`;
  }
  return `Re ${Math.max(0.8, score).toFixed(1)}×10³`;
}

export type ValidationResult =
  | { ok: true; data: NewTunnelProfileInput }
  | { ok: false; error: string };

export function validateTunnelProfileInput(payload: unknown): ValidationResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'Profile payload must be a JSON object.' };
  }

  const raw = payload as Record<string, unknown>;

  if (typeof raw.name !== 'string') {
    return { ok: false, error: 'Profile name is required.' };
  }
  const name = raw.name.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 56) {
    return { ok: false, error: 'Profile name must be between 2 and 56 characters.' };
  }

  const descriptionRaw = typeof raw.description === 'string' ? raw.description.trim() : '';
  if (descriptionRaw.length > 180) {
    return { ok: false, error: 'Description must be 180 characters or fewer.' };
  }
  const description =
    descriptionRaw.length > 0
      ? descriptionRaw
      : 'Custom wind-tunnel calibration saved from telemetry lab.';

  const checkRange = (
    value: unknown,
    field: keyof typeof FLUID_LIMITS,
    label: string,
  ): number | string => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return `${label} must be a valid number.`;
    }
    const { min, max } = FLUID_LIMITS[field];
    if (value < min || value > max) {
      return `${label} must be between ${min} and ${max}.`;
    }
    return value;
  };

  const vorticityEps = checkRange(raw.vorticityEps, 'vorticityEps', 'Vorticity confinement');
  if (typeof vorticityEps === 'string') return { ok: false, error: vorticityEps };

  const healRate = checkRange(raw.healRate, 'healRate', 'Wake heal rate');
  if (typeof healRate === 'string') return { ok: false, error: healRate };

  const splatRadius = checkRange(raw.splatRadius, 'splatRadius', 'Splat radius');
  if (typeof splatRadius === 'string') return { ok: false, error: splatRadius };

  const velocityDissipation = checkRange(
    raw.velocityDissipation,
    'velocityDissipation',
    'Velocity dissipation',
  );
  if (typeof velocityDissipation === 'string') {
    return { ok: false, error: velocityDissipation };
  }

  if (typeof raw.showNeedles !== 'boolean') {
    return { ok: false, error: 'Needle grid visibility must be a boolean.' };
  }

  if (raw.surfaceMode !== 'alabaster' && raw.surfaceMode !== 'obsidian') {
    return { ok: false, error: 'Surface mode must be alabaster or obsidian.' };
  }

  return {
    ok: true,
    data: {
      name,
      description,
      vorticityEps: Number(vorticityEps.toFixed(2)),
      healRate: Number(healRate.toFixed(4)),
      splatRadius: Number(splatRadius.toFixed(5)),
      velocityDissipation: Number(velocityDissipation.toFixed(4)),
      showNeedles: raw.showNeedles,
      surfaceMode: raw.surfaceMode,
    },
  };
}
