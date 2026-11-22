import * as THREE from 'three';
import { FluidSolver, type SplatImpulse } from './FluidSolver';
import {
  buildNeedleGrid,
  clampVelocity,
  domRectToFluidQuadUv,
  sampleVortexDipoleStep,
  stepTelemetryEstimator,
  type TelemetryEstimatorState,
} from './fluidMath';
import { telemetryBridge } from './telemetryBridge';
import type { FluidConfig } from '../shared/tunnelProfiles';

import fullscreenVert from './shaders/fullscreen.vert.glsl?raw';
import xrayCompositeFrag from './shaders/xrayComposite.frag.glsl?raw';
import needlesVert from './shaders/needles.vert.glsl?raw';
import needlesFrag from './shaders/needles.frag.glsl?raw';

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class WindTunnelEngine {
  private readonly mountEl: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly isSoftwareGl: boolean;
  private readonly camera: THREE.OrthographicCamera;
  private readonly displayScene: THREE.Scene;
  private readonly solver: FluidSolver;

  private readonly compositeGeometry: THREE.PlaneGeometry;
  private readonly compositeMaterial: THREE.ShaderMaterial;
  private readonly compositeMesh: THREE.Mesh;

  private needleMesh: THREE.InstancedMesh | null = null;
  private readonly needleMaterial: THREE.ShaderMaterial;
  private readonly needleBaseGeometry: THREE.PlaneGeometry;

  private readonly quadRectUniforms: THREE.Vector4[] = [
    new THREE.Vector4(-2, -2, 0, 0),
    new THREE.Vector4(-2, -2, 0, 0),
    new THREE.Vector4(-2, -2, 0, 0),
    new THREE.Vector4(-2, -2, 0, 0),
  ];

  private config: FluidConfig;
  private pendingSplats: SplatImpulse[] = [];
  private hasPointerPrev = false;
  private prevPointerX = 0.5;
  private prevPointerY = 0.5;
  private lastScrollY = 0;
  private scrollVelocity = 0;
  private viewportWidth = 1;
  private viewportHeight = 1;

  private reducedMotion = false;
  private manualPulseRemaining = 0;
  private dipolePhase: number | null = null;
  private dipoleDuration = 1.15;

  private running = false;
  private disposed = false;
  private rafId = 0;
  private timerId = 0;
  private lastFrameTime = 0;
  private elapsedSeconds = 0;
  private smoothedFps = 60;
  private contextLost = false;

  private telemetryState: TelemetryEstimatorState = {
    peakVelocity: 0,
    wakeEnergy: 0,
  };

  private resizeObserver: ResizeObserver | null = null;
  private motionMediaQuery: MediaQueryList | null = null;

  constructor(mountEl: HTMLElement, initialConfig: FluidConfig) {
    this.mountEl = mountEl;
    this.config = { ...initialConfig };
    this.isSoftwareGl = detectSoftwareWebGL();

    this.viewportWidth = Math.max(1, window.innerWidth);
    this.viewportHeight = Math.max(1, window.innerHeight);
    this.lastScrollY = window.scrollY;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    this.renderer.setSize(this.viewportWidth, this.viewportHeight, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.renderer.domElement.dataset.testid = 'wind-tunnel-canvas';

    this.mountEl.innerHTML = '';
    this.mountEl.appendChild(this.renderer.domElement);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.displayScene = new THREE.Scene();

    this.solver = new FluidSolver(this.renderer, this.viewportWidth, this.viewportHeight);

    this.compositeGeometry = new THREE.PlaneGeometry(2, 2);
    this.compositeMaterial = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: xrayCompositeFrag,
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uMaskTex: { value: this.solver.maskTexture },
        uVelocityTex: { value: this.solver.velocityTexture },
        uResolution: { value: new THREE.Vector2(this.viewportWidth, this.viewportHeight) },
        uMaskTexelSize: { value: this.solver.maskTexelSizeVec },
        uTime: { value: 0 },
        uDarkMode: { value: initialConfig.surfaceMode === 'obsidian' ? 1.0 : 0.0 },
        uScrollVel: { value: 0 },
        uScrollY: { value: this.lastScrollY },
        uReducedMotion: { value: 0 },
        uQuadRects: { value: this.quadRectUniforms },
      },
    });
    this.compositeMesh = new THREE.Mesh(this.compositeGeometry, this.compositeMaterial);
    this.compositeMesh.frustumCulled = false;
    this.compositeMesh.renderOrder = 0;
    this.displayScene.add(this.compositeMesh);

    this.needleBaseGeometry = new THREE.PlaneGeometry(1, 0.14);
    this.needleMaterial = new THREE.ShaderMaterial({
      vertexShader: needlesVert,
      fragmentShader: needlesFrag,
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uVelocityTex: { value: this.solver.velocityTexture },
        uMaskTex: { value: this.solver.maskTexture },
        uResolution: { value: new THREE.Vector2(this.viewportWidth, this.viewportHeight) },
        uDarkMode: { value: initialConfig.surfaceMode === 'obsidian' ? 1.0 : 0.0 },
        uOpacity: { value: initialConfig.showNeedles ? 1.0 : 0.0 },
        uReducedMotion: { value: 0 },
      },
    });
    this.rebuildNeedleGrid();

    if (typeof window !== 'undefined' && window.matchMedia) {
      this.motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = this.motionMediaQuery.matches;
      this.syncReducedMotionUniforms();
      this.motionMediaQuery.addEventListener('change', this.onReducedMotionChange);
    }

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.displayScene, this.camera);
    }

    this.bindEvents();
    this.syncDomQuads();

    telemetryBridge.update(
      {
        vorticityEps: this.config.vorticityEps,
        healRate: this.config.healRate,
        reducedMotion: this.reducedMotion,
        fboVerified: this.solver.fboVerified,
      },
      true,
    );

    this.start();
  }

  private rebuildNeedleGrid(): void {
    if (this.needleMesh) {
      this.displayScene.remove(this.needleMesh);
      this.needleMesh.geometry.dispose();
      this.needleMesh.dispose();
      this.needleMesh = null;
    }

    const aspect = this.viewportWidth / Math.max(1, this.viewportHeight);
    const grid = buildNeedleGrid(aspect, 2800);
    const geom = this.needleBaseGeometry.clone();
    geom.setAttribute('aGridUv', new THREE.InstancedBufferAttribute(grid.gridUvs, 2));

    const mesh = new THREE.InstancedMesh(geom, this.needleMaterial, grid.count);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.visible = this.config.showNeedles;

    const identity = new THREE.Matrix4();
    for (let i = 0; i < grid.count; i++) {
      mesh.setMatrixAt(i, identity);
    }
    mesh.instanceMatrix.needsUpdate = true;

    this.needleMesh = mesh;
    this.displayScene.add(mesh);
  }

  private bindEvents(): void {
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    window.addEventListener('pointerleave', this.onPointerLeave, { passive: true });
    window.addEventListener('resize', this.onResize, { passive: true });
    window.addEventListener('scroll', this.onScroll, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.syncDomQuads();
      });
      this.observeDomQuads();
    }
  }

  public observeDomQuads(): void {
    if (!this.resizeObserver) return;
    this.resizeObserver.disconnect();
    const nodes = document.querySelectorAll<HTMLElement>('[data-fluid-quad]');
    nodes.forEach((node) => this.resizeObserver?.observe(node));
    this.syncDomQuads();
  }

  public syncDomQuads(): void {
    const nodes = document.querySelectorAll<HTMLElement>('[data-fluid-quad]');
    for (let i = 0; i < 4; i++) {
      const el = nodes[i];
      if (!el) {
        this.quadRectUniforms[i].set(-2, -2, 0, 0);
        continue;
      }
      const rect = el.getBoundingClientRect();
      const uv = domRectToFluidQuadUv(rect, this.viewportWidth, this.viewportHeight);
      this.quadRectUniforms[i].set(uv.x, uv.y, uv.w, uv.h);
    }
  }

  public updateConfig(next: FluidConfig): void {
    this.config = { ...next };
    const dark = next.surfaceMode === 'obsidian' ? 1.0 : 0.0;
    this.compositeMaterial.uniforms.uDarkMode.value = dark;
    this.needleMaterial.uniforms.uDarkMode.value = dark;
    this.needleMaterial.uniforms.uOpacity.value = next.showNeedles ? 1.0 : 0.0;
    if (this.needleMesh) {
      this.needleMesh.visible = next.showNeedles;
    }
    telemetryBridge.update(
      {
        vorticityEps: next.vorticityEps,
        healRate: next.healRate,
      },
      true,
    );
    if (this.reducedMotion && this.manualPulseRemaining <= 0) {
      this.renderFrame();
    }
  }

  /**
   * Injects two counter-rotating aerodynamic fluid dipoles across the stage
   * to showcase the X-Ray blueprint layer and GPU-driven vector needle curl.
   */
  public releaseVortexPair(): void {
    this.dipolePhase = 0;
    if (this.reducedMotion) {
      this.manualPulseRemaining = 2.6;
      if (!this.running) {
        this.start();
      }
    }
  }

  private syncReducedMotionUniforms(): void {
    const val = this.reducedMotion ? 1.0 : 0.0;
    this.compositeMaterial.uniforms.uReducedMotion.value = val;
    this.needleMaterial.uniforms.uReducedMotion.value = val;
  }

  private onReducedMotionChange = (ev: MediaQueryListEvent): void => {
    this.reducedMotion = ev.matches;
    this.syncReducedMotionUniforms();
    telemetryBridge.update({ reducedMotion: this.reducedMotion }, true);
    if (!this.reducedMotion && !this.running && !document.hidden) {
      this.start();
    } else if (this.reducedMotion) {
      this.renderFrame();
    }
  };

  private onPointerDown = (ev: PointerEvent): void => {
    const u = ev.clientX / Math.max(1, this.viewportWidth);
    const v = 1.0 - ev.clientY / Math.max(1, this.viewportHeight);
    this.prevPointerX = u;
    this.prevPointerY = v;
    this.hasPointerPrev = true;

    if (this.reducedMotion) return;

    // Crisp subtle radial pressure tap
    this.pendingSplats.push({
      prevX: u - 0.004,
      prevY: v,
      x: u + 0.004,
      y: v,
      vx: 3.5,
      vy: 2.0,
      maskStrength: 0.72,
      radiusScale: 1.15,
    });
  };

  private onPointerMove = (ev: PointerEvent): void => {
    if (this.reducedMotion && this.manualPulseRemaining <= 0) return;

    const u = ev.clientX / Math.max(1, this.viewportWidth);
    const v = 1.0 - ev.clientY / Math.max(1, this.viewportHeight);

    if (!this.hasPointerPrev) {
      this.prevPointerX = u;
      this.prevPointerY = v;
      this.hasPointerPrev = true;
      return;
    }

    const dx = u - this.prevPointerX;
    const dy = v - this.prevPointerY;
    const dist = Math.hypot(dx, dy);

    if (dist > 0.0006) {
      const [vx, vy] = clampVelocity(dx * 540.0, dy * 540.0, 40.0);
      this.pendingSplats.push({
        prevX: this.prevPointerX,
        prevY: this.prevPointerY,
        x: u,
        y: v,
        vx,
        vy,
        maskStrength: Math.min(1.0, 0.55 + dist * 9.5),
      });
    }

    this.prevPointerX = u;
    this.prevPointerY = v;
  };

  private onPointerLeave = (): void => {
    this.hasPointerPrev = false;
  };

  private onScroll = (): void => {
    const currentY = window.scrollY;
    const delta = currentY - this.lastScrollY;
    this.lastScrollY = currentY;
    const impulse = Math.max(-2.2, Math.min(2.2, delta * 0.012));
    this.scrollVelocity = Math.max(-4.5, Math.min(4.5, this.scrollVelocity + impulse));
    this.compositeMaterial.uniforms.uScrollY.value = currentY;
    this.syncDomQuads();
    if (this.reducedMotion && this.manualPulseRemaining <= 0) {
      this.renderFrame();
    }
  };

  private onResize = (): void => {
    this.viewportWidth = Math.max(1, window.innerWidth);
    this.viewportHeight = Math.max(1, window.innerHeight);

    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    this.renderer.setSize(this.viewportWidth, this.viewportHeight, false);

    this.solver.resize(this.viewportWidth, this.viewportHeight);
    this.compositeMaterial.uniforms.uResolution.value.set(
      this.viewportWidth,
      this.viewportHeight,
    );
    this.compositeMaterial.uniforms.uMaskTexelSize.value = this.solver.maskTexelSizeVec;
    this.needleMaterial.uniforms.uResolution.value.set(
      this.viewportWidth,
      this.viewportHeight,
    );

    this.rebuildNeedleGrid();
    this.syncDomQuads();
    if (this.reducedMotion && this.manualPulseRemaining <= 0) {
      this.renderFrame();
    }
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.stopLoop();
    } else if (!this.disposed && !this.contextLost) {
      this.lastFrameTime = performance.now();
      this.start();
    }
  };

  private onContextLost = (ev: Event): void => {
    ev.preventDefault();
    this.contextLost = true;
    this.stopLoop();
  };

  private onContextRestored = (): void => {
    this.contextLost = false;
    this.solver.resize(this.viewportWidth, this.viewportHeight);
    this.start();
  };

  private scheduleNextFrame(): void {
    if (!this.running || this.disposed || document.hidden || this.contextLost) return;

    if (this.isSoftwareGl) {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (!this.running || this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          this.timerId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.timerId = window.setTimeout(this.tick, 80);
        }
      };
      this.timerId = window.setTimeout(poll, 5);
    } else {
      this.rafId = window.requestAnimationFrame(this.tick);
    }
  }

  private renderFrame(): void {
    this.compositeMaterial.uniforms.uMaskTex.value = this.solver.maskTexture;
    this.compositeMaterial.uniforms.uVelocityTex.value = this.solver.velocityTexture;
    this.compositeMaterial.uniforms.uTime.value = this.elapsedSeconds;
    this.compositeMaterial.uniforms.uScrollVel.value = this.scrollVelocity;

    this.needleMaterial.uniforms.uVelocityTex.value = this.solver.velocityTexture;
    this.needleMaterial.uniforms.uMaskTex.value = this.solver.maskTexture;

    this.renderer.setRenderTarget(null);
    this.renderer.render(this.displayScene, this.camera);
  }

  private tick = (): void => {
    if (!this.running || this.disposed || document.hidden || this.contextLost) return;

    const now = performance.now();
    const rawDt = this.lastFrameTime > 0 ? (now - this.lastFrameTime) / 1000 : 1 / 60;
    this.lastFrameTime = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    this.elapsedSeconds += dt;

    if (rawDt > 0.001) {
      const instFps = Math.min(120, 1 / rawDt);
      this.smoothedFps = this.smoothedFps * 0.9 + instFps * 0.1;
    }

    // Check reduced motion pause unless manual vortex pulse is running
    if (this.reducedMotion && this.manualPulseRemaining <= 0) {
      this.renderFrame();
      this.stopLoop();
      return;
    }

    if (this.manualPulseRemaining > 0) {
      this.manualPulseRemaining = Math.max(0, this.manualPulseRemaining - dt);
    }

    // Advance counter-rotating vortex dipole sequence if active
    if (this.dipolePhase !== null) {
      const prevT = this.dipolePhase;
      const nextT = Math.min(1.0, prevT + dt / this.dipoleDuration);
      const impulses = sampleVortexDipoleStep(prevT, nextT);
      for (const imp of impulses) {
        this.pendingSplats.push({
          ...imp,
          radiusScale: 1.5,
        });
      }
      this.dipolePhase = nextT >= 1.0 ? null : nextT;
    }

    // Track injected energy for zero-readback telemetry bridge
    let injectedSpeed = Math.abs(this.scrollVelocity) * 0.6;
    let injectedWake = Math.abs(this.scrollVelocity) > 0.2 ? 0.03 : 0;
    for (const s of this.pendingSplats) {
      const spd = Math.hypot(s.vx, s.vy);
      if (spd > injectedSpeed) injectedSpeed = spd;
      injectedWake += s.maskStrength * 0.095;
    }

    // Step 6-pass Stable-Fluids Navier-Stokes GPGPU solver
    this.solver.step(dt, this.config, this.pendingSplats, this.scrollVelocity);
    this.pendingSplats.length = 0;

    // Exponentially damp scroll inertia
    this.scrollVelocity *= Math.exp(-7.5 * dt);
    if (Math.abs(this.scrollVelocity) < 0.005) {
      this.scrollVelocity = 0;
    }

    // Render Dual-Reality X-Ray composite + GPU InstancedMesh needle grid
    this.renderFrame();

    // Update zero-rerender telemetry bridge
    this.telemetryState = stepTelemetryEstimator(
      this.telemetryState,
      injectedSpeed,
      injectedWake,
      this.config.velocityDissipation,
      this.config.healRate,
      dt,
    );

    telemetryBridge.update({
      peakVelocity: this.telemetryState.peakVelocity,
      activeWakePct: this.telemetryState.wakeEnergy * 100,
      vorticityEps: this.config.vorticityEps,
      healRate: this.config.healRate,
      fps: Math.round(this.smoothedFps),
    });

    this.scheduleNextFrame();
  };

  private start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastFrameTime = performance.now();
    this.tick();
  }

  private stopLoop(): void {
    this.running = false;
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.timerId) {
      window.clearTimeout(this.timerId);
      this.timerId = 0;
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.stopLoop();

    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('scroll', this.onScroll);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.motionMediaQuery?.removeEventListener('change', this.onReducedMotionChange);
    this.resizeObserver?.disconnect();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);

    this.solver.dispose();
    this.compositeGeometry.dispose();
    this.compositeMaterial.dispose();
    this.needleBaseGeometry.dispose();
    this.needleMaterial.dispose();
    if (this.needleMesh) {
      this.needleMesh.geometry.dispose();
      this.needleMesh.dispose();
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.mountEl) {
      this.mountEl.removeChild(this.renderer.domElement);
    }
  }
}
