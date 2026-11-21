/**
 * TslPatternLibrary.ts
 *
 * Shared composable WebGPU/TSL procedural pattern & 4-stop bioluminescent
 * chromatic ramp library used across Bell, Inner Skirt, Oral Arms, Gastric Core,
 * and Tentacle shaders.
 *
 * Supports 8 genuinely distinct procedural patterns evaluated analytically in WGSL:
 *   0 — Biolume Waves         (7-layer oscillating sine interference bioluminescence)
 *   1 — Hex Voronoi           (analytical hexagonal honeycomb crystal facets, Ref 1)
 *   2 — Turing Labyrinth      (domain-warped reaction-diffusion maze stripes, Ref 2)
 *   3 — Leaf Veins & Pearls   (branching botanical veins + glowing starlight nodes, Ref 3 & 4)
 *   4 — Cosmic Starfield      (view-dependent twinkling micro-glitter volume, Ref 5)
 *   5 — Chromatophore Clouds  (animated stippled opal pigment clouds, Ref 6)
 *   6 — Exumbrella Spots      (crisp staggered organic lagoon polka-dots, Ref 7)
 *   7 — Radial Glass Flutes   (crisp sculpted longitudinal ribs + comb pulse, Ref 7)
 */

import {
  Fn,
  float,
  vec2,
  vec3,
  sin,
  cos,
  abs,
  floor,
  fract,
  dot,
  length,
  min,
  max,
  clamp,
  pow,
  mix,
  smoothstep,
} from 'three/tsl';

/** Smooth discrete selector weight (1.0 when val == idx, 0.0 for |val - idx| >= 1) */
export const selectWeight: any = Fn(([val, idx]: [any, any]) => {
  return clamp(float(1.0).sub(abs(val.sub(idx))), float(0.0), float(1.0));
});

/** Deterministic 2D hash -> [0, 1] */
export const hash21: any = Fn(([p]: [any]) => {
  const p2: any = fract(p.mul(vec2(123.34, 456.21)));
  const d: any = dot(p2, p2.add(45.32));
  return fract(p2.x.add(d).mul(p2.y.add(d)));
});

/** Smooth 2D value noise -> [0, 1] */
export const valueNoise2D: any = Fn(([p]: [any]) => {
  const i: any = floor(p);
  const f: any = fract(p);
  const u: any = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));

  const a: any = hash21(i);
  const b: any = hash21(i.add(vec2(1.0, 0.0)));
  const c: any = hash21(i.add(vec2(0.0, 1.0)));
  const d: any = hash21(i.add(vec2(1.0, 1.0)));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
});

/** 3-octave FBM noise -> [0, 1] */
export const fbm2D: any = Fn(([p]: [any]) => {
  const n0: any = valueNoise2D(p).mul(0.54);
  const n1: any = valueNoise2D(p.mul(2.07).add(vec2(13.1, 7.7))).mul(0.30);
  const n2: any = valueNoise2D(p.mul(4.13).add(vec2(29.3, 19.4))).mul(0.16);
  return n0.add(n1).add(n2);
});

/** Analytical Hexagonal Grid distance to nearest cell edge -> sharp honeycomb ridge [0, 1] */
export const hexLatticeRidge: any = Fn(([uvScaled]: [any]) => {
  const r: any = vec2(1.0, 1.7320508);
  const h: any = r.mul(0.5);
  const a: any = uvScaled.mod(r).sub(h);
  const b: any = uvScaled.sub(h).mod(r).sub(h);
  const da: any = dot(a, a);
  const db: any = dot(b, b);
  const gv: any = mix(a, b, smoothstep(float(-0.0001), float(0.0001), da.sub(db)));
  const ap: any = abs(gv);
  const edgeDist: any = float(0.5).sub(max(dot(ap, normalizeVec2(r)), ap.x));
  return float(1.0).sub(smoothstep(float(0.025), float(0.135), edgeDist));
});

