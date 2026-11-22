in vec2 aGridUv;

out float vWake;
out float vSpeed;
out vec2 vLocalUv;

uniform sampler2D uVelocityTex;
uniform sampler2D uMaskTex;
uniform vec2 uResolution;
uniform float uReducedMotion;

void main() {
  vLocalUv = uv;

  vec2 vel = texture(uVelocityTex, aGridUv).xy;
  if (any(isnan(vel)) || any(isinf(vel))) {
    vel = vec2(0.0);
  }

  float maskVal = texture(uMaskTex, aGridUv).x;
  if (isnan(maskVal) || isinf(maskVal)) {
    maskVal = 0.0;
  }

  float speed = length(vel);
  float angle = 0.0;

  if (uReducedMotion > 0.5) {
    // Static calm alignment in reduced-motion mode
    vec2 centerDelta = aGridUv - vec2(0.5, 0.62);
    float d = length(centerDelta * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0));
    float staticWake = 1.0 - smoothstep(0.16, 0.24, d);
    maskVal = max(maskVal, staticWake * 0.85);
    angle = atan(centerDelta.y, centerDelta.x) + 1.5707963;
    speed = staticWake * 2.4;
  } else if (speed > 0.02) {
    angle = atan(vel.y, vel.x);
  }

  // Calm tiny tick at rest; sharp directional vector streak inside live fluid wakes
  float stretch = clamp(speed * 0.45, 0.0, 2.2);
  float needleLenPx = mix(2.6, 17.5, clamp(stretch / 2.2, 0.0, 1.0));
  float needleThickPx = mix(0.85, 1.35, clamp(stretch / 2.2, 0.0, 1.0));

  // Local plane vertex in screen pixels, rotated strictly along flow angle
  vec2 localPx = vec2(position.x * needleLenPx, position.y * (needleThickPx / 0.14));
  float c = cos(angle);
  float s = sin(angle);
  vec2 rotPx = vec2(localPx.x * c - localPx.y * s, localPx.x * s + localPx.y * c);

  // Convert pixel offset to NDC and place at aGridUv
  vec2 centerNdc = aGridUv * 2.0 - 1.0;
  vec2 offsetNdc = (rotPx / max(uResolution, vec2(1.0))) * 2.0;

  vWake = maskVal;
  vSpeed = stretch;

  gl_Position = vec4(centerNdc + offsetNdc, 0.0, 1.0);
}
