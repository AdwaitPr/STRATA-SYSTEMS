import * as THREE from 'three';
import { clampVelocity, computeSimResolution, type SimResolution } from './fluidMath';
import type { FluidConfig } from '../shared/tunnelProfiles';

import fullscreenVert from './shaders/fullscreen.vert.glsl?raw';
import curlFrag from './shaders/curl.frag.glsl?raw';
import vorticityFrag from './shaders/vorticity.frag.glsl?raw';
import splatFrag from './shaders/splat.frag.glsl?raw';
import divergenceFrag from './shaders/divergence.frag.glsl?raw';
import pressureFrag from './shaders/pressure.frag.glsl?raw';
import gradSubtractFrag from './shaders/gradSubtract.frag.glsl?raw';
import advectFrag from './shaders/advect.frag.glsl?raw';

export interface SplatImpulse {
  prevX: number;
  prevY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  maskStrength: number;
  radiusScale?: number;
}

interface PingPongTarget {
  read: THREE.WebGLRenderTarget;
  write: THREE.WebGLRenderTarget;
  swap(): void;
  dispose(): void;
}

function createPingPong(
  width: number,
  height: number,
  options: THREE.RenderTargetOptions,
): PingPongTarget {
  const rtA = new THREE.WebGLRenderTarget(width, height, options);
  const rtB = new THREE.WebGLRenderTarget(width, height, options);
  return {
    read: rtA,
    write: rtB,
    swap() {
      const tmp = this.read;
      this.read = this.write;
      this.write = tmp;
    },
    dispose() {
      rtA.dispose();
      rtB.dispose();
    },
  };
}

export class FluidSolver {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly quadScene: THREE.Scene;
  private readonly quadCamera: THREE.OrthographicCamera;
  private readonly quadGeometry: THREE.PlaneGeometry;
  private readonly quadMesh: THREE.Mesh;

  private readonly fboType: THREE.TextureDataType;
  private readonly linearFilter: THREE.MagnificationTextureFilter;
  public readonly fboVerified: boolean;

  private resolution: SimResolution;
  private velocity!: PingPongTarget;
  private pressure!: PingPongTarget;
  private mask!: PingPongTarget;
  private curlFBO!: THREE.WebGLRenderTarget;
  private divergenceFBO!: THREE.WebGLRenderTarget;

  private readonly curlMat: THREE.ShaderMaterial;
  private readonly vorticityMat: THREE.ShaderMaterial;
  private readonly splatMat: THREE.ShaderMaterial;
  private readonly divergenceMat: THREE.ShaderMaterial;
  private readonly pressureMat: THREE.ShaderMaterial;
  private readonly gradSubtractMat: THREE.ShaderMaterial;
  private readonly advectMat: THREE.ShaderMaterial;

  private readonly simTexelSize = new THREE.Vector2();
  private readonly maskTexelSize = new THREE.Vector2();
  private readonly jacobiIterations = 18;