/** Constant helper for normalized vec2(1, sqrt(3)) = (0.5, 0.8660254) */
function normalizeVec2(_v: any): any {
  return vec2(0.5, 0.8660254);
}

/**
 * Pattern 0: Classic 7-layer oscillating sine-wave bioluminescence
 */
// @ts-ignore - TSL Fn destructuring
export const evalBiolumeWaves = Fn(([uvCoord, timeVal, scaleVal]) => {
  const sc = float(10.5).add(sin(timeVal.mul(0.35)).mul(3.5)).mul(scaleVal);
  const u = uvCoord.x;
  const v = uvCoord.y;

  let sat: any = float(1.8);
  sat = sat.sub(sin(u.mul(38.0)).mul(0.22).add(sin(u.mul(30.0).mul(sc.mul(0.1))).mul(0.24)).add(0.65));
  sat = sat.sub(sin(v.mul(sin(u.mul(5.0)).mul(sc.mul(0.45)))).mul(0.12));
  sat = sat.sub(sin(v.mul(v.add(cos(u.mul(6.283)).mul(1.8)).mul(2.8).mul(scaleVal))).mul(0.18));
  sat = sat.sub(sin(v.sub(0.5).mul(v.add(cos(u.mul(6.283).add(timeVal.mul(0.25))).mul(1.5)).mul(3.4).mul(scaleVal))).mul(0.16));
  sat = sat.sub(sin(v.mul(5.0).sub(timeVal.mul(0.8))).mul(0.22));
  return smoothstep(float(-0.35), float(0.95), sat);
});

/**
 * Pattern 1: Hexagonal Voronoi Crystal Lattice (Ref 1 — Prismatic Voronoi Crown)
 * Strong crisp hexagonal facets across the upper crown that softly dissolve near rim.
 */
// @ts-ignore - TSL Fn destructuring
export const evalHexVoronoi = Fn(([uvCoord, timeVal, scaleVal]) => {
  const p = vec2(uvCoord.x.mul(14.0), uvCoord.y.mul(9.5)).mul(scaleVal);
  const warp = vec2(
    sin(uvCoord.y.mul(6.0).add(timeVal.mul(0.5))).mul(0.12),
    cos(uvCoord.x.mul(12.566).sub(timeVal.mul(0.35))).mul(0.08),
  );
  // @ts-ignore
  const ridge = hexLatticeRidge(p.add(warp));
  // Concentrate honeycomb on crown/mid dome like Reference 1, gently fading toward ruffled hem
  const crownFade = float(1.0).sub(smoothstep(float(0.62), float(0.98), uvCoord.y)).mul(0.85).add(0.15);
  const shimmer = sin(uvCoord.x.mul(18.85).add(uvCoord.y.mul(12.0)).sub(timeVal.mul(1.8))).mul(0.2).add(0.85);
  return clamp(ridge.mul(crownFade).mul(shimmer), float(0.0), float(1.0));
});

/**
 * Pattern 2: Turing Reaction-Diffusion Labyrinth (Ref 2 — Biolume Labyrinth)
 * Crisp biological maze corridors flowing organically across curved surfaces.
 */
// @ts-ignore - TSL Fn destructuring
export const evalTuringMaze = Fn(([uvCoord, timeVal, scaleVal]) => {
  const p = vec2(uvCoord.x.mul(12.0), uvCoord.y.mul(10.0)).mul(scaleVal);
  // @ts-ignore
  const w1 = fbm2D(p.mul(0.55).add(vec2(timeVal.mul(0.08), timeVal.mul(-0.06))));
  // @ts-ignore
  const w2 = fbm2D(p.mul(0.75).add(vec2(w1.mul(2.4), w1.mul(-1.9)).add(vec2(4.2, 8.1))));
  // High-contrast labyrinth contour bands (sin of warped FBM)
  const bands = sin(w2.mul(19.5).add(w1.mul(6.2)).sub(timeVal.mul(0.65)));
  const mazeLine = smoothstep(float(0.15), float(0.68), abs(bands));
  const fineCrest = float(1.0).sub(mazeLine);
  return clamp(fineCrest.mul(1.15), float(0.0), float(1.0));
});

