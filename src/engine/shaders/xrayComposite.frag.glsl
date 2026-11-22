precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uMaskTex;
uniform sampler2D uVelocityTex;
uniform vec2 uResolution;
uniform vec2 uMaskTexelSize;
uniform float uTime;
uniform float uDarkMode;
uniform float uScrollVel;
uniform float uScrollY;
uniform float uReducedMotion;
uniform vec4 uQuadRects[4];

// Anti-aliased line helper from distance field
float aaLine(float d, float widthPx, float scale) {
  float w = widthPx / max(scale, 1.0);
  return 1.0 - smoothstep(0.0, w, abs(d));
}

// Crisp grid line helper using screen-space pixel scale
float gridLine(vec2 p, float spacing, float thicknessPx) {
  vec2 cell = abs(fract(p / spacing - 0.5) - 0.5) * spacing;
  float d = min(cell.x, cell.y);
  return 1.0 - smoothstep(thicknessPx * 0.35, thicknessPx * 1.15, d);
}

// Registration crosshair (+) at lattice intersections
float crosshairs(vec2 p, float spacing, float armLen, float thickness) {
  vec2 g = fract(p / spacing + 0.5) - 0.5;
  vec2 px = abs(g) * spacing;
  float hArm = (1.0 - smoothstep(thickness * 0.4, thickness, px.y)) * step(px.x, armLen);
  float vArm = (1.0 - smoothstep(thickness * 0.4, thickness, px.x)) * step(px.y, armLen);
  return max(hArm, vArm);
}

// Procedural engineering CAD blueprint layer (drafting slate + cobalt/cyan topology)
vec3 renderBlueprintLayer(vec2 screenPx, vec2 uv, vec2 vel) {
  // Deep drafting slate base (#0A1322) with subtle radial tone shift
  vec2 centered = uv - 0.5;
  float vignette = 1.0 - dot(centered, centered) * 0.48;
  vec3 slateBase = vec3(0.039, 0.075, 0.133) * (0.86 + 0.24 * vignette);

  // Subtle architectural velocity parallax in schematic coordinates
  vec2 flowOffset = vel * 0.55;
  vec2 p = screenPx + vec2(0.0, uScrollY * 0.25) + flowOffset;

  vec3 cobaltDim = vec3(0.059, 0.298, 0.506);   // #0F4C81
  vec3 cobaltBright = vec3(0.114, 0.435, 0.886); // #1D6FE2
  vec3 cyanAccent = vec3(0.302, 0.659, 1.0);     // #4DA8FF

  // 1. Sub-grid (20px) + Major structural grid (100px)
  float subGrid = gridLine(p, 20.0, 0.85);
  float majorGrid = gridLine(p, 100.0, 1.25);

  vec3 col = slateBase;
  col = mix(col, cobaltDim * 0.72, subGrid * 0.26);
  col = mix(col, cobaltBright * 0.85, majorGrid * 0.36);

  // 2. Layered isometric wireframe topology (30 deg / 150 deg axis planes)
  vec2 isoP = p * 0.0115;
  float isoA = abs(fract(isoP.x * 0.8660254 + isoP.y * 0.5) - 0.5);
  float isoB = abs(fract(-isoP.x * 0.8660254 + isoP.y * 0.5) - 0.5);
  float isoC = abs(fract(isoP.y) - 0.5);
  float isoLine = max(
    1.0 - smoothstep(0.008, 0.022, min(isoA, isoB)),
    (1.0 - smoothstep(0.008, 0.022, isoC)) * 0.65
  );
  // Modulate isometric field into terraced architectural blocks
  vec2 macroCell = floor(p / 200.0);
  float blockMask = step(0.32, fract(sin(dot(macroCell, vec2(127.1, 311.7))) * 43758.5453));
  col = mix(col, cobaltBright, isoLine * (0.14 + 0.22 * blockMask));

  // 3. Concentric radar tolerance rings & azimuth compass marks
  vec2 origin = vec2(uResolution.x * 0.5, uResolution.y * 0.52);
  vec2 rel = (screenPx - origin) + flowOffset * 1.4;
  float r = length(rel);
  float ringPeriod = abs(fract(r / 92.0) - 0.5) * 92.0;
  float rings = (1.0 - smoothstep(0.45, 1.25, ringPeriod)) * smoothstep(520.0, 80.0, r);
  float angle = atan(rel.y, rel.x);
  float azimuth = 1.0 - smoothstep(0.004, 0.014, abs(fract(angle / 0.5235987) - 0.5));
  float azimuthBand = smoothstep(340.0, 120.0, r) * smoothstep(55.0, 90.0, r);
  col = mix(col, cyanAccent, rings * 0.34);
  col = mix(col, cobaltBright, azimuth * azimuthBand * 0.28);

  // 4. Orthogonal routing spline traces & node intersections
  vec2 traceCoord = p / 50.0;
  vec2 cellId = floor(traceCoord);
  vec2 cellLocal = fract(traceCoord) - 0.5;
  float cellHash = fract(sin(dot(cellId, vec2(41.3, 289.1))) * 19583.41);
  float routingLine = 0.0;
  if (cellHash > 0.68) {
    routingLine = 1.0 - smoothstep(0.015, 0.042, abs(cellLocal.x - cellLocal.y));
  } else if (cellHash < 0.22) {
    routingLine = 1.0 - smoothstep(0.015, 0.042, abs(cellLocal.x + cellLocal.y));
  }
  float nodeDot = 1.0 - smoothstep(0.045, 0.085, length(cellLocal));
  col = mix(col, cyanAccent * 0.9, routingLine * 0.28);
  col = mix(col, cyanAccent, nodeDot * step(0.75, cellHash) * 0.55);

  // 5. CAD dimension crosshairs at major intersections
  float ticks = crosshairs(p, 100.0, 6.5, 1.15);
  col = mix(col, cyanAccent, ticks * 0.62);

  // Subtle flow-energy illumination on high-speed eddies
  float speedGlow = clamp(length(vel) * 0.045, 0.0, 0.28);
  col += cyanAccent * speedGlow * 0.22;

  return col;
}

