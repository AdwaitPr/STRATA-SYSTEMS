import { useEffect, useState } from 'react';
import { telemetryBridge, type TelemetrySnapshot } from '../engine/telemetryBridge';

export function TelemetryReadout() {
  const [snap, setSnap] = useState<TelemetrySnapshot>(() => telemetryBridge.getSnapshot());

  useEffect(() => {
    return telemetryBridge.subscribe(setSnap);
  }, []);

  return (
    <aside
      aria-label="Live wind-tunnel solver telemetry"
      data-testid="telemetry-readout"
      data-wake-pct={snap.activeWakePct.toFixed(1)}
      data-peak-vel={snap.peakVelocity.toFixed(2)}
      data-fbo-verified={String(snap.fboVerified)}
      className="fixed bottom-3 left-3 z-20 hidden sm:flex items-center gap-3 border border-hairline bg-paper-elevated/95 px-3 py-1.5 font-mono text-[10.5px] text-ink-muted dark:border-obsidian-hairline dark:bg-obsidian-elevated/95 dark:text-obsidian-muted tabular-nums"
    >
      <span>
        Wake <strong className="font-medium text-ink dark:text-obsidian-ink">{snap.activeWakePct.toFixed(1)}%</strong>
      </span>
      <span aria-hidden="true">/</span>
      <span>
        Vel <strong className="font-medium text-ink dark:text-obsidian-ink">{snap.peakVelocity.toFixed(1)}</strong>
      </span>
      <span aria-hidden="true">/</span>
      <span>
        Curl <strong className="font-medium text-ink dark:text-obsidian-ink">{snap.vorticityEps.toFixed(1)}</strong>
      </span>
      <span aria-hidden="true">/</span>
      <span>
        Heal <strong className="font-medium text-ink dark:text-obsidian-ink">{snap.healRate.toFixed(3)}</strong>
      </span>
      <span aria-hidden="true">/</span>
      <span>
        {snap.reducedMotion ? 'Static Aperture' : `${snap.fps} Hz`}
      </span>
    </aside>
  );
}
