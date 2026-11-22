import { useState, type FormEvent } from 'react';
import { Check, Wind, X } from 'lucide-react';
import {
  FLUID_LIMITS,
  type FluidConfig,
  type SurfaceMode,
  type TunnelProfile,
} from '../shared/tunnelProfiles';

interface WindTunnelDrawerProps {
  open: boolean;
  config: FluidConfig;
  activeProfileId: string | null;
  profiles: TunnelProfile[];
  onClose: () => void;
  onChangeConfig: (next: FluidConfig) => void;
  onApplyProfile: (profile: TunnelProfile) => void;
  onReleaseVortex: () => void;
  onSaveProfile: (name: string, description: string) => Promise<{ ok: boolean; error?: string }>;
}

export function WindTunnelDrawer({
  open,
  config,
  activeProfileId,
  profiles,
  onClose,
  onChangeConfig,
  onApplyProfile,
  onReleaseVortex,
  onSaveProfile,
}: WindTunnelDrawerProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  if (!open) return null;

  const setSurfaceMode = (surfaceMode: SurfaceMode) => {
    onChangeConfig({ ...config, surfaceMode });
  };

  const handleSubmit = async (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    setFormError(null);
    setSavedNotice(null);

    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setFormError('Enter a profile name (at least 2 characters).');
      return;
    }

    setSaving(true);
    try {
      const result = await onSaveProfile(trimmed, description.trim());
      if (!result.ok) {
        setFormError(result.error ?? 'Could not save profile.');
      } else {
        setSavedNotice(`Saved "${trimmed}" to tunnel archive.`);
        setName('');
        setDescription('');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside
      id="wind-tunnel-drawer"
      role="dialog"
      aria-label="Wind-Tunnel Telemetry Lab"
      className="fixed top-16 right-0 bottom-0 z-40 w-full max-w-[390px] overflow-y-auto border-l border-hairline bg-paper-elevated text-ink shadow-xl dark:border-obsidian-hairline dark:bg-obsidian-elevated dark:text-obsidian-ink"
    >
      <div className="flex items-center justify-between border-b border-hairline dark:border-obsidian-hairline px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold tracking-normal text-ink dark:text-obsidian-ink">
            Wind-Tunnel Telemetry Lab
          </h2>
          <p className="mt-0.5 font-mono text-[11px] text-ink-muted dark:text-obsidian-muted">
            2D Navier-Stokes · 18 Jacobi Iterations
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Wind-Tunnel Lab"
          className="inline-flex h-10 w-10 items-center justify-center border border-hairline dark:border-obsidian-hairline text-ink-muted hover:text-ink dark:text-obsidian-muted dark:hover:text-obsidian-ink transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-6 p-6">
        {/* Surface Reality Theme */}
        <div>
          <span className="block text-xs font-medium text-ink-muted dark:text-obsidian-muted mb-2">
            Surface Reality
          </span>
          <div className="grid grid-cols-2 gap-1 border border-hairline dark:border-obsidian-hairline p-1 bg-paper dark:bg-obsidian">
            <button
              type="button"
              onClick={() => setSurfaceMode('alabaster')}
              aria-pressed={config.surfaceMode === 'alabaster'}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                config.surfaceMode === 'alabaster'
                  ? 'bg-ink text-paper dark:bg-obsidian-ink dark:text-obsidian'
                  : 'text-ink-muted dark:text-obsidian-muted hover:text-ink dark:hover:text-obsidian-ink'
              }`}
            >
              Alabaster Paper
            </button>
            <button
              type="button"
              onClick={() => setSurfaceMode('obsidian')}
              aria-pressed={config.surfaceMode === 'obsidian'}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                config.surfaceMode === 'obsidian'
                  ? 'bg-ink text-paper dark:bg-obsidian-ink dark:text-obsidian'
                  : 'text-ink-muted dark:text-obsidian-muted hover:text-ink dark:hover:text-obsidian-ink'
              }`}
            >
              Obsidian Slate
            </button>
          </div>
        </div>

        {/* Solver Constants */}
        <div className="space-y-4 pt-2 border-t border-hairline dark:border-obsidian-hairline">
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <label htmlFor="slider-vorticity" className="font-medium text-ink dark:text-obsidian-ink">
                Vorticity Confinement
              </label>
              <span className="font-mono text-ink-muted dark:text-obsidian-muted tabular-nums">
                {config.vorticityEps.toFixed(1)}
              </span>
            </div>
            <input
              id="slider-vorticity"
              type="range"
              min={FLUID_LIMITS.vorticityEps.min}
              max={FLUID_LIMITS.vorticityEps.max}
              step={FLUID_LIMITS.vorticityEps.step}
              value={config.vorticityEps}
              onChange={(e) =>
                onChangeConfig({ ...config, vorticityEps: Number(e.target.value) })
              }
              className="strata-slider w-full"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <label htmlFor="slider-heal" className="font-medium text-ink dark:text-obsidian-ink">
                Wake Heal Rate
              </label>
              <span className="font-mono text-ink-muted dark:text-obsidian-muted tabular-nums">
                {config.healRate.toFixed(3)}
              </span>
            </div>
            <input
              id="slider-heal"
              type="range"
              min={FLUID_LIMITS.healRate.min}
              max={FLUID_LIMITS.healRate.max}
              step={FLUID_LIMITS.healRate.step}
              value={config.healRate}
              onChange={(e) => onChangeConfig({ ...config, healRate: Number(e.target.value) })}
              className="strata-slider w-full"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <label htmlFor="slider-radius" className="font-medium text-ink dark:text-obsidian-ink">
                Splat Radius
              </label>
              <span className="font-mono text-ink-muted dark:text-obsidian-muted tabular-nums">
                {(config.splatRadius * 1000).toFixed(2)} mm
              </span>
            </div>
            <input
              id="slider-radius"
              type="range"
              min={FLUID_LIMITS.splatRadius.min}
              max={FLUID_LIMITS.splatRadius.max}
              step={FLUID_LIMITS.splatRadius.step}
              value={config.splatRadius}
              onChange={(e) =>
                onChangeConfig({ ...config, splatRadius: Number(e.target.value) })
              }
              className="strata-slider w-full"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <label htmlFor="slider-dissipation" className="font-medium text-ink dark:text-obsidian-ink">
                Velocity Persistence
              </label>
              <span className="font-mono text-ink-muted dark:text-obsidian-muted tabular-nums">
                {config.velocityDissipation.toFixed(3)}
              </span>
            </div>
            <input
              id="slider-dissipation"
              type="range"
              min={FLUID_LIMITS.velocityDissipation.min}
              max={FLUID_LIMITS.velocityDissipation.max}
              step={FLUID_LIMITS.velocityDissipation.step}
              value={config.velocityDissipation}
              onChange={(e) =>
                onChangeConfig({ ...config, velocityDissipation: Number(e.target.value) })
              }
              className="strata-slider w-full"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div>
              <span className="block text-xs font-medium text-ink dark:text-obsidian-ink">
                Vector Needle Grid
              </span>
              <span className="block font-mono text-[11px] text-ink-muted dark:text-obsidian-muted">
                GPU InstancedMesh · ~2,800 ticks
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={config.showNeedles}
              aria-label="Toggle Vector Needle Grid"
              onClick={() => onChangeConfig({ ...config, showNeedles: !config.showNeedles })}
              className={`min-h-[36px] px-3 py-1.5 text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                config.showNeedles
                  ? 'border-blueprint bg-blueprint text-white dark:border-blueprint-cyan dark:bg-blueprint-cyan dark:text-obsidian'
                  : 'border-hairline dark:border-obsidian-hairline text-ink-muted dark:text-obsidian-muted'
              }`}
            >
              {config.showNeedles ? 'Visible' : 'Hidden'}
            </button>
          </div>

          <button
            type="button"
            onClick={onReleaseVortex}
            className="w-full inline-flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 text-xs font-semibold border border-blueprint text-blueprint hover:bg-blueprint hover:text-white dark:border-blueprint-cyan dark:text-blueprint-cyan dark:hover:bg-blueprint-cyan dark:hover:text-obsidian transition-colors cursor-pointer"
          >
            <Wind className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Release Vortex Pair</span>
          </button>
        </div>

        {/* Save Tunnel Profile Form */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className="space-y-3 pt-4 border-t border-hairline dark:border-obsidian-hairline"
        >
          <h3 className="text-xs font-semibold tracking-tight text-ink dark:text-obsidian-ink">
            Save Tunnel Profile
          </h3>

          <div>
            <label
              htmlFor="tunnel-profile-name"
              className="block text-xs text-ink-muted dark:text-obsidian-muted mb-1"
            >
              Profile Name
            </label>
            <input
              id="tunnel-profile-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (formError) setFormError(null);
              }}
              placeholder="e.g. Crosswind Shear 04"
              maxLength={56}
              className="w-full min-h-[40px] border border-hairline dark:border-obsidian-hairline bg-paper dark:bg-obsidian px-3 py-2 text-xs text-ink dark:text-obsidian-ink placeholder:text-ink-muted/60 focus:border-blueprint dark:focus:border-blueprint-cyan focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="tunnel-profile-desc"
              className="block text-xs text-ink-muted dark:text-obsidian-muted mb-1"
            >
              Calibration Notes (optional)
            </label>
            <input
              id="tunnel-profile-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tight eddy rollup with rapid recovery"
              maxLength={180}
              className="w-full min-h-[40px] border border-hairline dark:border-obsidian-hairline bg-paper dark:bg-obsidian px-3 py-2 text-xs text-ink dark:text-obsidian-ink placeholder:text-ink-muted/60 focus:border-blueprint dark:focus:border-blueprint-cyan focus:outline-none"
            />
          </div>

          {formError && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {formError}
            </p>
          )}
          {savedNotice && (
            <p
              role="status"
              className="flex items-center gap-1.5 text-xs text-blueprint dark:text-blueprint-cyan"
            >
              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{savedNotice}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full min-h-[40px] px-4 py-2 text-xs font-semibold bg-ink text-paper hover:bg-blueprint dark:bg-obsidian-ink dark:text-obsidian dark:hover:bg-blueprint-cyan disabled:opacity-50 transition-colors cursor-pointer"
          >
            {saving ? 'Saving Profile...' : 'Save Tunnel Profile'}
          </button>
        </form>

        {/* Quick Replay Presets */}
        <div className="space-y-2 pt-4 border-t border-hairline dark:border-obsidian-hairline">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-tight text-ink dark:text-obsidian-ink">
              One-Click Replay
            </h3>
            <span className="font-mono text-[11px] text-ink-muted dark:text-obsidian-muted tabular-nums">
              {profiles.length} stored
            </span>
          </div>
          <div className="divide-y divide-hairline dark:divide-obsidian-hairline border border-hairline dark:border-obsidian-hairline">
            {profiles.map((profile) => {
              const active = activeProfileId === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => onApplyProfile(profile)}
                  className={`w-full text-left px-3 py-2.5 transition-colors cursor-pointer ${
                    active
                      ? 'bg-blueprint/10 dark:bg-blueprint-cyan/15'
                      : 'bg-paper/80 dark:bg-obsidian/80 hover:bg-paper dark:hover:bg-obsidian'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-ink dark:text-obsidian-ink truncate">
                      {profile.name}
                    </span>
                    <span className="font-mono text-[11px] text-blueprint dark:text-blueprint-cyan whitespace-nowrap shrink-0 tabular-nums">
                      {profile.reynoldsLabel}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-ink-muted dark:text-obsidian-muted tabular-nums">
                    Curl {profile.vorticityEps.toFixed(1)} · Heal {profile.healRate.toFixed(3)} ·{' '}
                    {profile.surfaceMode === 'obsidian' ? 'Obsidian' : 'Alabaster'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}