  constructor(renderer: THREE.WebGLRenderer, viewportWidth: number, viewportHeight: number) {
    this.renderer = renderer;
    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadGeometry = new THREE.PlaneGeometry(2, 2);

    const probed = this.probeRenderTargetFormat();
    this.fboType = probed.type;
    this.linearFilter = probed.linearFilter;
    this.fboVerified = probed.verified;

    this.resolution = computeSimResolution(viewportWidth, viewportHeight);

    const baseShaderOpts = {
      vertexShader: fullscreenVert,
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
    };

    this.curlMat = new THREE.ShaderMaterial({
      ...baseShaderOpts,
      fragmentShader: curlFrag,
      uniforms: {
        uVelocity: { value: null },
        uTexelSize: { value: this.simTexelSize },
      },
    });

    this.vorticityMat = new THREE.ShaderMaterial({
      ...baseShaderOpts,
      fragmentShader: vorticityFrag,
      uniforms: {
        uVelocity: { value: null },
        uCurl: { value: null },
        uTexelSize: { value: this.simTexelSize },
        uCurlStrength: { value: 18.0 },
        uDt: { value: 1 / 60 },
      },
    });

    this.splatMat = new THREE.ShaderMaterial({
      ...baseShaderOpts,
      fragmentShader: splatFrag,
      uniforms: {
        uTarget: { value: null },
        uPrevMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uForce: { value: new THREE.Vector2(0, 0) },
        uRadius: { value: 0.0022 },
        uAspect: { value: this.resolution.aspect },
        uActive: { value: 0.0 },
        uScrollVel: { value: 0.0 },
        uMode: { value: 0.0 },
        uMaskStrength: { value: 0.8 },
      },
    });

    this.divergenceMat = new THREE.ShaderMaterial({
      ...baseShaderOpts,
      fragmentShader: divergenceFrag,
      uniforms: {
        uVelocity: { value: null },
        uTexelSize: { value: this.simTexelSize },
      },
    });

    this.pressureMat = new THREE.ShaderMaterial({
      ...baseShaderOpts,
      fragmentShader: pressureFrag,
      uniforms: {
        uPressure: { value: null },
        uDivergence: { value: null },
        uTexelSize: { value: this.simTexelSize },
        uDecayOnly: { value: 0.0 },
        uDecay: { value: 0.8 },
      },
    });

    this.gradSubtractMat = new THREE.ShaderMaterial({
      ...baseShaderOpts,
      fragmentShader: gradSubtractFrag,
      uniforms: {
        uPressure: { value: null },
        uVelocity: { value: null },
        uTexelSize: { value: this.simTexelSize },
      },
    });

    this.advectMat = new THREE.ShaderMaterial({
      ...baseShaderOpts,
      fragmentShader: advectFrag,
      uniforms: {
        uVelocity: { value: null },
        uSource: { value: null },
        uTexelSize: { value: this.simTexelSize },
        uDt: { value: 1 / 60 },
        uDissipation: { value: 0.985 },
        uAdvectScale: { value: 30.0 },
        uClampScalar: { value: 0.0 },
      },
    });

    this.quadMesh = new THREE.Mesh(this.quadGeometry, this.curlMat);
    this.quadMesh.frustumCulled = false;
    this.quadScene.add(this.quadMesh);

    this.allocateFBOs(this.resolution);
  }

  private probeRenderTargetFormat(): {
    type: THREE.TextureDataType;
    linearFilter: THREE.MagnificationTextureFilter;
    verified: boolean;
  } {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const hasColorFloat = Boolean(gl.getExtension('EXT_color_buffer_float'));
    const hasColorHalfFloat = Boolean(gl.getExtension('EXT_color_buffer_half_float'));
    const hasHalfFloatLinear = Boolean(gl.getExtension('OES_texture_half_float_linear'));
    const hasFloatLinear = Boolean(gl.getExtension('OES_texture_float_linear'));

    const testCandidate = (
      type: THREE.TextureDataType,
      filter: THREE.MagnificationTextureFilter,
    ): boolean => {
      const rt = new THREE.WebGLRenderTarget(8, 8, {
        format: THREE.RGBAFormat,
        type,
        minFilter: filter,
        magFilter: filter,
        depthBuffer: false,
        stencilBuffer: false,
      });
      this.renderer.setRenderTarget(rt);
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      this.renderer.setRenderTarget(null);
      rt.dispose();
      return status === gl.FRAMEBUFFER_COMPLETE;
    };

    if (hasColorFloat || hasColorHalfFloat) {
      const filter = hasHalfFloatLinear || hasColorFloat ? THREE.LinearFilter : THREE.NearestFilter;
      if (testCandidate(THREE.HalfFloatType, filter)) {
        return { type: THREE.HalfFloatType, linearFilter: filter, verified: true };
      }
      if (testCandidate(THREE.HalfFloatType, THREE.NearestFilter)) {
        return { type: THREE.HalfFloatType, linearFilter: THREE.NearestFilter, verified: true };
      }
    }

    if (hasColorFloat) {
      const filter = hasFloatLinear ? THREE.LinearFilter : THREE.NearestFilter;
      if (testCandidate(THREE.FloatType, filter)) {
        return { type: THREE.FloatType, linearFilter: filter, verified: true };
      }
    }

    const fallbackComplete = testCandidate(THREE.UnsignedByteType, THREE.LinearFilter);
    return {
      type: THREE.UnsignedByteType,
      linearFilter: THREE.LinearFilter,
      verified: fallbackComplete,
    };
  }

