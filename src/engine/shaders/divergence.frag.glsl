precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uVelocity;
uniform vec2 uTexelSize;

void main() {
  vec2 C = texture(uVelocity, vUv).xy;
  float L = texture(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).x;
  float R = texture(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).x;
  float T = texture(uVelocity, vUv + vec2(0.0, uTexelSize.y)).y;
  float B = texture(uVelocity, vUv - vec2(0.0, uTexelSize.y)).y;

  // Solid boundary conditions along viewport edges
  if (vUv.x - uTexelSize.x < 0.0) L = -C.x;
  if (vUv.x + uTexelSize.x > 1.0) R = -C.x;
  if (vUv.y + uTexelSize.y > 1.0) T = -C.y;
  if (vUv.y - uTexelSize.y < 0.0) B = -C.y;

  float div = 0.5 * ((R - L) + (T - B));
  if (isnan(div) || isinf(div)) {
    div = 0.0;
  }

  fragColor = vec4(div, 0.0, 0.0, 1.0);
}
