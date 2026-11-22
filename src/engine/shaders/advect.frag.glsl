precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexelSize;
uniform float uDt;
uniform float uDissipation;
uniform float uAdvectScale;
uniform float uClampScalar; // 1.0 for mask scalar clamp [0,1], 0.0 for velocity clamp

void main() {
  vec2 vel = texture(uVelocity, vUv).xy;
  if (any(isnan(vel)) || any(isinf(vel))) {
    vel = vec2(0.0);
  }

  vec2 coord = vUv - uDt * vel * uTexelSize * uAdvectScale;
  coord = clamp(coord, vec2(0.001), vec2(0.999));

  vec4 result = texture(uSource, coord);
  float decay = pow(clamp(uDissipation, 0.5, 0.9995), max(uDt * 60.0, 0.01));
  result *= decay;

  if (any(isnan(result)) || any(isinf(result))) {
    result = vec4(0.0, 0.0, 0.0, 1.0);
  }

  if (uClampScalar > 0.5) {
    float scalar = clamp(result.x, 0.0, 1.0);
    if (scalar < 0.0025) scalar = 0.0;
    fragColor = vec4(scalar, 0.0, 0.0, 1.0);
  } else {
    vec2 outVel = result.xy;
    float mag = length(outVel);
    if (mag > 40.0) {
      outVel *= 40.0 / mag;
    }
    if (mag < 0.0008) {
      outVel = vec2(0.0);
    }
    fragColor = vec4(outVel, 0.0, 1.0);
  }
}