/**
 * Pattern 3: Botanical Leaf Veins & Starlight Pearl Nodes (Ref 3 & 4 — Lotus & Kelp)
 * Branching radial veins studded with luminous white pearl dots along veins and hem.
 */
// @ts-ignore - TSL Fn destructuring
export const evalLeafVeinsAndPearls = Fn(([uvCoord, timeVal, scaleVal]) => {
  const u = uvCoord.x;
  const v = uvCoord.y;
  // Primary radial veins + secondary forked sub-veins
  const primaryFreq = float(18.0).mul(scaleVal);
  const waveWarp = sin(v.mul(14.0).add(u.mul(12.566))).mul(0.28);
  const mainVein = pow(clamp(float(1.0).sub(abs(sin(u.mul(primaryFreq).add(waveWarp)))), float(0.0), float(1.0)), float(7.5));
  const forkVein = pow(clamp(float(1.0).sub(abs(sin(u.mul(primaryFreq.mul(2.0)).add(v.mul(9.0)).sub(waveWarp)))), float(0.0), float(1.0)), float(9.0)).mul(0.65);

  // Pearl dot lattice concentrated along veins & ruffled rim (Ref 4)
  const cellUV = vec2(u.mul(44.0), v.mul(28.0)).mul(scaleVal);
  const cellId = floor(cellUV);
  const cellLocal = fract(cellUV).sub(0.5);
  // @ts-ignore
  const jitter = vec2(hash21(cellId).sub(0.5).mul(0.45), hash21(cellId.add(vec2(17.3, 9.1))).sub(0.5).mul(0.45));
  const dotDist = length(cellLocal.sub(jitter));
  // @ts-ignore
  const dotAlive = stepGt(hash21(cellId.add(vec2(3.7, 11.9))), float(0.48));
  const rimBoost = smoothstep(float(0.35), float(0.95), v).mul(0.75).add(0.45);
  const twinkle = sin(timeVal.mul(2.4).add(cellId.x.mul(1.7)).add(cellId.y.mul(2.3))).mul(0.25).add(0.85);
  const pearls = float(1.0).sub(smoothstep(float(0.06), float(0.22), dotDist)).mul(dotAlive).mul(rimBoost).mul(twinkle);

  return clamp(mainVein.add(forkVein).mul(0.72).add(pearls.mul(1.25)), float(0.0), float(1.5));
});

/** Helper: smooth step(edge, x) approximation */
function stepGt(x: any, edge: any) {
  return smoothstep(edge.sub(0.02), edge.add(0.02), x);
}

/**
 * Pattern 4: Cosmic Micro-Glitter Starfield (Ref 5 — Celestial Orchid)
 * View-dependent twinkling diamond micro-sparkles suspended inside translucent crystal.
 */
export const evalCosmicStarfield: any = Fn(([uvCoord, viewDir, timeVal, scaleVal]: [any, any, any, any]) => {
  const g1: any = vec2(uvCoord.x.mul(72.0), uvCoord.y.mul(48.0)).mul(scaleVal);
  const id1: any = floor(g1);
  const f1: any = fract(g1).sub(0.5);
  const h1: any = hash21(id1);
  const h2: any = hash21(id1.add(vec2(41.2, 17.8)));
  const d1: any = length(f1.sub(vec2(h1.sub(0.5).mul(0.55), h2.sub(0.5).mul(0.55))));
  const star1: any = float(1.0).sub(smoothstep(float(0.03), float(0.16), d1));
  const viewPhase: any = dot(viewDir, vec3(h1.mul(6.0).sub(3.0), h2.mul(6.0).sub(3.0), float(2.5)));
  const glint1: any = pow(clamp(sin(viewPhase.add(timeVal.mul(2.2)).add(h1.mul(25.0))).mul(0.5).add(0.5), float(0.0), float(1.0)), float(4.5));

  // Second finer star dust octave
  const g2: any = vec2(uvCoord.x.mul(130.0), uvCoord.y.mul(86.0)).mul(scaleVal);
  const id2: any = floor(g2);
  const f2: any = fract(g2).sub(0.5);
  const h3: any = hash21(id2.add(vec2(7.1, 31.4)));
  const star2: any = float(1.0).sub(smoothstep(float(0.02), float(0.14), length(f2))).mul(stepGt(h3, float(0.62)));
  const glint2: any = sin(timeVal.mul(3.4).add(h3.mul(40.0))).mul(0.35).add(0.75);

  return clamp(star1.mul(glint1).mul(1.85).add(star2.mul(glint2).mul(0.95)), float(0.0), float(1.8));
});

