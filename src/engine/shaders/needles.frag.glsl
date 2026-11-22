precision highp float;

in float vWake;
in float vSpeed;
in vec2 vLocalUv;

out vec4 fragColor;

uniform float uDarkMode;
uniform float uOpacity;

void main() {
  // Subtle directional taper toward leading tip of the needle
  float along = vLocalUv.x;
  float across = abs(vLocalUv.y - 0.5) * 2.0;
  float taper = mix(0.75, 1.0, smoothstep(0.0, 0.85, along));
  float edgeAlpha = 1.0 - smoothstep(0.45 * taper, 1.0 * taper, across);
  if (edgeAlpha <= 0.01) {
    discard;
  }

  // Architectural graphite at rest -> luminous blueprint cyan (#4DA8FF) inside active wakes
  vec3 restColor = mix(vec3(0.09, 0.12, 0.17), vec3(0.72, 0.79, 0.88), uDarkMode);
  vec3 wakeColor = vec3(0.302, 0.659, 1.0); // #4DA8FF
  vec3 tipHighlight = vec3(0.72, 0.90, 1.0);

  float wakeFactor = clamp(smoothstep(0.06, 0.30, vWake) + clamp(vSpeed * 0.35, 0.0, 0.75), 0.0, 1.0);
  vec3 color = mix(restColor, wakeColor, wakeFactor);
  color = mix(color, tipHighlight, smoothstep(0.65, 1.0, along) * wakeFactor * 0.55);

  float baseAlpha = mix(0.18, 0.24, uDarkMode);
  float activeAlpha = mix(baseAlpha, 0.92, wakeFactor);

  fragColor = vec4(color, activeAlpha * edgeAlpha * uOpacity);
}
