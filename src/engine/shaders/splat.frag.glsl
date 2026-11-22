precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTarget;
uniform vec2 uPrevMouse;
uniform vec2 uMouse;
uniform vec2 uForce;
uniform float uRadius;
uniform float uAspect;
uniform float uActive;
uniform float uScrollVel;
uniform float uMode; // 0.0 = velocity splat, 1.0 = X-Ray mask density splat
uniform float uMaskStrength;

float distToSegmentSq(vec2 p, vec2 a, vec2 b, float aspect) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  pa.x *= aspect;
  ba.x *= aspect;
  float denom = max(dot(ba, ba), 1e-8);
  float h = clamp(dot(pa, ba) / denom, 0.0, 1.0);
  vec2 d = pa - ba * h;
  return dot(d, d);
}

void main() {
  vec4 base = texture(uTarget, vUv);

  float splat = 0.0;
  if (uActive > 0.5) {
    float d2 = distToSegmentSq(vUv, uPrevMouse, uMouse, uAspect);
    splat = exp(-d2 / max(uRadius, 1e-5));
  }

  if (uMode < 0.5) {
    // Velocity splat + subtle vertical boundary-layer shear from page scroll
    vec2 vel = base.xy + uForce * splat;

    float scrollAbs = abs(uScrollVel);
    if (scrollAbs > 0.005) {
      float clampedScroll = clamp(uScrollVel, -3.5, 3.5);
      float edgeBand = smoothstep(0.18, 0.0, min(vUv.x, 1.0 - vUv.x));
      float waveShear = sin(vUv.y * 10.0) * 0.3 + 0.7;
      vel.y += clampedScroll * (0.04 + edgeBand * 0.14) * waveShear;
      vel.x += clampedScroll * sin(vUv.y * 7.0) * edgeBand * 0.06;
    }

    if (any(isnan(vel)) || any(isinf(vel))) {
      vel = vec2(0.0);
    }

    float mag = length(vel);
    if (mag > 40.0) {
      vel *= 40.0 / mag;
    }

    fragColor = vec4(vel, 0.0, 1.0);
  } else {
    // X-Ray reveal mask scalar density deposit
    float density = base.x;
    if (uActive > 0.5) {
      float maskKernel = exp(-distToSegmentSq(vUv, uPrevMouse, uMouse, uAspect) / max(uRadius * 1.65, 1e-5));
      density = clamp(density + maskKernel * uMaskStrength, 0.0, 1.0);
    }

    if (isnan(density) || isinf(density)) {
      density = 0.0;
    }

    fragColor = vec4(density, 0.0, 0.0, 1.0);
  }
}