/**
 * Pattern 5: Living Chromatophore Pigment Clouds (Ref 6 — Opal Mantle)
 * Organic pulsing magenta/indigo chromatophore freckle clouds across mother-of-pearl skin.
 */
// @ts-ignore - TSL Fn destructuring
export const evalChromatophoreClouds = Fn(([uvCoord, timeVal, scaleVal]) => {
  const p = vec2(uvCoord.x.mul(7.0), uvCoord.y.mul(5.5)).mul(scaleVal);
  // @ts-ignore
  const cloud = fbm2D(p.add(vec2(timeVal.mul(0.12), timeVal.mul(-0.08))));
  const cloudMask = smoothstep(float(0.42), float(0.76), cloud);

  // Fine chromatophore pigment dots living inside the clouds
  const micro = vec2(uvCoord.x.mul(96.0), uvCoord.y.mul(64.0)).mul(scaleVal);
  const mId = floor(micro);
  const mF = fract(micro).sub(0.5);
  // @ts-ignore
  const mHash = hash21(mId);
  const pulse = sin(timeVal.mul(2.1).add(cloud.mul(8.0)).add(mHash.mul(6.283))).mul(0.3).add(0.72);
  const freckle = float(1.0).sub(smoothstep(float(0.08), float(0.34), length(mF))).mul(stepGt(mHash, float(0.38)));

  return clamp(cloudMask.mul(0.55).add(cloudMask.mul(freckle).mul(pulse).mul(0.95)), float(0.0), float(1.3));
});

/**
 * Pattern 6: Crisp Staggered Exumbrella Polka-Dot Spots (Ref 7 — Spotted Lagoon)
 */
// @ts-ignore - TSL Fn destructuring
export const evalExumbrellaSpots = Fn(([uvCoord, timeVal, scaleVal]) => {
  const p = vec2(uvCoord.x.mul(24.0), uvCoord.y.mul(14.0)).mul(scaleVal);
  const row = floor(p.y);
  const staggered = vec2(p.x.add(row.mod(2.0).mul(0.5)), p.y);
  const id = floor(staggered);
  const local = fract(staggered).sub(0.5);
  // @ts-ignore
  const rJitter = hash21(id).mul(0.11).add(0.13);
  // @ts-ignore
  const posJitter = vec2(hash21(id.add(vec2(5.1, 2.3))).sub(0.5).mul(0.24), hash21(id.add(vec2(9.7, 14.2))).sub(0.5).mul(0.24));
  const d = length(local.sub(posJitter));
  const spot = float(1.0).sub(smoothstep(rJitter.sub(0.06), rJitter.add(0.04), d));
  // Spots largest near apex/mid-dome, tapering cleanly near margin like Mastigias papua
  const domeBand = smoothstep(float(0.04), float(0.18), uvCoord.y).mul(float(1.0).sub(smoothstep(float(0.74), float(0.96), uvCoord.y)));
  const breath = sin(timeVal.mul(1.2).add(id.x.mul(0.8))).mul(0.12).add(0.94);
  return clamp(spot.mul(domeBand).mul(breath).mul(1.2), float(0.0), float(1.2));
});

