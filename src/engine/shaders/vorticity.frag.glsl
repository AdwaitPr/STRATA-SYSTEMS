precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexelSize;
uniform float uCurlStrength;
uniform float uDt;

void main() {
  float L = texture(uCurl, vUv - vec2(uTexelSize.x, 0.0)).x;
  float R = texture(uCurl, vUv + vec2(uTexelSize.x, 0.0)).x;
  float T = texture(uCurl, vUv + vec2(0.0, uTexelSize.y)).x;
  float B = texture(uCurl, vUv - vec2(0.0, uTexelSize.y)).x;
  float C = texture(uCurl, vUv).x;

  // Gradient of |omega|
  vec2 grad = 0.5 * vec2(abs(R) - abs(L), abs(T) - abs(B));
  vec2 N = grad / (length(grad) + 1e-4);

  // Fedkiw 2D vorticity confinement: f = eps * (N x omega) with smooth coherence cap
  float smoothCurl = clamp(C, -14.0, 14.0);
  vec2 force = vec2(N.y * smoothCurl, -N.x * smoothCurl) * (uCurlStrength * 0.42);

  vec2 vel = texture(uVelocity, vUv).xy + force * uDt;

  if (any(isnan(vel)) || any(isinf(vel))) {
    vel = vec2(0.0);
  }

  float mag = length(vel);
  if (mag > 40.0) {
    vel *= 40.0 / mag;
  }

  fragColor = vec4(vel, 0.0, 1.0);
}