  private allocateFBOs(res: SimResolution): void {
    this.disposeFBOs();

    this.simTexelSize.set(1 / res.simWidth, 1 / res.simHeight);
    this.maskTexelSize.set(1 / res.maskWidth, 1 / res.maskHeight);
    this.splatMat.uniforms.uAspect.value = res.aspect;

    const linearOpts: THREE.RenderTargetOptions = {
      format: THREE.RGBAFormat,
      type: this.fboType,
      minFilter: this.linearFilter,
      magFilter: this.linearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    };

    const nearestOpts: THREE.RenderTargetOptions = {
      format: THREE.RGBAFormat,
      type: this.fboType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    };

    this.velocity = createPingPong(res.simWidth, res.simHeight, linearOpts);
    this.pressure = createPingPong(res.simWidth, res.simHeight, nearestOpts);
    this.mask = createPingPong(res.maskWidth, res.maskHeight, linearOpts);
    this.curlFBO = new THREE.WebGLRenderTarget(res.simWidth, res.simHeight, nearestOpts);
    this.divergenceFBO = new THREE.WebGLRenderTarget(res.simWidth, res.simHeight, nearestOpts);

    this.clearAll();
  }

  public clearAll(): void {
    const targets = [
      this.velocity.read,
      this.velocity.write,
      this.pressure.read,
      this.pressure.write,
      this.mask.read,
      this.mask.write,
      this.curlFBO,
      this.divergenceFBO,
    ];
    this.renderer.setClearColor(0x000000, 0);
    for (const rt of targets) {
      this.renderer.setRenderTarget(rt);
      this.renderer.clear(true, false, false);
    }
    this.renderer.setRenderTarget(null);
  }

  public resize(viewportWidth: number, viewportHeight: number): void {
    const next = computeSimResolution(viewportWidth, viewportHeight);
    const changed =
      next.simWidth !== this.resolution.simWidth ||
      next.simHeight !== this.resolution.simHeight ||
      next.maskWidth !== this.resolution.maskWidth ||
      next.maskHeight !== this.resolution.maskHeight;
    this.resolution = next;
    this.splatMat.uniforms.uAspect.value = next.aspect;
    if (changed) {
      this.allocateFBOs(next);
    }
  }

  public get velocityTexture(): THREE.Texture {
    return this.velocity.read.texture;
  }

  public get maskTexture(): THREE.Texture {
    return this.mask.read.texture;
  }

  public get maskTexelSizeVec(): THREE.Vector2 {
    return this.maskTexelSize;
  }

