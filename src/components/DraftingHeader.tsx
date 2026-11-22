import { useEffect, useState } from 'react';
import { Moon, SlidersHorizontal, Sun } from 'lucide-react';
import { telemetryBridge, type TelemetrySnapshot } from '../engine/telemetryBridge';
import type { SurfaceMode } from '../shared/tunnelProfiles';

interface DraftingHeaderProps {
  surfaceMode: SurfaceMode;
  drawerOpen: boolean;
  onToggleSurface: () => void;
  onToggleDrawer: () => void;
}

function HeaderWakeTelemetry() {
  const [snap, setSnap] = useState<TelemetrySnapshot>(() => telemetryBridge.getSnapshot());

  useEffect(() => {
    return telemetryBridge.subscribe(setSnap);
  }, []);

  return (
    <div
      className="hidden xl:flex items-center gap-2 font-mono text-[11px] tracking-tight text-ink-muted dark:text-obsidian-muted tabular-nums whitespace-nowrap shrink-0"
      aria-live="off"
      data-testid="header-telemetry"
    >
      <span>WAKE {snap.activeWakePct.toFixed(1)}%</span>
      <span aria-hidden="true">·</span>
      <span>CURL {snap.vorticityEps.toFixed(1)}</span>
    </div>
  );
}

export function DraftingHeader({
  surfaceMode,
  drawerOpen,
  onToggleSurface,
  onToggleDrawer,
}: DraftingHeaderProps) {
  const isObsidian = surfaceMode === 'obsidian';

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-hairline bg-paper/94 dark:border-obsidian-hairline dark:bg-obsidian/94 transition-colors duration-200">
      <div className="mx-auto flex h-full max-w-[1360px] items-center justify-between gap-3 sm:gap-6 px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Brand Wordmark */}
        <a
          href="#top"
          className="font-display text-xs sm:text-sm font-bold tracking-[0.12em] sm:tracking-[0.16em] text-ink dark:text-obsidian-ink whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blueprint dark:focus-visible:outline-blueprint-cyan"
        >
          STRATA SYSTEMS
        </a>

        {/* Zone 2: Editorial Nav + Quiet Live Telemetry */}
        <div className="hidden md:flex items-center gap-8 min-w-0">
          <nav
            aria-label="Primary navigation"
            className="flex items-center gap-6 text-sm font-medium text-ink-muted dark:text-obsidian-muted"
          >
            <a
              href="#schematics"
              className="hover:text-ink dark:hover:text-obsidian-ink transition-colors whitespace-nowrap shrink-0 py-1 border-b border-transparent hover:border-ink/40 dark:hover:border-obsidian-ink/40"
            >
              Schematics
            </a>
            <a
              href="#specifications"
              className="hover:text-ink dark:hover:text-obsidian-ink transition-colors whitespace-nowrap shrink-0 py-1 border-b border-transparent hover:border-ink/40 dark:hover:border-obsidian-ink/40"
            >
              Specifications
            </a>
            <a
              href="#profiles"
              className="hover:text-ink dark:hover:text-obsidian-ink transition-colors whitespace-nowrap shrink-0 py-1 border-b border-transparent hover:border-ink/40 dark:hover:border-obsidian-ink/40"
            >
              Profiles
            </a>
          </nav>

          <HeaderWakeTelemetry />
        </div>

        {/* Zone 3: Surface Theme Switch & Wind-Tunnel Lab Toggle */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onToggleSurface}
            aria-label={isObsidian ? 'Switch to Alabaster surface' : 'Switch to Obsidian surface'}
            className="inline-flex items-center justify-center gap-2 min-h-[40px] min-w-[40px] px-2.5 sm:px-3 py-2 text-xs font-medium text-ink dark:text-obsidian-ink border border-hairline dark:border-obsidian-hairline bg-paper-elevated dark:bg-obsidian-elevated hover:border-blueprint dark:hover:border-blueprint-cyan transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blueprint dark:focus-visible:outline-blueprint-cyan"
          >
            {isObsidian ? (
              <Sun className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Moon className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{isObsidian ? 'Alabaster' : 'Obsidian'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleDrawer}
            aria-expanded={drawerOpen}
            aria-controls="wind-tunnel-drawer"
            aria-label={drawerOpen ? 'Close Wind-Tunnel Lab' : 'Open Wind-Tunnel Lab'}
            className="inline-flex items-center gap-2 min-h-[40px] px-3 sm:px-4 py-2 text-xs font-semibold text-paper dark:text-obsidian bg-ink dark:bg-obsidian-ink hover:bg-blueprint dark:hover:bg-blueprint-cyan transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blueprint dark:focus-visible:outline-blueprint-cyan"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sm:hidden">{drawerOpen ? 'Close' : 'Lab'}</span>
            <span className="hidden sm:inline">{drawerOpen ? 'Close Lab' : 'Wind-Tunnel Lab'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