// Bespoke procedural architectural schematics rendered inside DOM-synced [data-fluid-quad] containers
vec3 renderShowcaseSchematic(int idx, vec2 localUv, vec2 vel, float wake, float darkMode) {
  // Fluid-warped local UVs + scroll inertia shear
  vec2 shear = vec2(vel.x * 0.0055, vel.y * 0.0055 + uScrollVel * 0.008);
  vec2 uv = localUv + shear * (0.45 + 0.55 * sin(localUv.y * 3.14159));
  vec2 c = uv - 0.5;

  // Base surface inside card schematic aperture
  vec3 restBg = mix(vec3(0.953, 0.949, 0.929), vec3(0.062, 0.086, 0.129), darkMode);
  vec3 restStroke = mix(vec3(0.09, 0.12, 0.17), vec3(0.76, 0.84, 0.94), darkMode);
  vec3 restSubtle = mix(vec3(0.09, 0.12, 0.17), vec3(0.55, 0.65, 0.80), darkMode);

  vec3 wakeBg = vec3(0.043, 0.082, 0.149);
  vec3 wakeStroke = vec3(0.302, 0.659, 1.0);
  vec3 wakeSubtle = vec3(0.114, 0.435, 0.886);

  float wakeMix = smoothstep(0.08, 0.42, wake);
  vec3 bg = mix(restBg, wakeBg, wakeMix);
  vec3 stroke = mix(restStroke, wakeStroke, wakeMix);
  vec3 subtle = mix(restSubtle, wakeSubtle, wakeMix);

  // Fine drafting coordinate background inside the quad
  float fineGrid = max(
    1.0 - smoothstep(0.006, 0.016, abs(fract(uv.x * 12.0) - 0.5)),
    1.0 - smoothstep(0.006, 0.016, abs(fract(uv.y * 8.0) - 0.5))
  );
  vec3 col = mix(bg, subtle, fineGrid * (0.09 + 0.14 * wakeMix));

  float lineMask = 0.0;
  float accentMask = 0.0;

  if (idx == 0) {
    // 01: Isogrid Cantilever Truss Elevation
    vec2 p = c * vec2(1.4, 1.0);
    float trussA = 1.0 - smoothstep(0.005, 0.013, abs(fract((p.x + p.y * 1.15) * 6.0) - 0.5));
    float trussB = 1.0 - smoothstep(0.005, 0.013, abs(fract((p.x - p.y * 1.15) * 6.0) - 0.5));
    float envelope = smoothstep(0.36, 0.34, abs(p.y) + abs(p.x) * 0.24);
    float chordTop = 1.0 - smoothstep(0.003, 0.009, abs(abs(p.y) - (0.33 - abs(p.x) * 0.22)));
    float spine = 1.0 - smoothstep(0.0025, 0.008, abs(p.y));
    lineMask = max(max(trussA, trussB) * envelope * 0.65, max(chordTop * step(abs(p.x), 0.62), spine * step(abs(p.x), 0.62)));
    accentMask = 1.0 - smoothstep(0.016, 0.028, length(p - vec2(0.0, 0.0)));
  } else if (idx == 1) {
    // 02: Concentric Aerodynamic Diffuser & Streamlines
    float r = length(c * vec2(1.35, 1.0));
    float rings = (1.0 - smoothstep(0.005, 0.013, abs(fract(r * 7.0) - 0.5))) * smoothstep(0.48, 0.44, r);
    float theta = atan(c.y, c.x * 1.35);
    float vanes = (1.0 - smoothstep(0.012, 0.032, abs(fract((theta + r * 1.1) / 0.5236) - 0.5))) * smoothstep(0.46, 0.43, r) * smoothstep(0.08, 0.11, r);
    float cross = max(
      1.0 - smoothstep(0.002, 0.007, abs(c.x)),
      1.0 - smoothstep(0.002, 0.007, abs(c.y))
    ) * smoothstep(0.49, 0.45, r);
    lineMask = max(max(rings, vanes * 0.72), cross * 0.45);
    accentMask = 1.0 - smoothstep(0.06, 0.072, abs(r - 0.28));
  } else if (idx == 2) {
    // 03: Orthogonal Telemetry Busbar & Section Grid
    vec2 p = c * vec2(1.5, 1.0);
    float wave1 = 1.0 - smoothstep(0.004, 0.011, abs(p.y - 0.18 * sin(p.x * 5.2 + uTime * 0.45 + vel.x * 0.25)));
    float wave2 = 1.0 - smoothstep(0.004, 0.011, abs(p.y - 0.11 * cos(p.x * 7.8 - uTime * 0.35 + vel.y * 0.25)));
    float wave3 = 1.0 - smoothstep(0.003, 0.009, abs(p.y + 0.14 * sin(p.x * 3.8 + 1.2)));
    float bars = (1.0 - smoothstep(0.005, 0.014, abs(fract(p.x * 8.0) - 0.5))) * smoothstep(0.32, 0.28, abs(p.y));
    lineMask = max(max(wave1, wave2 * 0.78), max(wave3 * 0.65, bars * 0.32));
    accentMask = wave1 * 0.8;
  } else {
    // 04: Geodesic Pressure Containment Dome (Plan & Section)
    vec2 p = c * vec2(1.3, 1.0);
    float r = length(p);
    float outer = 1.0 - smoothstep(0.003, 0.010, abs(r - 0.38));
    float inner = 1.0 - smoothstep(0.003, 0.010, abs(r - 0.22));
    float hexA = 1.0 - smoothstep(0.006, 0.015, abs(fract(p.x * 7.5 + p.y * 4.33) - 0.5));
    float hexB = 1.0 - smoothstep(0.006, 0.015, abs(fract(-p.x * 7.5 + p.y * 4.33) - 0.5));
    float hexC = 1.0 - smoothstep(0.006, 0.015, abs(fract(p.y * 8.66) - 0.5));
    float lattice = max(max(hexA, hexB), hexC) * smoothstep(0.38, 0.36, r);
    lineMask = max(max(outer, inner), lattice * 0.58);
    accentMask = outer;
  }

  col = mix(col, stroke, lineMask * (0.48 + 0.38 * wakeMix));
  col = mix(col, wakeStroke, accentMask * (0.28 + 0.48 * wakeMix));

  // Precision hairline border around synced quad aperture
  float edgeDist = min(min(localUv.x, 1.0 - localUv.x), min(localUv.y, 1.0 - localUv.y));
  float border = 1.0 - smoothstep(0.002, 0.006, edgeDist);
  col = mix(col, stroke, border * 0.25);

  return col;
}

