precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexelSize;
uniform float uDecayOnly;
uniform float uDecay;

void main() {
  if (uDecayOnly > 0.5) {
    float p = texture(uPressure, vUv).x * uDecay;
    if (isnan(p) || isinf(p)) p = 0.0;
    fragColor = vec4(p, 0.0, 0.0, 1.0);
    return;
  }

  float L = texture(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x;
  float R = texture(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x;
  float T = texture(uPressure, vUv + vec2(0.0, uTexelSize.y)).x;
  float B = texture(uPressure, vUv - vec2(0.0, uTexelSize.y)).x;
  float divergence = texture(uDivergence, vUv).x;

  float pressure = (L + R + B + T - divergence) * 0.25;
  if (isnan(pressure) || isinf(pressure)) {
    pressure = 0.0;
  }

  fragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
