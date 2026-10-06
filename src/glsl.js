// GLSL chunks shared by the sky dome and the ocean, so the water reflects
// exactly the sky you see and the fog melts into the same horizon.

export const noiseGLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = r * p * 2.03 + 17.1;
    a *= 0.5;
  }
  return v;
}

// Worley: returns (F1, F2) distances. Cell edges (F2 - F1 ~ 0) give the
// lacy, bubbly foam pattern.
vec2 worley(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float f1 = 8.0, f2 = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash22(n + g);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  return sqrt(vec2(f1, f2));
}
`;

export const skyUniformsGLSL = /* glsl */ `
uniform vec3 uSunDir;      // true sun direction (may be below horizon)
uniform vec3 uLightDir;    // dominant light: sun by day, moon by night
uniform vec3 uLightColor;
uniform vec3 uSunColor;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uHaze;        // warm glow toward the sun near the horizon
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uNight;      // 0 = day, 1 = full night
uniform float uCloudCover;
uniform float uTime;       // seconds, wrapped (for slow-moving detail)
`;

export const skyGLSL = /* glsl */ `
// Sky gradient without discs/clouds. Below the horizon it clamps to the
// horizon colour so the far ocean fog and the sky meet seamlessly.
vec3 skyGradient(vec3 dir) {
  float y = max(dir.y, 0.0);
  float horizonBlend = pow(1.0 - y, 5.0);
  vec3 col = mix(uZenith, uHorizon, horizonBlend);

  float sunAmt = max(dot(normalize(vec3(dir.x, y, dir.z)), uSunDir), 0.0);
  // broad, low haze around the sun
  col += uHaze * pow(sunAmt, 3.0) * horizonBlend;
  // tighter glow
  col += uSunColor * pow(sunAmt, 24.0) * 0.45 * (1.0 - uNight);
  return col;
}

float cloudDensity(vec2 uv) {
  float n = fbm(uv);
  n += 0.25 * fbm(uv * 3.1 + 4.0) - 0.12;
  return n;
}

// Full sky: gradient + sun + moon + stars + painterly clouds.
vec3 skyColor(vec3 dir, bool withDiscs) {
  vec3 col = skyGradient(dir);

  if (withDiscs) {
    // Sun disc with soft cartoony rim.
    float sd = dot(dir, uSunDir);
    float sunDisc = smoothstep(0.99935, 0.9996, sd);
    col += uSunColor * sunDisc * 12.0 * smoothstep(-0.03, 0.02, uSunDir.y);

    // Moon opposite the sun.
    vec3 moonDir = -uSunDir;
    float md = dot(dir, moonDir);
    float moon = smoothstep(0.99955, 0.9997, md);
    float moonGlow = pow(max(md, 0.0), 300.0);
    col += vec3(0.9, 0.95, 1.1) * (moon * 3.0 + moonGlow * 0.25) * uNight;

    // Stars, twinkling, fading out toward the horizon.
    if (uNight > 0.01 && dir.y > 0.0) {
      vec3 sp = dir * 260.0;
      vec3 id = floor(sp);
      float h = hash13(id);
      if (h > 0.9965) {
        vec3 c = fract(sp) - 0.5;
        float s = smoothstep(0.22, 0.0, length(c));
        float tw = 0.6 + 0.4 * sin(uTime * (2.0 + h * 9.0) + h * 80.0);
        col += vec3(1.0, 0.95, 0.85) * s * tw * uNight * smoothstep(0.0, 0.25, dir.y) * 2.0;
      }
    }
  }

  // Clouds on a virtual plane above the sea.
  if (dir.y > 0.0) {
    vec2 uv = dir.xz / (dir.y + 0.08) * 0.55;
    uv += vec2(uTime * 0.0035, uTime * 0.0012);
    float d = cloudDensity(uv);
    float cover = mix(0.72, 0.38, uCloudCover);
    float a = smoothstep(cover, cover + 0.09, d);
    // Self-shadow: compare density a step toward the sun.
    vec2 toSun = normalize(uSunDir.xz + 1e-4) * 0.06;
    float d2 = cloudDensity(uv + toSun);
    float lit = clamp(0.55 + (d - d2) * 5.0, 0.0, 1.0);
    lit = smoothstep(0.2, 0.8, lit); // banded, cel-ish
    vec3 cc = mix(uCloudShade, uCloudLit, lit);
    // Silver lining when looking toward the sun.
    float rim = pow(max(dot(dir, uSunDir), 0.0), 10.0) * (1.0 - a) * 4.0;
    cc += uSunColor * rim * smoothstep(cover - 0.05, cover + 0.05, d) * (1.0 - uNight);
    float fade = smoothstep(0.0, 0.18, dir.y);
    col = mix(col, cc, a * fade * 0.95);
  }
  return col;
}
`;