void main() {
  vec2 screenPx = vUv * uResolution;
  vec2 vel = texture(uVelocityTex, vUv).xy;
  if (any(isnan(vel)) || any(isinf(vel))) {
    vel = vec2(0.0);
  }

  // Sample advected X-Ray mask with 5-tap smoothing for a silky liquid-meniscus boundary
  float mC = texture(uMaskTex, vUv).x;
  float mL = texture(uMaskTex, vUv - vec2(uMaskTexelSize.x * 1.5, 0.0)).x;
  float mR = texture(uMaskTex, vUv + vec2(uMaskTexelSize.x * 1.5, 0.0)).x;
  float mT = texture(uMaskTex, vUv + vec2(0.0, uMaskTexelSize.y * 1.5)).x;
  float mB = texture(uMaskTex, vUv - vec2(0.0, uMaskTexelSize.y * 1.5)).x;
  float maskVal = mC * 0.48 + (mL + mR + mT + mB) * 0.13;
  vec2 maskGrad = vec2(mR - mL, mT - mB);

  // Reduced-motion mode: render a calm, static architectural inspection aperture in the hero zone
  if (uReducedMotion > 0.5) {
    vec2 apertureCenter = vec2(0.5, 0.42);
    vec2 delta = (vUv - apertureCenter) * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
    float d = length(delta);
    float staticMask = 1.0 - smoothstep(0.16, 0.24, d);
    maskVal = max(maskVal, staticMask * 0.85);
    vec2 radialGrad = normalize(delta + vec2(1e-5)) * (smoothstep(0.26, 0.19, d) * smoothstep(0.13, 0.19, d)) * 0.35;
    maskGrad += radialGrad;
  }

  // 1. Calm Surface Reality (Alabaster #F6F5F1 or Obsidian #0B0F17)
  vec3 alabaster = vec3(0.9647, 0.9608, 0.9451);
  vec3 obsidian = vec3(0.0431, 0.0588, 0.0902);
  vec3 surfaceBase = mix(alabaster, obsidian, uDarkMode);

  vec2 surfP = screenPx + vec2(0.0, uScrollY);
  float surfSub = gridLine(surfP, 32.0, 0.85);
  float surfMajor = gridLine(surfP, 128.0, 1.15);
  float surfTicks = crosshairs(surfP, 128.0, 5.0, 1.0);

  vec3 inkLine = mix(vec3(0.059, 0.078, 0.110), vec3(0.85, 0.90, 0.97), uDarkMode);
  vec3 surfaceCol = surfaceBase;
  surfaceCol = mix(surfaceCol, inkLine, surfSub * mix(0.036, 0.042, uDarkMode));
  surfaceCol = mix(surfaceCol, inkLine, surfMajor * mix(0.068, 0.085, uDarkMode));
  surfaceCol = mix(surfaceCol, inkLine, surfTicks * mix(0.16, 0.22, uDarkMode));

  // 2. Underlying Blueprint Reality with subtle refractive meniscus displacement
  vec2 refractPx = screenPx - maskGrad * 18.0;
  vec3 blueprintCol = renderBlueprintLayer(refractPx, vUv - maskGrad * 0.014, vel);

  // Smooth X-Ray transition threshold around mask > 0.08
  float reveal = smoothstep(0.08, 0.28, maskVal);
  vec3 finalCol = mix(surfaceCol, blueprintCol, reveal);

  // 3. Razor-thin specular liquid-meniscus rim strictly along the wake boundary
  float gradMag = length(maskGrad);
  float boundaryBand = smoothstep(0.05, 0.14, maskVal) * (1.0 - smoothstep(0.19, 0.36, maskVal));
  float rimStrength = clamp(gradMag * 5.2, 0.0, 1.0) * boundaryBand;
  vec3 meniscusColor = mix(vec3(0.114, 0.435, 0.886), vec3(0.42, 0.76, 1.0), clamp(gradMag * 3.5, 0.0, 1.0));
  finalCol = mix(finalCol, meniscusColor, rimStrength * 0.78);

  // Subtle inner rim catchlight
  float specularCatch = pow(clamp(dot(normalize(maskGrad + vec2(1e-5)), normalize(vec2(-0.6, 0.8))) * 0.5 + 0.5, 0.0, 1.0), 3.0);
  finalCol += vec3(0.55, 0.82, 1.0) * rimStrength * specularCatch * 0.28;

  // 4. Composite DOM-Synced Fluid-Warped Showcase Quads ([data-fluid-quad])
  for (int i = 0; i < 4; i++) {
    vec4 q = uQuadRects[i];
    if (q.z > 0.001 && q.w > 0.001) {
      vec2 localUv = (vUv - q.xy) / q.zw;
      if (localUv.x >= 0.0 && localUv.x <= 1.0 && localUv.y >= 0.0 && localUv.y <= 1.0) {
        vec3 quadCol = renderShowcaseSchematic(i, localUv, vel, maskVal, uDarkMode);
        // Preserve meniscus edge highlight sweeping cleanly over the quad too
        quadCol = mix(quadCol, meniscusColor, rimStrength * 0.55);
        finalCol = quadCol;
      }
    }
  }

  fragColor = vec4(finalCol, 1.0);
}
