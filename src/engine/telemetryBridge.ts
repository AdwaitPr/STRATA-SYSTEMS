export interface TelemetrySnapshot {
  peakVelocity: number;
  activeWakePct: number;
  vorticityEps: number;
  healRate: number;
  fps: number;
  reducedMotion: boolean;
  fboVerified: boolean;
}

type TelemetryListener = (snapshot: TelemetrySnapshot) => void;

class TelemetryBridge {
  private snapshot: TelemetrySnapshot = {
    peakVelocity: 0,
    activeWakePct: 0,
    vorticityEps: 18.0,
    healRate: 0.965,
    fps: 60,
    reducedMotion: false,
    fboVerified: false,
  };

  private listeners = new Set<TelemetryListener>();
  private lastEmitTime = 0;
  private readonly emitIntervalMs = 83; // ~12Hz sampling

  public getSnapshot(): TelemetrySnapshot {
    return this.snapshot;
  }

  public update(partial: Partial<TelemetrySnapshot>, forceEmit = false): void {
    this.snapshot = { ...this.snapshot, ...partial };
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (forceEmit || now - this.lastEmitTime >= this.emitIntervalMs) {
      this.lastEmitTime = now;
      this.listeners.forEach((listener) => listener(this.snapshot));
    }
  }

  public subscribe(listener: TelemetryListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const telemetryBridge = new TelemetryBridge();
