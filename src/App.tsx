import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownRight, RefreshCw, SlidersHorizontal, Wind } from 'lucide-react';
import { WindTunnelEngine } from './engine/WindTunnelEngine';
import { DraftingHeader } from './components/DraftingHeader';
import { ShowcaseCards } from './components/ShowcaseCards';
import { TelemetryReadout } from './components/TelemetryReadout';
import { WindTunnelDrawer } from './components/WindTunnelDrawer';
import {
  DEFAULT_FLUID_CONFIG,
  SEEDED_TUNNEL_PROFILES,
  type FluidConfig,
  type TunnelProfile,
} from './shared/tunnelProfiles';

interface SolverSpecRow {
  index: string;
  stage: string;
  equation: string;
  grid: string;
  detail: string;
}

const SOLVER_SPECS: SolverSpecRow[] = [
  {
    index: '01',
    stage: 'Curl & Vorticity Confinement',
    equation: 'ω = ½((vR − vL) − (uT − uB))',
    grid: '256 × 160 Half-Float',
    detail:
      'Computes scalar vorticity and injects Fedkiw curl force f = ε(N × ω)Δt so pointer wakes roll into crisp aerodynamic eddies.',
  },
  {
    index: '02',
    stage: 'Continuous Segment Impulse',
    equation: 'd²(p, seg(m₀, m₁)) + τscroll',
    grid: 'Velocity + 512 × 320 Mask',
    detail:
      'Deposits continuous line-segment momentum and X-Ray wake density without dotted artifacts during rapid sweeps, clamped at |u| ≤ 40.',
  },
  {
    index: '03',
    stage: 'Incompressible Jacobi Projection',
    equation: '∇²p = ∇·u (18 iterations)',
    grid: 'Ping-Pong RGBA16F',
    detail:
      'Solves Poisson pressure with reflective viewport boundaries and projects u − ∇p to strictly divergence-free circulation.',
  },
  {
    index: '04',
    stage: 'GPU-Instanced Vector Needles',
    equation: 'θ = atan(uy, ux) · VTF',
    grid: '~2,800 InstancedMesh Ticks',
    detail:
      'Samples live velocity and mask FBOs directly inside the GLSL 300 es vertex shader with zero CPU readbacks.',
  },
];

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<WindTunnelEngine | null>(null);

  const [config, setConfig] = useState<FluidConfig>(DEFAULT_FLUID_CONFIG);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profiles, setProfiles] = useState<TunnelProfile[]>(SEEDED_TUNNEL_PROFILES);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vortexCount, setVortexCount] = useState(0);

  // Sync HTML .dark class for Tailwind v4 dual-theme contrast
  useEffect(() => {
    const root = document.documentElement;
    if (config.surfaceMode === 'obsidian') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [config.surfaceMode]);

  // Mount WebGL2 WindTunnelEngine once for the lifetime of the page
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new WindTunnelEngine(mount, DEFAULT_FLUID_CONFIG);
    engineRef.current = engine;
    engine.observeDomQuads();

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Push config changes imperatively to the WebGL engine without recreating it
  useEffect(() => {
    engineRef.current?.updateConfig(config);
  }, [config]);

  const fetchProfiles = useCallback(async () => {
    setLoadingProfiles(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/tunnels');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as { tunnels?: TunnelProfile[] };
      if (Array.isArray(data.tunnels)) {
        setProfiles(data.tunnels);
      }
    } catch {
      setLoadError('Unable to reach tunnel profile store. Showing local defaults.');
    } finally {
      setLoadingProfiles(false);
    }
  }, []);

  useEffect(() => {
    void fetchProfiles();
  }, [fetchProfiles]);

  // Re-sync DOM quad observers after layout settles
  useEffect(() => {
    engineRef.current?.observeDomQuads();
  }, [profiles.length]);

  const handleToggleSurface = useCallback(() => {
    setConfig((prev) => ({
      ...prev,
      surfaceMode: prev.surfaceMode === 'alabaster' ? 'obsidian' : 'alabaster',
    }));
    setActiveProfileId(null);
  }, []);

  const handleChangeConfig = useCallback((next: FluidConfig) => {
    setConfig(next);
    setActiveProfileId(null);
  }, []);

  const handleReleaseVortex = useCallback(() => {
    engineRef.current?.releaseVortexPair();
    setVortexCount((c) => c + 1);
  }, []);

  const handleApplyProfile = useCallback((profile: TunnelProfile) => {
    setConfig({
      vorticityEps: profile.vorticityEps,
      healRate: profile.healRate,
      splatRadius: profile.splatRadius,
      velocityDissipation: profile.velocityDissipation,
      showNeedles: profile.showNeedles,
      surfaceMode: profile.surfaceMode,
    });
    setActiveProfileId(profile.id);
    engineRef.current?.releaseVortexPair();
  }, []);

  const handleSaveProfile = useCallback(
    async (name: string, description: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch('/api/tunnels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            description,
            ...config,
          }),
        });
        const data = (await res.json()) as {
          tunnel?: TunnelProfile;
          tunnels?: TunnelProfile[];
          error?: string;
        };
        if (!res.ok) {
          return { ok: false, error: data.error ?? 'Failed to save profile.' };
        }
        if (Array.isArray(data.tunnels)) {
          setProfiles(data.tunnels);
        } else if (data.tunnel) {
          setProfiles((prev) => [...prev, data.tunnel!]);
        }
        if (data.tunnel) {
          setActiveProfileId(data.tunnel.id);
        }
        return { ok: true };
      } catch {
        return { ok: false, error: 'Network error while saving profile.' };
      }
    },
    [config],
  );

  return (
    <div
      id="top"
      data-surface-mode={config.surfaceMode}
      data-vortex-count={vortexCount}
      className="relative min-h-screen text-ink dark:text-obsidian-ink"
    >
      {/* Dedicated WebGL2 Canvas Mount (outside React HUD overlays) */}
      <div
        ref={canvasMountRef}
        className="fixed inset-0 z-0 pointer-events-none"
        aria-hidden="true"
      />

      {/* Minimalist Architectural Drafting Header */}
      <DraftingHeader
        surfaceMode={config.surfaceMode}
        drawerOpen={drawerOpen}
        onToggleSurface={handleToggleSurface}
        onToggleDrawer={() => setDrawerOpen((o) => !o)}
      />

      {/* Semantic Foreground Monograph */}
      <main className="relative z-10">
        {/* 1. Hero Drafting Stage */}
        <section
          aria-labelledby="hero-heading"
          className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8 pt-6 pb-14 lg:pt-8 lg:pb-16"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-7 bg-paper/86 dark:bg-obsidian/86 border border-hairline dark:border-obsidian-hairline p-6 lg:p-8 flex flex-col justify-between">
              <div>
                <p className="font-mono text-xs text-blueprint dark:text-blueprint-cyan mb-3">
                  Spatial Engineering Infrastructure · Zurich / Basel Monograph
                </p>
                <h1
                  id="hero-heading"
                  className="text-[clamp(2rem,3.6vw,3.35rem)] font-semibold leading-[1.06] tracking-[-0.03em] text-ink dark:text-obsidian-ink"
                >
                  Calm architectural paper over live fluid geometry.
                </h1>
                <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-ink-muted dark:text-obsidian-muted">
                  Strata Systems pairs minimalist Swiss drafting discipline with a real-time 2D Jos
                  Stam Navier-Stokes solver. Sweep across the drafting field to part the alabaster
                  surface and inspect the structural CAD blueprint underneath.
                </p>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleReleaseVortex}
                  className="inline-flex items-center gap-2 min-h-[42px] px-5 py-2.5 text-sm font-semibold bg-blueprint text-white hover:bg-blueprint-bright dark:bg-blueprint-cyan dark:text-obsidian dark:hover:bg-white transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blueprint"
                >
                  <Wind className="h-4 w-4" aria-hidden="true" />
                  <span>Release Vortex Pair</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="inline-flex items-center gap-2 min-h-[42px] px-5 py-2.5 text-sm font-medium border border-hairline dark:border-obsidian-hairline bg-paper-elevated/92 dark:bg-obsidian-elevated/92 text-ink dark:text-obsidian-ink hover:border-blueprint dark:hover:border-blueprint-cyan transition-colors whitespace-nowrap cursor-pointer"
                >
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  <span>Tune Solver Parameters</span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-5 bg-paper/86 dark:bg-obsidian/86 border border-hairline dark:border-obsidian-hairline p-6 lg:p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-hairline dark:border-obsidian-hairline pb-3 mb-4 font-mono text-xs text-ink-muted dark:text-obsidian-muted">
                  <span>Active Calibration</span>
                  <span className="text-blueprint dark:text-blueprint-cyan">WebGL2 GLSL 300 es</span>
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 font-mono text-xs tabular-nums">
                  <div>
                    <dt className="text-ink-muted dark:text-obsidian-muted">Vorticity ε</dt>
                    <dd className="mt-1 text-base font-medium text-ink dark:text-obsidian-ink">
                      {config.vorticityEps.toFixed(1)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted dark:text-obsidian-muted">Wake Heal</dt>
                    <dd className="mt-1 text-base font-medium text-ink dark:text-obsidian-ink">
                      {config.healRate.toFixed(3)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted dark:text-obsidian-muted">Jacobi Passes</dt>
                    <dd className="mt-1 text-base font-medium text-ink dark:text-obsidian-ink">
                      18 Iterations
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted dark:text-obsidian-muted">Vector Field</dt>
                    <dd className="mt-1 text-base font-medium text-ink dark:text-obsidian-ink">
                      {config.showNeedles ? '2,800 Needles' : 'Hidden'}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="mt-5 pt-4 border-t border-hairline dark:border-obsidian-hairline flex items-center justify-between text-xs text-ink-muted dark:text-obsidian-muted">
                <span>Surface mode: {config.surfaceMode === 'obsidian' ? 'Obsidian Slate' : 'Alabaster Paper'}</span>
                <a
                  href="#profiles"
                  className="inline-flex items-center gap-1 font-medium text-ink dark:text-obsidian-ink hover:text-blueprint dark:hover:text-blueprint-cyan transition-colors whitespace-nowrap"
                >
                  <span>Profiles</span>
                  <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>

          {/* Open Interactive Drafting Field inviting the first cursor sweep */}
          <div
            data-testid="hero-sweep-stage"
            className="relative mt-6 h-[250px] sm:h-[300px] lg:h-[340px] w-full border border-hairline dark:border-obsidian-hairline bg-transparent flex items-end justify-between p-4 sm:p-5"
          >
            {/* Corner architectural registration ticks */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-0 left-0 h-4 w-4 border-t-2 border-l-2 border-ink/50 dark:border-obsidian-ink/50"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-0 right-0 h-4 w-4 border-t-2 border-r-2 border-ink/50 dark:border-obsidian-ink/50"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 left-0 h-4 w-4 border-b-2 border-l-2 border-ink/50 dark:border-obsidian-ink/50"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 border-ink/50 dark:border-obsidian-ink/50"
            />

            <div className="pointer-events-none bg-paper/88 dark:bg-obsidian/88 border border-hairline dark:border-obsidian-hairline px-3 py-1.5 font-mono text-[11px] tracking-[0.08em] text-ink dark:text-obsidian-ink">
              SWEEP TO EXPOSE ARCHITECTURE
            </div>
            <div className="pointer-events-none hidden sm:block bg-paper/88 dark:bg-obsidian/88 border border-hairline dark:border-obsidian-hairline px-3 py-1.5 font-mono text-[11px] text-ink-muted dark:text-obsidian-muted tabular-nums">
              X-RAY APERTURE · MASK &gt; 0.08 · ZERO READBACK
            </div>
          </div>
        </section>

        {/* 2. DOM-Synced Fluid Blueprint Showcase */}
        <ShowcaseCards />

        {/* 3. System Specifications & Interactive Vortex Trigger */}
        <section
          id="specifications"
          aria-labelledby="specs-heading"
          className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8 py-20 lg:py-28 border-t border-hairline dark:border-obsidian-hairline"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-4 bg-paper/90 dark:bg-obsidian/90 border border-hairline dark:border-obsidian-hairline p-6 sm:p-8">
              <p className="font-mono text-xs text-blueprint dark:text-blueprint-cyan mb-2">
                CFD Architecture · 6-Pass Pipeline
              </p>
              <h2
                id="specs-heading"
                className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink dark:text-obsidian-ink"
              >
                Numerically stable GPGPU solver specification
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ink-muted dark:text-obsidian-muted">
                All Navier-Stokes passes execute strictly inside half-float ping-pong framebuffers
                outside the React render cycle. Release a counter-rotating dipole pair to inspect
                vorticity confinement and needle alignment across the viewport.
              </p>

              <button
                type="button"
                onClick={handleReleaseVortex}
                className="mt-6 w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 text-sm font-semibold bg-ink text-paper hover:bg-blueprint dark:bg-obsidian-ink dark:text-obsidian dark:hover:bg-blueprint-cyan transition-colors cursor-pointer"
              >
                <Wind className="h-4 w-4" aria-hidden="true" />
                <span>Release Vortex Pair</span>
              </button>
            </div>

            <div className="lg:col-span-8 divide-y divide-hairline dark:divide-obsidian-hairline border border-hairline dark:border-obsidian-hairline bg-paper/90 dark:bg-obsidian/90">
              {SOLVER_SPECS.map((row) => (
                <div
                  key={row.index}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-4 p-6 items-start"
                >
                  <div className="sm:col-span-5">
                    <div className="font-mono text-xs text-blueprint dark:text-blueprint-cyan tabular-nums">
                      Pass {row.index} · {row.grid}
                    </div>
                    <h3 className="mt-1 text-base font-semibold text-ink dark:text-obsidian-ink">
                      {row.stage}
                    </h3>
                  </div>
                  <div className="sm:col-span-7">
                    <div className="font-mono text-xs text-ink dark:text-obsidian-ink mb-2 tabular-nums">
                      {row.equation}
                    </div>
                    <p className="text-sm leading-relaxed text-ink-muted dark:text-obsidian-muted">
                      {row.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4. Full-Stack Tunnel Profile Archive */}
        <section
          id="profiles"
          aria-labelledby="profiles-heading"
          className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8 py-20 lg:py-28 border-t border-hairline dark:border-obsidian-hairline"
        >
          <div className="mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4 bg-paper/90 dark:bg-obsidian/90 border border-hairline dark:border-obsidian-hairline p-6">
            <div>
              <p className="font-mono text-xs text-blueprint dark:text-blueprint-cyan mb-2">
                Persisted Aerodynamic Presets · REST Archive
              </p>
              <h2
                id="profiles-heading"
                className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink dark:text-obsidian-ink"
              >
                Wind-Tunnel Profile Archive
              </h2>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => void fetchProfiles()}
                className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 text-xs font-medium border border-hairline dark:border-obsidian-hairline text-ink dark:text-obsidian-ink hover:border-blueprint dark:hover:border-blueprint-cyan transition-colors cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Refresh</span>
              </button>
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 text-xs font-semibold bg-blueprint text-white hover:bg-blueprint-bright dark:bg-blueprint-cyan dark:text-obsidian transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>Save Current Calibration</span>
              </button>
            </div>
          </div>

          {loadError && (
            <div
              role="alert"
              className="mb-6 border border-red-300 bg-red-50/95 px-4 py-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/90 dark:text-red-200"
            >
              {loadError}
            </div>
          )}

          {loadingProfiles ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[0, 1, 2, 3].map((k) => (
                <div
                  key={k}
                  className="h-44 border border-hairline dark:border-obsidian-hairline bg-paper/80 dark:bg-obsidian/80 p-6"
                />
              ))}
            </div>
          ) : profiles.length === 0 ? (
            <div className="border border-hairline dark:border-obsidian-hairline bg-paper/90 dark:bg-obsidian/90 p-10 text-center text-sm text-ink-muted dark:text-obsidian-muted">
              No wind-tunnel profiles saved yet. Open the Telemetry Lab to store a calibration.
            </div>
          ) : (
            <div
              data-testid="profile-archive-grid"
              className="grid grid-cols-1 md:grid-cols-2 gap-6"
            >
              {profiles.map((profile) => {
                const isActive = activeProfileId === profile.id;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => handleApplyProfile(profile)}
                    aria-pressed={isActive}
                    className={`text-left border p-6 transition-colors cursor-pointer ${
                      isActive
                        ? 'border-blueprint bg-paper-elevated/96 dark:border-blueprint-cyan dark:bg-obsidian-elevated/96'
                        : 'border-hairline bg-paper/90 hover:border-blueprint dark:border-obsidian-hairline dark:bg-obsidian/90 dark:hover:border-blueprint-cyan'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-ink dark:text-obsidian-ink">
                          {profile.name}
                        </h3>
                        <p className="mt-1 text-xs font-mono text-ink-muted dark:text-obsidian-muted tabular-nums">
                          {profile.reynoldsLabel} · {profile.surfaceMode === 'obsidian' ? 'Obsidian' : 'Alabaster'}{' '}
                          · {profile.builtIn ? 'Curated' : 'Custom'}
                        </p>
                      </div>
                      <span
                        className={`font-mono text-[11px] whitespace-nowrap shrink-0 ${
                          isActive
                            ? 'font-semibold text-blueprint dark:text-blueprint-cyan'
                            : 'text-ink-muted dark:text-obsidian-muted'
                        }`}
                      >
                        {isActive ? 'Active' : 'Load Profile'}
                      </span>
                    </div>

                    <p className="mt-3 text-sm leading-relaxed text-ink-muted dark:text-obsidian-muted">
                      {profile.description}
                    </p>

                    <div className="mt-4 pt-3 border-t border-hairline dark:border-obsidian-hairline flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-ink-muted dark:text-obsidian-muted tabular-nums">
                      <span>Curl {profile.vorticityEps.toFixed(1)}</span>
                      <span aria-hidden="true">·</span>
                      <span>Heal {profile.healRate.toFixed(3)}</span>
                      <span aria-hidden="true">·</span>
                      <span>Radius {(profile.splatRadius * 1000).toFixed(2)} mm</span>
                      <span aria-hidden="true">·</span>
                      <span>Persistence {profile.velocityDissipation.toFixed(3)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Quiet Architectural Footer */}
      <footer className="relative z-10 border-t border-hairline bg-paper/92 dark:border-obsidian-hairline dark:bg-obsidian/92">
        <div className="mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8 py-8 pb-20 sm:pb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-ink-muted dark:text-obsidian-muted">
          <div className="font-display font-semibold tracking-[0.14em] text-ink dark:text-obsidian-ink">
            STRATA SYSTEMS
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <a href="#top" className="hover:text-ink dark:hover:text-obsidian-ink transition-colors">
              Drafting Stage
            </a>
            <a href="#schematics" className="hover:text-ink dark:hover:text-obsidian-ink transition-colors">
              Schematics
            </a>
            <a href="#specifications" className="hover:text-ink dark:hover:text-obsidian-ink transition-colors">
              Specifications
            </a>
            <a href="#profiles" className="hover:text-ink dark:hover:text-obsidian-ink transition-colors">
              Profiles
            </a>
          </div>
        </div>
      </footer>

      {/* Quiet Corner Telemetry Readout */}
      <TelemetryReadout />

      {/* Collapsible Wind-Tunnel Lab Drawer */}
      <WindTunnelDrawer
        open={drawerOpen}
        config={config}
        activeProfileId={activeProfileId}
        profiles={profiles}
        onClose={() => setDrawerOpen(false)}
        onChangeConfig={handleChangeConfig}
        onApplyProfile={handleApplyProfile}
        onReleaseVortex={handleReleaseVortex}
        onSaveProfile={handleSaveProfile}
      />
    </div>
  );
}