/**
 * Pattern 7: Sculpted Radial Glass Flutes & Comb-Row Prismatic Waves (Ref 7 — Nettle / Crown)
 */
// @ts-ignore - TSL Fn destructuring
export const evalRadialFlutes = Fn(([uvCoord, timeVal, scaleVal]) => {
  const ribCount = float(16.0).mul(clamp(scaleVal, float(0.5), float(2.0)));
  const radial = cos(uvCoord.x.mul(ribCount).mul(6.2831853)).mul(0.5).add(0.5);
  const flute = pow(clamp(radial, float(0.0), float(1.0)), float(4.2));
  const wave = sin(uvCoord.y.mul(14.0).sub(timeVal.mul(3.8)).add(uvCoord.x.mul(6.283))).mul(0.32).add(0.78);
  const apexSoft = smoothstep(float(0.04), float(0.2), uvCoord.y);
  return clamp(flute.mul(wave).mul(apexSoft).mul(1.25), float(0.0), float(1.3));
});

/**
 * Unified composable pattern evaluator across all 8 surface pattern IDs (0..7).
 * Returns a single scalar pattern intensity node with smooth cross-selection and zero branching divergence.
 */
export const evalComposablePattern: any = Fn(([uvCoord, viewDir, timeVal, patternType, scaleVal]: [any, any, any, any, any]) => {
  const p0: any = (evalBiolumeWaves as any)(uvCoord, timeVal, scaleVal).mul(selectWeight(patternType, float(0.0)));
  const p1: any = (evalHexVoronoi as any)(uvCoord, timeVal, scaleVal).mul(selectWeight(patternType, float(1.0)));
  const p2: any = (evalTuringMaze as any)(uvCoord, timeVal, scaleVal).mul(selectWeight(patternType, float(2.0)));
  const p3: any = (evalLeafVeinsAndPearls as any)(uvCoord, timeVal, scaleVal).mul(selectWeight(patternType, float(3.0)));
  const p4: any = (evalCosmicStarfield as any)(uvCoord, viewDir, timeVal, scaleVal).mul(selectWeight(patternType, float(4.0)));
  const p5: any = (evalChromatophoreClouds as any)(uvCoord, timeVal, scaleVal).mul(selectWeight(patternType, float(5.0)));
  const p6: any = (evalExumbrellaSpots as any)(uvCoord, timeVal, scaleVal).mul(selectWeight(patternType, float(6.0)));
  const p7: any = (evalRadialFlutes as any)(uvCoord, timeVal, scaleVal).mul(selectWeight(patternType, float(7.0)));

  return p0.add(p1).add(p2).add(p3).add(p4).add(p5).add(p6).add(p7);
});

/**
 * 4-Stop Chromatic Palette Ramp:
 *   coreColor   -> inner hearth / apex glow / gastric throat
 *   bellColor   -> main body / translucent gel mass
 *   accentColor -> procedural pattern veins / Fresnel rim / dispersion
 *   tipColor    -> lower margin / outer edge highlight / terminal droplets
 */
export const evalChromaticRamp4: any = Fn(([coreCol, bellCol, accentCol, tipCol, verticalT, fresnel, patternVal]: [any, any, any, any, any, any, any]) => {
  const topToMid: any = mix(coreCol, bellCol, smoothstep(float(0.05), float(0.55), verticalT));
  const midToTip: any = mix(topToMid, tipCol, smoothstep(float(0.55), float(1.0), verticalT));
  const withRim: any = mix(midToTip, accentCol, clamp(fresnel.mul(0.75), float(0.0), float(0.85)));
  const withPattern: any = mix(withRim, accentCol.mul(1.25).add(coreCol.mul(0.25)), clamp(patternVal.mul(0.68), float(0.0), float(0.95)));
  return withPattern;
});