  private blit(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget): void {
    this.quadMesh.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  /**
   * Executes the exact 6-pass per-frame Jos Stam Stable-Fluids Navier-Stokes pipeline:
   * 1. Curl Pass
   * 2. Fedkiw Vorticity Confinement Pass
   * 3. Continuous Line-Segment Velocity + X-Ray Mask Splat Pass (+ scroll shear)
   * 4. Divergence Pass
   * 5. Pressure Decay (0.8) + 18-Iteration Jacobi Pressure Solve
   * 6. Pressure Gradient Projection + Semi-Lagrangian Advection (velocity & X-Ray mask)
   */
  public step(
    dt: number,
    config: FluidConfig,
    splats: SplatImpulse[],
    scrollVel: number,
  ): void {
    const safeDt = Math.min(Math.max(dt, 0.001), 0.05);

    // 1. Curl Pass
    this.curlMat.uniforms.uVelocity.value = this.velocity.read.texture;
    this.blit(this.curlMat, this.curlFBO);

    // 2. Vorticity Confinement Pass
    this.vorticityMat.uniforms.uVelocity.value = this.velocity.read.texture;
    this.vorticityMat.uniforms.uCurl.value = this.curlFBO.texture;
    this.vorticityMat.uniforms.uCurlStrength.value = config.vorticityEps;
    this.vorticityMat.uniforms.uDt.value = safeDt;
    this.blit(this.vorticityMat, this.velocity.write);
    this.velocity.swap();

    // 3. Continuous Line-Segment Splat Pass (velocity + scroll shear + X-Ray wake density)
    const hasScrollShear = Math.abs(scrollVel) > 0.004;
    if (splats.length > 0) {
      for (let i = 0; i < splats.length; i++) {
        const s = splats[i];
        const [cvx, cvy] = clampVelocity(s.vx, s.vy, 40.0);
        const radius = config.splatRadius * (s.radiusScale ?? 1.0);

        // Velocity splat
        this.splatMat.uniforms.uTarget.value = this.velocity.read.texture;
        this.splatMat.uniforms.uPrevMouse.value.set(s.prevX, s.prevY);
        this.splatMat.uniforms.uMouse.value.set(s.x, s.y);
        this.splatMat.uniforms.uForce.value.set(cvx, cvy);
        this.splatMat.uniforms.uRadius.value = radius;
        this.splatMat.uniforms.uActive.value = 1.0;
        this.splatMat.uniforms.uScrollVel.value = i === 0 ? scrollVel : 0.0;
        this.splatMat.uniforms.uMode.value = 0.0;
        this.blit(this.splatMat, this.velocity.write);
        this.velocity.swap();

        // X-Ray wake mask deposit
        this.splatMat.uniforms.uTarget.value = this.mask.read.texture;
        this.splatMat.uniforms.uMaskStrength.value = s.maskStrength;
        this.splatMat.uniforms.uScrollVel.value = i === 0 ? scrollVel : 0.0;
        this.splatMat.uniforms.uMode.value = 1.0;
        this.blit(this.splatMat, this.mask.write);
        this.mask.swap();
      }
    } else if (hasScrollShear) {
      this.splatMat.uniforms.uActive.value = 0.0;
      this.splatMat.uniforms.uScrollVel.value = scrollVel;

      this.splatMat.uniforms.uTarget.value = this.velocity.read.texture;
      this.splatMat.uniforms.uMode.value = 0.0;
      this.blit(this.splatMat, this.velocity.write);
      this.velocity.swap();

      this.splatMat.uniforms.uTarget.value = this.mask.read.texture;
      this.splatMat.uniforms.uMode.value = 1.0;
      this.blit(this.splatMat, this.mask.write);
      this.mask.swap();
    }

    // 4. Divergence Pass
    this.divergenceMat.uniforms.uVelocity.value = this.velocity.read.texture;
    this.blit(this.divergenceMat, this.divergenceFBO);

    // 5. Jacobi Pressure Solve: decay pressure by 0.8, then 18 ping-pong iterations
    this.pressureMat.uniforms.uPressure.value = this.pressure.read.texture;
    this.pressureMat.uniforms.uDivergence.value = this.divergenceFBO.texture;
    this.pressureMat.uniforms.uDecayOnly.value = 1.0;
    this.pressureMat.uniforms.uDecay.value = 0.8;
    this.blit(this.pressureMat, this.pressure.write);
    this.pressure.swap();

    this.pressureMat.uniforms.uDecayOnly.value = 0.0;
    for (let i = 0; i < this.jacobiIterations; i++) {
      this.pressureMat.uniforms.uPressure.value = this.pressure.read.texture;
      this.blit(this.pressureMat, this.pressure.write);
      this.pressure.swap();
    }

    // 6a. Pressure Gradient Projection (u -= grad(p))
    this.gradSubtractMat.uniforms.uPressure.value = this.pressure.read.texture;
    this.gradSubtractMat.uniforms.uVelocity.value = this.velocity.read.texture;
    this.blit(this.gradSubtractMat, this.velocity.write);
    this.velocity.swap();

    // 6b. Semi-Lagrangian Advection: Velocity FBO
    this.advectMat.uniforms.uVelocity.value = this.velocity.read.texture;
    this.advectMat.uniforms.uSource.value = this.velocity.read.texture;
    this.advectMat.uniforms.uTexelSize.value = this.simTexelSize;
    this.advectMat.uniforms.uDt.value = safeDt;
    this.advectMat.uniforms.uDissipation.value = config.velocityDissipation;
    this.advectMat.uniforms.uAdvectScale.value = 30.0;
    this.advectMat.uniforms.uClampScalar.value = 0.0;
    this.blit(this.advectMat, this.velocity.write);
    this.velocity.swap();

    // 6c. Semi-Lagrangian Advection: X-Ray Reveal Mask FBO (organic healing decay uHealRate)
    this.advectMat.uniforms.uVelocity.value = this.velocity.read.texture;
    this.advectMat.uniforms.uSource.value = this.mask.read.texture;
    this.advectMat.uniforms.uTexelSize.value = this.simTexelSize;
    this.advectMat.uniforms.uDissipation.value = config.healRate;
    this.advectMat.uniforms.uAdvectScale.value = 26.0;
    this.advectMat.uniforms.uClampScalar.value = 1.0;
    this.blit(this.advectMat, this.mask.write);
    this.mask.swap();

    this.renderer.setRenderTarget(null);
  }

  private disposeFBOs(): void {
    this.velocity?.dispose();
    this.pressure?.dispose();
    this.mask?.dispose();
    this.curlFBO?.dispose();
    this.divergenceFBO?.dispose();
  }

  public dispose(): void {
    this.disposeFBOs();
    this.quadGeometry.dispose();
    this.curlMat.dispose();
    this.vorticityMat.dispose();
    this.splatMat.dispose();
    this.divergenceMat.dispose();
    this.pressureMat.dispose();
    this.gradSubtractMat.dispose();
    this.advectMat.dispose();
  }
}
