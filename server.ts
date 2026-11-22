import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createServer as createViteServer } from 'vite';
import {
  SEEDED_TUNNEL_PROFILES,
  computeReynoldsLabel,
  validateTunnelProfileInput,
  type TunnelProfile,
} from './src/shared/tunnelProfiles.ts';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.resolve(DATA_DIR, 'tunnels.json');
const MAX_PROFILES = 50;

let writeQueue: Promise<void> = Promise.resolve();

async function ensureStoreInitialized(): Promise<TunnelProfile[]> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as TunnelProfile[];
    }
  } catch {
    // Seed initial curated profiles on first boot or unreadable store
  }

  const seeded = [...SEEDED_TUNNEL_PROFILES];
  await persistProfiles(seeded);
  return seeded;
}

async function persistProfiles(profiles: TunnelProfile[]): Promise<void> {
  const resolved = path.resolve(DATA_FILE);
  if (!resolved.startsWith(DATA_DIR + path.sep)) {
    throw new Error('Resolved store path escapes data directory');
  }
  const tmpFile = path.resolve(DATA_DIR, `tunnels.${crypto.randomUUID()}.tmp`);
  await fs.writeFile(tmpFile, JSON.stringify(profiles, null, 2), 'utf8');
  await fs.rename(tmpFile, resolved);
}

async function startServer(): Promise<void> {
  await ensureStoreInitialized();

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/tunnels', async (_req, res) => {
    try {
      const profiles = await ensureStoreInitialized();
      res.status(200).json({ tunnels: profiles });
    } catch (err) {
      console.error('Failed to read tunnel profiles:', err);
      res.status(500).json({ error: 'Unable to load wind-tunnel profiles.' });
    }
  });

  app.post('/api/tunnels', async (req, res) => {
    const validation = validateTunnelProfileInput(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const input = validation.data;
    const newProfile: TunnelProfile = {
      id: `custom-${crypto.randomBytes(5).toString('hex')}`,
      name: input.name,
      description: input.description,
      vorticityEps: input.vorticityEps,
      healRate: input.healRate,
      splatRadius: input.splatRadius,
      velocityDissipation: input.velocityDissipation,
      showNeedles: input.showNeedles,
      surfaceMode: input.surfaceMode,
      reynoldsLabel: computeReynoldsLabel(input),
      builtIn: false,
      createdAt: new Date().toISOString(),
    };

    try {
      let updated: TunnelProfile[] = [];
      writeQueue = writeQueue.then(async () => {
        const current = await ensureStoreInitialized();
        const customProfiles = current.filter((p) => !p.builtIn);
        const builtInProfiles = current.filter((p) => p.builtIn);
        const trimmedCustom = [newProfile, ...customProfiles].slice(
          0,
          Math.max(1, MAX_PROFILES - builtInProfiles.length),
        );
        updated = [...builtInProfiles, ...trimmedCustom];
        await persistProfiles(updated);
      });
      await writeQueue;
      res.status(201).json({ tunnel: newProfile, tunnels: updated });
    } catch (err) {
      console.error('Failed to persist tunnel profile:', err);
      res.status(500).json({ error: 'Unable to save wind-tunnel profile.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`STRATA SYSTEMS wind-tunnel server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
