import * as THREE from 'three/webgpu';
import * as Particulate from 'particulate';
import {
  BodyPlan,
  evalRadiusProfile,
  evalSpineOffset,
  resolveGeometryConfig,
  resolveTentacleGroups,
  type CreatureSpec,
  type JellyfishSpec,
  type JellyfishGeometryConfig,
} from './creatures';

/**
 * JellyfishGeometry — Pure Unified Particulate.js Soft-Body Anatomical Rig
 *
 * Faithful to Jay Weeks's `particulate-medusae` architecture:
 * 1. Continuous Articulated Central Spine: one spine particle per bell rib
 *    constrained along the swimming axis via `Particulate.AxisConstraint`,
 *    eliminating discrete 3-point diamond creases and allowing smooth vertical
 *    squash-and-stretch during every propulsion stroke.
 * 2. Pure Particulate Form Construction: every bell dome, scalloped crown,
 *    flared lotus calyx, 5-petal orchid crown, fluted umbrella, opal mantle,
 *    hyperbolic ruffled oral arm, buoyant apex stamen, and discrete tentacle
 *    strand is held in equilibrium by Particulate `DistanceConstraint` &
 *    `AngleConstraint` topologies inside ONE shared `ParticleSystem`.
 * 3. Discrete Physics Tentacle Strands: zero closed 360° cylinder curtains.
 *    Every tentacle style builds independent Verlet strands (gossamer filaments,
 *    flat cloth ribbons, or sculpted 3D tapered tubes with ember bulbs/pearls)
 *    anchored 1:1 to live bell vertices.
 * 4. Native Particulate Forces: hydrodynamic drag, laminar ocean swirl,
 *    buoyancy gradients, and a pulsing subumbrella jet `PointForce` run natively
 *    inside `system.tick(dt)`.
 */

export interface ScalableConstraint {
  constraint: Particulate.DistanceConstraint;
  rest: [number, number];
}

export interface RibData {
  start: number;
  spineIndex: number;
  radius: number;
  centerX?: number;
  centerZ?: number;
  radiusSpine?: number;
  radiusOuter?: number;
  yParam: number;
  yPos: number;
  outerConstraints?: ScalableConstraint[];
  innerConstraints?: ScalableConstraint[];
  spokeConstraints?: ScalableConstraint[];
}

export interface SkinData {
  a: number;
  b: number;
}

export interface TentacleGroup {
  start: number;
  ribIndex: number;
  segments: number;
  count: number;
}

/**
 * A live Particulate.js Verlet particle chain skinned into a smooth 3D tubular
 * or gossamer filament mesh directly from `system.positions`.
 * Root node (`nodeIndices[0]`) IS a live vertex on the bell!
 */
export interface VerletTubeChain {
  nodeIndices: number[];
  baseRadius: number;
  tipRadius: number;
  radialSegments: number;
  hasBulbTip: boolean;
  bulbScale?: number;
  isStamen?: boolean;
  isFilament?: boolean;
  strandIndex?: number;
  strandTotal?: number;
}

/**
 * A live Particulate.js two-edge Verlet ribbon chain skinned into a silky-smooth
 * Catmull-Rom spline-subdivided 3D curved membrane (used for Oral Arms & Silk Ribbons).
 */
export interface VerletRibbonChain {
  innerIndices: number[];
  outerIndices: number[];
  widthCols: number;
  lengthSubdivs: number;
  ruffleAmp: number;
  ruffleFreq: number;
  crossCurve: number;
  phaseOffset: number;
  isOralArm: boolean;
  shapeMode?: string;
}

/**
 * Six genuinely distinct 3D Oral Arm topologies driven live by Particulate.js
 * Verlet particles anchored wide across the full-width inner bell (`tailRibs`).
 */
export type OralArmRig =
  | {
      kind: 'curtain';
      innerIndices: number[];
      outerIndices: number[];
      widthCols: number;
      lengthSubdivs: number;
      ruffleAmp: number;
      ruffleFreq: number;
      crossCurve: number;
      phaseOffset: number;
      shapeMode: string;
    }
  | {
      kind: 'kelpFrond';
      stalkIndices: number[];
      stalkRadius: number;
      leafCount: number;
      leafLength: number;
      leafWidth: number;
      phaseOffset: number;
    }
  | {
      kind: 'cauliflowerCluster';
      stalkIndices: number[];
      stalkRadius: number;
      floretCount: number;
      floretRadius: number;
      phaseOffset: number;
    }
  | {
      kind: 'helicalAuger';
      stalkIndices: number[];
      coreRadius: number;
      finWidth: number;
      turns: number;
      handedness: 1 | -1;
      phaseOffset: number;
    }
  | {
      kind: 'cuppedPetal';
      leftIndices: number[];
      midIndices: number[];
      rightIndices: number[];
      cupDepth: number;
      midribHeight: number;
      phaseOffset: number;
    }
  | {
      kind: 'pleatedRosette';
      ringStarts: number[];
      ringSegments: number;
      pleatFolds: number;
      pleatDepth: number;
      phaseOffset: number;
    };

export interface AppendageRanges {
  bell?: [number, number];
  core?: [number, number];
  skirt?: [number, number];
  oralArms?: [number, number];
  tentacles?: [number, number];
  stamens?: [number, number];
}

/**
 * Native Particulate.js Hydrodynamic Force running directly inside `system.tick(dt)`.
 * Faithful to `particulate-medusae` MainScene: pure gentle downward gravity + ultra-subtle
 * laminar ocean drift so all flowing waves originate organically from bell & inner-bell pulsing.
 */
export class HydrodynamicWakeForce implements Particulate.Force {
  public vector = new Float32Array([0, 0, 0]);
  public type = 0;
  public time = 0;
  public wakeStrength = 0;
  public wakeOriginY = 0;
  public currentStrength = 0.42;
  public ranges: AppendageRanges;

  constructor(ranges: AppendageRanges) {
    this.ranges = ranges;
  }

  public set(x: number | number[], y?: number, z?: number): void {
    if (Array.isArray(x)) {
      this.vector[0] = x[0] ?? 0;
      this.vector[1] = x[1] ?? 0;
      this.vector[2] = x[2] ?? 0;
    } else {
      this.vector[0] = x;
      this.vector[1] = y ?? 0;
      this.vector[2] = z ?? 0;
    }
  }

  private inRange(pIdx: number, range?: [number, number]): boolean {
    return !!range && pIdx >= range[0] && pIdx < range[1];
  }

  public applyForce(ix: number, f0: Float32Array, p0: Float32Array, _p1: Float32Array): void {
    const pIdx = ix / 3;
    const x = p0[ix];
    const y = p0[ix + 1];
    const z = p0[ix + 2];

    // Ultra-gentle, long-wavelength laminar underwater drift (no chaotic sideways whipping!)
    const t = this.time * 0.46;
    const swirlX = Math.sin(t + y * 0.018 + z * 0.012) * this.currentStrength;
    const swirlZ = Math.cos(t * 0.85 + y * 0.016 + x * 0.012) * this.currentStrength;

    const r = Math.hypot(x, z);

    if (this.inRange(pIdx, this.ranges.stamens)) {
      // Smooth upward buoyancy + bounded outward botanical spray (zero singularity)
      const outScale = r > 1e-4 ? 4.6 / (r + 3.5) : 0;
      f0[ix] += x * outScale + swirlX * 0.35;
      f0[ix + 1] += 16.5;
      f0[ix + 2] += z * outScale + swirlZ * 0.35;
    } else if (this.inRange(pIdx, this.ranges.tentacles)) {
      // Pure gentle downward trailing gravity + subtle bounded radial breathing on expulsion
      const belowBell = Math.max(0, this.wakeOriginY - y);
      const flareEnv = Math.exp(-belowBell / 34.0) * this.wakeStrength;
      const radialFlare = r > 1e-4 ? (flareEnv * 2.1) / (r + 7.5) : 0;
      f0[ix] += x * radialFlare + swirlX * 0.85;
      f0[ix + 1] -= 15.5 + this.wakeStrength * 8.0;
      f0[ix + 2] += z * radialFlare + swirlZ * 0.85;
    } else if (this.inRange(pIdx, this.ranges.oralArms)) {
      // Coherent silky downward drape with delicate subumbrella wake pulse
      const belowBell = Math.max(0, this.wakeOriginY - y);
      const flareEnv = Math.exp(-belowBell / 28.0) * this.wakeStrength;
      const radialFlare = r > 1e-4 ? (flareEnv * 1.6) / (r + 7.0) : 0;
      f0[ix] += x * radialFlare + swirlX * 0.65;
      f0[ix + 1] -= 14.5 + this.wakeStrength * 7.0;
      f0[ix + 2] += z * radialFlare + swirlZ * 0.65;
    } else if (this.inRange(pIdx, this.ranges.skirt)) {
      // Subtle downward settle keeping the inner bell vaulted and responsive to outer bell pulse
      f0[ix] += swirlX * 0.16;
      f0[ix + 1] -= 4.5 + this.wakeStrength * 2.5;
      f0[ix + 2] += swirlZ * 0.16;
    } else if (this.inRange(pIdx, this.ranges.core)) {
      f0[ix + 1] -= 2.5;
    } else {
      f0[ix] += swirlX * 0.08;
      f0[ix + 2] += swirlZ * 0.08;
    }
  }
}

export interface JellyfishGeometryData {
  spec: CreatureSpec;
  config: JellyfishGeometryConfig;
  geometry: THREE.BufferGeometry;
  system: Particulate.ParticleSystem;
  hydroForce: HydrodynamicWakeForce;
  jetForce: Particulate.PointForce;
  links: {
    bulb: number[];
    tail: number[];
    tentacles: number[];
    inner: number[];
    linesFore: number[];
    linesInner: number[];
  };
  faces: {
    bulb: number[];
    gastricCore: number[];
    tail: number[];
    mouth: number[];
    tentacles: number[];
    tentacleGroups: number[][];
  };
  uvs: Float32Array;
  weights: number[];
  spineNodes: number[];
  ribs: RibData[];
  tailRibs: RibData[];
  coreRibs: RibData[];
  pins: {
    top: number;
    mid: number;
    bottom: number;
    tail: number;
    tentacle: number;
  };
  pinRestY: {
    top: number;
    mid: number;
    bottom: number;
    tail: number;
    tentacle: number;
  };
  pinRestXZ: {
    top: [number, number];
    mid: [number, number];
    bottom: [number, number];
  };
  pinConstraints: {
    top: Particulate.PointConstraint;
    mid: Particulate.PointConstraint;
    bottom: Particulate.PointConstraint;
    tail: Particulate.PointConstraint;
    tentacle: Particulate.PointConstraint;
  };
  appendageRanges: AppendageRanges;
  position: THREE.BufferAttribute;
  positionPrev: THREE.BufferAttribute;
  verletTubeChains: VerletTubeChain[];
  stamenChains: VerletTubeChain[];
  ribbonChains: VerletRibbonChain[];
  oralArmChains: VerletRibbonChain[];
  oralArmRigs: OralArmRig[];
}

function point(x: number, y: number, z: number, buffer: number[]): number[] {
  buffer.push(x, y, z);
  return buffer;
}

function loop(index: number, howMany: number, buffer: number[]): number[] {
  for (let i = 0; i < howMany - 1; i++) {
    buffer.push(index + i, index + i + 1);
  }
  buffer.push(index + howMany - 1, index);
  return buffer;
}

function quadDoubleSide(a: number, b: number, c: number, d: number, buffer: number[]): number[] {
  buffer.push(
    a, b, c,
    c, d, a,
    d, c, b,
    b, a, d,
  );
  return buffer;
}

function radialFaces(indexCenter: number, index: number, howMany: number, buffer: number[]): number[] {
  for (let i = 0, il = howMany - 1; i < il; i++) {
    buffer.push(indexCenter, index + i + 1, index + i);
  }
  buffer.push(indexCenter, index, index + howMany - 1);
  return buffer;
}

function ringFaces(index0: number, index1: number, howMany: number, buffer: number[]): number[] {
  for (let i = 0, il = howMany - 1; i < il; i++) {
    const a = index0 + i;
    const b = index0 + i + 1;
    const c = index1 + i + 1;
    const d = index1 + i;
    buffer.push(a, b, c, c, d, a);
  }
  const a = index0 + howMany - 1;
  const b = index0;
  const c = index1;
  const d = index1 + howMany - 1;
  buffer.push(a, b, c, c, d, a);
  return buffer;
}

/**
 * Jay Weeks's cubic mass ramp from `particulate-medusae` (`Medusae.js:390`).
 * Nearly weightless at the subumbrella root (zero drag/yanking against bell pulse),
 * growing cubically toward the trailing tips so gentle gravity propagates silky waves.
 */
function cubicStrandWeight(t: number): number {
  return 0.04 + 0.96 * t * t * t;
}

function ribUvs(sv: number, howMany: number, buffer: number[]): number[] {
  for (let i = 0; i < howMany; i++) {
    const su = i / howMany;
    buffer.push(su, sv);
  }
  return buffer;
}

const LEGACY_SPEC: JellyfishSpec = {
  id: 'legacy',
  archetypeId: 'jellyfish',
  bodyPlan: BodyPlan.Medusa,
  features: { tail: true, mouth: true, tentacles: true },
  profiles: {
    bulb: { kind: 'legacy_bell' },
    tail: { kind: 'legacy_tail' },
  },
  emitters: {
    tentacles: {
      kind: 'legacy_tentacles',
      groupCount: 3,
      groupStartRib: 6,
      groupRibOffset: 4,
    },
  },
};

export interface JellyfishGeometryOptions {
  rng?: () => number;
}

export class JellyfishGeometry {
  private readonly spec: JellyfishSpec;
  private readonly cfg: JellyfishGeometryConfig;
  private readonly rng: () => number;
  private readonly tentacleAttachRibs: number[];

  private verts: number[] = [];
  private uvs: number[] = [];
  private tentLinks: number[] = [];
  private tentFaces: number[] = [];
  private tentGroupFaces: number[][] = [];
  private bulbFaces: number[] = [];
  private gastricCoreFaces: number[] = [];
  private tailFaces: number[] = [];
  private mouthFaces: number[] = [];
  private weights: number[] = [];
  private queuedConstraints: Particulate.Constraint[] = [];
  private skins: SkinData[] = [];
  private spineNodes: number[] = [];
  private ribs: RibData[] = [];
  private tailRibs: RibData[] = [];
  private coreRibs: RibData[] = [];
  private verletTubeChains: VerletTubeChain[] = [];
  private stamenChains: VerletTubeChain[] = [];
  private ribbonChains: VerletRibbonChain[] = [];
  private oralArmChains: VerletRibbonChain[] = [];
  private oralArmRigs: OralArmRig[] = [];
  private appendageRanges: AppendageRanges = {};

  // Fixed axis pins (weight = 0, translated smoothly by the jet-propulsion oscillator)
  private pinTop = 0;
  private pinMid = 1;
  private pinBottom = 2;
  private pinTail = 3;
  private pinTentacle = 4;
  private indexTop = 5;
  private topStart = 6;

  private posTop: number;
  private posMid: number;
  private posBottom: number;
  private posTail: number;
  private posTentacle: number;

  private spineOffset(tParam: number): { x: number; z: number } {
    return evalSpineOffset(this.spec.spine, tParam);
  }

  private yToSpineT(y: number): number {
    const top = this.posTop;
    const bottom = this.posBottom;
    const denom = Math.max(1e-6, top - bottom);
    return Math.max(0, Math.min(1, (top - y) / denom));
  }

  private smin(a: number, b: number, k: number): number {
    const kk = Math.max(1e-4, k);
    const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / kk));
    return b * (1 - h) + a * h - kk * h * (1 - h);
  }

  /**
   * Monotonic smooth vertical profile for bell spine nodes `r = 0..ribsCount-1`.
   * Guarantees zero double-layered inside-out folding on flared floral bells!
   */
  private evalBellSpineY(yParam: number): number {
    const bellMode = this.cfg.bellShapeMode ?? 'dome';
    const size = this.cfg.size;
    if (bellMode === 'lotusCalyx') {
      // Shallow graceful flower canopy: descends smoothly then opens wide & softly flattens
      const depthCurve = Math.sin(yParam * Math.PI * 0.52);
      return this.posTop - depthCurve * size * 0.56;
    }
    if (bellMode === 'orchidCrown') {
      // Sculpted tulip-orchid calyx depth
      const depthCurve = Math.pow(yParam, 0.85);
      return this.posTop - depthCurve * size * 0.72;
    }
    return this.posTop - yParam * size;
  }

  private getRadialMod(tParam: number): ((angle: number) => number) | undefined {
    const symmetry = this.spec.symmetry;
    const lobes = this.spec.lobes;
    const ridges = this.spec.surface?.ridges;
    const frill = this.spec.surface?.frill;
    const bellMode = this.cfg.bellShapeMode ?? 'dome';

    const breaking = symmetry?.breaking ?? 0;
    const phaseJitter = (this.rng() * 2 - 1) * breaking * Math.PI;
    const ampMul = 1.0 - breaking * 0.25 + (this.rng() * 2 - 1) * breaking * 0.1;

    const lobeLayers: Array<{
      count: number;
      amp: number;
      phase: number;
      tRange?: [number, number];
      sharp?: boolean;
    }> = [];

    const lobeSpheres: Array<{ cx: number; cy: number; cz: number; r: number }> = [];
    if (lobes && lobes.count > 0 && lobes.amplitude > 0) {
      const size = this.cfg.size;
      const yOffset = this.cfg.yOffset;
      const phase = lobes.phase ?? 0;
      const rot = (this.spec.crossSection?.rotation ?? 0) + (this.spec.crossSection?.twist ?? 0) * tParam;
      for (let j = 0; j < lobes.count; j++) {
        const theta = (j / lobes.count) * Math.PI * 2 + phase + rot;
        const tj = 0.25 + (j / lobes.count) * 0.65;
        const rBodyAtT = Math.max(1e-3, evalRadiusProfile(this.spec.profiles?.bulb, tj) * this.cfg.ribRadius);
        const sphR = Math.max(0.4, lobes.amplitude * rBodyAtT * (lobes.radiusScale ?? 1));
        const yPos = size + yOffset - tj * size;
        lobeSpheres.push({
          cx: Math.cos(theta) * rBodyAtT,
          cy: yPos,
          cz: Math.sin(theta) * rBodyAtT,
          r: sphR,
        });
      }
    }

    if (ridges && ridges.count > 0 && ridges.amplitude > 0) {
      lobeLayers.push({
        count: ridges.count,
        amp: ridges.amplitude,
        phase: (ridges.phase ?? 0) + phaseJitter * 0.5,
        tRange: ridges.tRange,
        sharp: true,
      });
    } else if (!lobes && symmetry?.kind === 'radial' && symmetry.order > 1) {
      lobeLayers.push({
        count: symmetry.order,
        amp: 0.12 * (1 - breaking * 0.6),
        phase: (symmetry.phase ?? 0) + phaseJitter * 0.5,
        tRange: [0.15, 0.95],
      });
    }

    const fr = frill && frill.amplitude > 0 && frill.frequency > 0
      ? {
          amp: frill.amplitude * ampMul,
          freq: frill.frequency,
          phase: (frill.phase ?? 0) + phaseJitter,
          tRange: frill.tRange ?? [0.7, 1.0],
        }
      : undefined;

    if (lobeLayers.length === 0 && !fr && lobeSpheres.length === 0 && bellMode === 'dome') {
      return undefined;
    }

    const bodyRadius = Math.max(1e-3, evalRadiusProfile(this.spec.profiles?.bulb, tParam) * this.cfg.ribRadius);
    const yPos = this.evalBellSpineY(tParam);

    return (angle: number) => {
      let m = 1.0;

      if (bellMode === 'scallopedCrystal' && tParam > 0.54) {
        const edgeT = (tParam - 0.54) / 0.46;
        m *= 1.0 + Math.cos(angle * 12) * 0.085 * edgeT * edgeT;
      } else if (bellMode === 'lotusCalyx' && tParam > 0.2) {
        const petalT = (tParam - 0.2) / 0.8;
        m *= 1.0 + Math.sin(angle * 6) * 0.14 * petalT + Math.cos(angle * 18) * 0.032 * petalT * petalT;
      } else if (bellMode === 'orchidCrown' && tParam > 0.18) {
        const petalT = (tParam - 0.18) / 0.82;
        const star5 = Math.pow(Math.max(0, Math.cos(angle * 2.5)), 2.0) * 1.5 - 0.25;
        m *= 1.0 + star5 * 0.28 * petalT;
      } else if (bellMode === 'flutedUmbrella' && tParam > 0.14) {
        const fluteT = Math.sin(Math.min(1, (tParam - 0.14) / 0.86) * Math.PI * 0.92);
        m *= 1.0 + Math.cos(angle * 16) * 0.075 * fluteT;
      } else if (bellMode === 'opalMantle' && tParam < 0.42) {
        const finEnv = Math.sin((tParam / 0.42) * Math.PI);
        const lateral = Math.pow(Math.abs(Math.cos(angle)), 3.0);
        m *= 1.0 + lateral * 0.78 * finEnv;
      }

      for (const layer of lobeLayers) {
        if (layer.tRange) {
          const [a, b] = layer.tRange;
          if (tParam < a || tParam > b) continue;
        }
        const base = Math.cos(layer.count * angle + layer.phase);
        const wave = layer.sharp ? -Math.pow(Math.max(0, base), 10) : base;
        m *= 1.0 + wave * (layer.amp * ampMul);
      }

      if (fr) {
        const [a, b] = fr.tRange;
        if (tParam >= a && tParam <= b) {
          m *= 1.0 + Math.sin(fr.freq * angle + fr.phase) * fr.amp;
        }
      }

      if (lobeSpheres.length > 0) {
        const rot =
          (this.spec.crossSection?.rotation ?? 0) + (this.spec.crossSection?.twist ?? 0) * tParam;
        const a = angle + rot;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        let r = bodyRadius * m;
        for (const sph of lobeSpheres) {
          const dy = yPos - sph.cy;
          if (Math.abs(dy) >= sph.r) continue;
          const h = Math.sqrt(Math.max(0, sph.r * sph.r - dy * dy));
          const dc2 = sph.cx * sph.cx + sph.cz * sph.cz;
          if (dc2 < 1e-12) continue;
          const proj = sph.cx * ca + sph.cz * sa;
          const disc = proj * proj - dc2 + h * h;
          if (disc <= 0) continue;
          const ext = proj + Math.sqrt(disc);
          if (ext <= r) continue;
          const k = Math.max(1e-3, sph.r * 0.45);
          r = r + ext - this.smin(r, ext, k);
        }
        m = r / bodyRadius;
      }

      if (breaking > 0) {
        m *= 1.0 + Math.cos(angle + phaseJitter) * (0.05 * breaking);
      }

      return m;
    };
  }

  /**
   * Gentle, non-self-intersecting edge undulation on outer petals/lappets.
   * Strictly bounded so lower rings NEVER fold upward through upper rings!
   */
  private getVerticalMod(yParam: number, angle: number): number {
    const bellMode = this.cfg.bellShapeMode ?? 'dome';
    const size = this.cfg.size;

    if (bellMode === 'scallopedCrystal' && yParam > 0.65) {
      const t = (yParam - 0.65) / 0.35;
      return Math.cos(angle * 12) * size * 0.045 * t * t;
    }

    if (bellMode === 'lotusCalyx' && yParam > 0.45) {
      // Gentle undulating wave + subtle upward cup ONLY on outer flared petals (zero fold-back!)
      const t = (yParam - 0.45) / 0.55;
      const softCup = Math.pow(t, 1.8) * size * 0.14;
      const petalWave = Math.sin(angle * 6) * size * 0.085 * t * t;
      const microRuffle = Math.cos(angle * 18) * size * 0.02 * t * t;
      return softCup + petalWave + microRuffle;
    }

    if (bellMode === 'orchidCrown' && yParam > 0.38) {
      const t = (yParam - 0.38) / 0.62;
      const petalPeak = Math.pow(Math.max(0, Math.cos(angle * 2.5)), 2.2);
      return petalPeak * size * 0.24 * Math.pow(t, 1.65) + Math.sin(angle * 5) * size * 0.05 * t;
    }

    if (bellMode === 'opalMantle' && yParam < 0.42) {
      const finEnv = Math.sin((yParam / 0.42) * Math.PI);
      return -Math.pow(Math.abs(Math.cos(angle)), 2.5) * size * 0.05 * finEnv;
    }

    return 0;
  }

  constructor(spec?: CreatureSpec, options: JellyfishGeometryOptions = {}) {
    this.spec = (spec?.archetypeId === 'jellyfish' ? spec : LEGACY_SPEC) as JellyfishSpec;
    this.cfg = resolveGeometryConfig(this.spec);
    this.rng = options.rng ?? Math.random;

    this.posTop = this.cfg.yOffset + this.cfg.size;
    this.posBottom = this.evalBellSpineY(1.0);
    this.posMid = (this.posTop + this.posBottom) * 0.5;
    this.posTail = this.posBottom - Math.max(this.cfg.size * 0.75, this.cfg.tailArmSegments * this.cfg.tailArmSegmentLength);
    this.posTentacle = this.posBottom - Math.max(this.cfg.size * 1.4, this.cfg.tentacleSegments * this.cfg.tentacleSegmentLength);

    const wantsTentacles = (this.spec.features?.tentacles ?? true) && this.cfg.tentacleSegments > 0;
    const bellRibCount = Math.max(1, this.cfg.ribsCount);
    this.tentacleAttachRibs = wantsTentacles
      ? resolveTentacleGroups(this.spec.emitters?.tentacles, { rng: this.rng, ribCount: bellRibCount }).ribIndices
      : [];

    this.createGeometry();
  }

  private shouldCapTop(): boolean {
    const capTop = this.spec.topology?.capTop;
    if (typeof capTop === 'boolean') return capTop;
    return this.spec.bodyPlan !== BodyPlan.Salp;
  }

  private superformulaRadius(
    theta: number,
    sf: NonNullable<NonNullable<CreatureSpec['crossSection']>['superformula']>,
  ): number {
    const m = sf.m ?? 0;
    if (m <= 0) return 1.0;

    const a = sf.a ?? 1.0;
    const b = sf.b ?? 1.0;
    const n1 = sf.n1 ?? 0.35;
    const n2 = sf.n2 ?? 0.35;
    const n3 = sf.n3 ?? 0.35;

    const t = (m * theta) / 4.0;
    const c = Math.abs(Math.cos(t) / Math.max(1e-4, a));
    const s = Math.abs(Math.sin(t) / Math.max(1e-4, b));
    const v = Math.pow(c, n2) + Math.pow(s, n3);
    const r = v <= 1e-6 ? 1.0 : Math.pow(v, -1.0 / Math.max(1e-3, n1));

    return Math.max(0.22, Math.min(2.1, r));
  }

  private ringVertex(theta: number, radius: number, yParam: number): { x: number; z: number } {
    const cs = this.spec.crossSection;
    const rot = (cs?.rotation ?? 0) + (cs?.twist ?? 0) * yParam;
    const a = theta + rot;

    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;

    if (!cs || cs.kind === 'circle') {
      return { x, z };
    }

    if (cs.kind === 'ellipse') {
      return { x: x * (cs.xScale ?? 1.0), z: z * (cs.zScale ?? 1.0) };
    }

    if (cs.kind === 'superformula') {
      const sf = cs.superformula;
      const rMul = sf ? this.superformulaRadius(a, sf) : 1.0;
      return { x: x * rMul, z: z * rMul };
    }

    return { x, z };
  }

  private pushRingVertices(
    segments: number,
    radius: number,
    yPos: number,
    buffer: number[],
    mod: ((angle: number) => number) | undefined,
    centerX: number,
    centerZ: number,
    yParam: number,
    applyBellVerticalMod: boolean = false,
  ): void {
    const step = (Math.PI * 2) / segments;
    let angle = 0;

    for (let i = 0; i < segments; i++) {
      const m = mod ? mod(angle) : 1.0;
      const r = radius * Math.max(0.08, m);
      const v = this.ringVertex(angle, r, yParam);
      const dy = applyBellVerticalMod ? this.getVerticalMod(yParam, angle) : 0;
      buffer.push(v.x + centerX, yPos + dy, v.z + centerZ);
      angle += step;
    }
  }

  private createGeometry(): void {
    this.createArticulatedSpine();
    this.createBulb();
    this.createGastricCore();

    if (this.cfg.apexStamens) {
      this.createApexStamens();
    }
    // Always construct the full-width pulsing inner bell (subumbrella `tailRibs`)
    // so oral arms and tentacles ALWAYS anchor across concentric subumbrella rings
    // proportional to ANY outer bell shape/size (faces only emitted when skirt enabled).
    this.createTail();

    if (this.spec.features?.mouth ?? true) {
      this.createMouth();
    }
    if (this.spec.features?.tentacles ?? true) {
      this.createDiscreteTentacles();
    }
  }

  // ...................................................
  // 1. Articulated Central Spine (One Node per Bell Rib!)
  //    Eliminates 3-point diamond creases completely.
  // ...................................................
  private createArticulatedSpine(): void {
    const ribsCount = this.cfg.ribsCount;
    const size = this.cfg.size;

    const crownCapY = this.posTop + Math.min(size * 0.032, 1.1);
    const fixedY = [
      this.posTop,
      this.posMid,
      this.posBottom,
      this.posTail,
      this.posTentacle,
      crownCapY,
    ];

    // Push pins (0..4) + apex cap vertex (5)
    for (let i = 0; i < fixedY.length; i++) {
      const y = fixedY[i];
      const t = this.yToSpineT(y);
      const off = this.spineOffset(t);
      point(off.x, y, off.z, this.verts);
      this.uvs.push(0.5, 0);
    }
    this.queueWeights(this.indexTop, 1, 0.28);

    // Push dedicated spine particle for EVERY bell rib
    this.spineNodes = [];
    for (let r = 0; r < ribsCount; r++) {
      const yParam = r / Math.max(1, ribsCount - 1);
      const y = this.evalBellSpineY(yParam);
      const off = this.spineOffset(yParam);
      const nodeIdx = this.verts.length / 3;
      point(off.x, y, off.z, this.verts);
      this.uvs.push(0.5, yParam);
      this.spineNodes.push(nodeIdx);
      this.queueWeights(nodeIdx, 1, 0.34 + 0.14 * yParam);
    }

    // Bell vertices begin immediately after the spine chain
    this.topStart = this.verts.length / 3;

    // Anchor apex cap to pinTop & first spine node
    const dCapPin = Math.max(0.25, Particulate.Vec3.distance(this.verts, this.pinTop, this.indexTop));
    const dCapFirst = Math.max(0.25, Particulate.Vec3.distance(this.verts, this.indexTop, this.spineNodes[0]));
    this.queueConstraints(
      Particulate.DistanceConstraint.create([dCapPin * 0.82, dCapPin * 1.18], [this.pinTop, this.indexTop]),
      Particulate.DistanceConstraint.create([dCapFirst * 0.82, dCapFirst * 1.18], [this.indexTop, this.spineNodes[0]]),
    );

    // Elastic sequential spine links so the bell compresses & elongates smoothly along the axis
    const dPinTopFirst = Math.max(0.1, Particulate.Vec3.distance(this.verts, this.pinTop, this.spineNodes[0]));
    this.queueConstraints(
      Particulate.DistanceConstraint.create([dPinTopFirst * 0.88, dPinTopFirst * 1.12], [this.pinTop, this.spineNodes[0]]),
    );

    for (let r = 1; r < ribsCount; r++) {
      const a = this.spineNodes[r - 1];
      const b = this.spineNodes[r];
      const d = Math.max(0.1, Particulate.Vec3.distance(this.verts, a, b));
      this.queueConstraints(Particulate.DistanceConstraint.create([d * 0.94, d * 1.06], [a, b]));
    }

    const lastSpine = this.spineNodes[ribsCount - 1];
    const dLastBot = Math.max(0.1, Particulate.Vec3.distance(this.verts, this.pinBottom, lastSpine));
    this.queueConstraints(
      Particulate.DistanceConstraint.create([0, dLastBot + size * 0.06], [this.pinBottom, lastSpine]),
    );

    // Constrain spine nodes smoothly onto the swimming axis (pinTop -> pinBottom)
    if (!this.spec.spine || this.spec.spine.kind === 'none') {
      this.queueConstraints(
        Particulate.AxisConstraint.create(this.pinTop, this.pinBottom, [
          this.indexTop,
          ...this.spineNodes,
        ]),
      );
    }

    if (this.shouldCapTop()) {
      radialFaces(this.indexTop, this.topStart, this.cfg.totalSegments, this.bulbFaces);
    }
  }

  // ...................................................
  // 2. Outer Bell Shell & Exotic Floral Crowns
  // ...................................................
  private createBulb(): void {
    const ribsCount = this.cfg.ribsCount;
    const rangeStart = this.verts.length / 3;

    for (let i = 0; i < ribsCount; i++) {
      this.createRib(i, ribsCount);
      if (i > 0) {
        this.createSkin(i - 1, i);
      }
    }

    // Smooth mass-weighted 2nd-neighbor meridian bending springs (replaces jerky AngleConstraint!)
    // Keeps every dome and floral petal canopy silky smooth with zero vertical pleating or kinks.
    const segments = this.cfg.totalSegments;
    for (let r = 2; r < ribsCount; r++) {
      const ribPrev2 = this.ribs[r - 2];
      const ribCurr = this.ribs[r];
      for (let s = 0; s < segments; s++) {
        const a = ribPrev2.start + s;
        const b = ribCurr.start + s;
        const d = Math.max(0.08, Particulate.Vec3.distance(this.verts, a, b));
        this.queueConstraints(Particulate.DistanceConstraint.create([d * 0.92, d * 1.08], [a, b]));
      }
    }

    // Axial tilt-stabilizing cross-spokes on key rings so the bell canopy never tilts or collapses
    const keyRingIndices = [
      Math.max(1, Math.floor(ribsCount * 0.25)),
      Math.max(2, Math.floor(ribsCount * 0.55)),
      ribsCount - 1,
    ];
    for (const r of keyRingIndices) {
      const rib = this.ribs[r];
      const anchorSpine = r < ribsCount - 1 ? this.spineNodes[Math.max(0, r - 2)] : this.pinTop;
      for (let s = 0; s < segments; s += 4) {
        const vIdx = rib.start + s;
        const d = Math.max(0.1, Particulate.Vec3.distance(this.verts, anchorSpine, vIdx));
        this.queueConstraints(Particulate.DistanceConstraint.create([d * 0.92, d * 1.08], [anchorSpine, vIdx]));
      }
    }

    this.appendageRanges.bell = [rangeStart, this.verts.length / 3];
  }

  private computeTripletAngle(a: number, b: number, c: number): number {
    const abx = this.verts[b * 3] - this.verts[a * 3];
    const aby = this.verts[b * 3 + 1] - this.verts[a * 3 + 1];
    const abz = this.verts[b * 3 + 2] - this.verts[a * 3 + 2];
    const bcx = this.verts[c * 3] - this.verts[b * 3];
    const bcy = this.verts[c * 3 + 1] - this.verts[b * 3 + 1];
    const bcz = this.verts[c * 3 + 2] - this.verts[b * 3 + 2];
    const lenAB = Math.hypot(abx, aby, abz);
    const lenBC = Math.hypot(bcx, bcy, bcz);
    if (lenAB < 1e-5 || lenBC < 1e-5) return Math.PI;
    const dotVal = (-abx * bcx - aby * bcy - abz * bcz) / (lenAB * lenBC);
    return Math.acos(Math.max(-1, Math.min(1, dotVal)));
  }

  private buildRingConstraints(
    start: number,
    segments: number,
    outerSlack: [number, number],
    innerSlack: [number, number],
  ): { outerConstraints: ScalableConstraint[]; innerConstraints: ScalableConstraint[] } {
    const outerConstraints: ScalableConstraint[] = [];
    const innerConstraints: ScalableConstraint[] = [];

    for (let i = 0; i < segments; i++) {
      const a = start + i;
      const b = start + ((i + 1) % segments);
      const d = Math.max(0.05, Particulate.Vec3.distance(this.verts, a, b));
      const rest: [number, number] = [d * outerSlack[0], d * outerSlack[1]];
      const c = Particulate.DistanceConstraint.create(rest, [a, b]);
      outerConstraints.push({ constraint: c, rest });
      this.queueConstraints(c);
    }

    const step = Math.max(2, Math.floor(segments / 3));
    for (let i = 0; i < segments; i++) {
      const a = start + i;
      const b = start + ((i + step) % segments);
      const d = Math.max(0.05, Particulate.Vec3.distance(this.verts, a, b));
      const rest: [number, number] = [d * innerSlack[0], d * innerSlack[1]];
      const c = Particulate.DistanceConstraint.create(rest, [a, b]);
      innerConstraints.push({ constraint: c, rest });
      this.queueConstraints(c);
    }

    return { outerConstraints, innerConstraints };
  }

  private createRib(index: number, total: number): void {
    const segments = this.cfg.totalSegments;
    const yParam = index / Math.max(1, total - 1);
    const yPos = this.evalBellSpineY(yParam);

    const start = this.verts.length / 3;
    const spineIndex = this.spineNodes[index];
    const radiusT = Math.max(0.06, evalRadiusProfile(this.spec.profiles?.bulb, yParam));
    const radius = radiusT * this.cfg.ribRadius;

    const center = this.spineOffset(yParam);
    const mod = this.getRadialMod(yParam);
    this.pushRingVertices(segments, radius, yPos, this.verts, mod, center.x, center.z, yParam, true);
    ribUvs(yParam, segments, this.uvs);

    // Progressive biological mass gradient from firm crown apex -> supple bell margin
    this.queueWeights(start, segments, 0.28 + 0.30 * yParam);

    const isSculptedBell = (this.cfg.bellShapeMode ?? 'dome') !== 'dome';
    const { outerConstraints, innerConstraints } = this.buildRingConstraints(
      start,
      segments,
      isSculptedBell ? [0.95, 1.06] : [0.94, 1.08],
      isSculptedBell ? [0.95, 1.06] : [0.94, 1.08],
    );

    // Brace EVERY bell rib radially to its OWN dedicated spine node `spineIndex`!
    // Spokes lie cleanly in the rib's radial plane -> zero equator diamond pinching!
    const spokeStep = index === 0 || index === total - 1 ? 1 : 2;
    const spokeConstraints: ScalableConstraint[] = [];
    for (let i = 0; i < segments; i += spokeStep) {
      const vIdx = start + i;
      const d = Math.max(0.1, Particulate.Vec3.distance(this.verts, spineIndex, vIdx));
      const rest: [number, number] = isSculptedBell ? [d * 0.94, d * 1.06] : [d * 0.92, d * 1.08];
      const spoke = Particulate.DistanceConstraint.create(rest, [spineIndex, vIdx]);
      spokeConstraints.push({ constraint: spoke, rest });
      this.queueConstraints(spoke);
    }

    this.ribs.push({
      start,
      spineIndex,
      radius,
      centerX: center.x,
      centerZ: center.z,
      yParam,
      yPos,
      outerConstraints,
      innerConstraints,
      spokeConstraints,
    });
  }

  private createSkin(r0: number, r1: number): void {
    const segments = this.cfg.totalSegments;
    const rib0 = this.ribs[r0];
    const rib1 = this.ribs[r1];

    // Meridian springs + alternating diagonal shear bracing for silky smooth curvature
    for (let i = 0; i < segments; i++) {
      const a = rib0.start + i;
      const b = rib1.start + i;
      const d = Math.max(0.05, Particulate.Vec3.distance(this.verts, a, b));
      this.queueConstraints(Particulate.DistanceConstraint.create([d * 0.9, d * 1.1], [a, b]));

      const diagPartner = r1 % 2 === 0
        ? rib1.start + ((i + 1) % segments)
        : rib1.start + ((i - 1 + segments) % segments);
      const dDiag = Math.max(0.05, Particulate.Vec3.distance(this.verts, a, diagPartner));
      this.queueConstraints(Particulate.DistanceConstraint.create([dDiag * 0.91, dDiag * 1.1], [a, diagPartner]));
    }

    ringFaces(rib0.start, rib1.start, segments, this.bulbFaces);
    this.skins.push({ a: r0, b: r1 });
  }

  // ...................................................
  // 3. Internal Gastric Core / Gonad Flower
  //    Suspended natively from upper spine nodes for genuine soft-body parallax!
  // ...................................................
  private createGastricCore(): void {
    const coreSegments = 20;
    const coreRings = 5;
    const rangeStart = this.verts.length / 3;
    const bellHeight = Math.max(10, this.posTop - this.posBottom);
    const topY = this.posTop - bellHeight * 0.22;
    const botY = this.posTop - bellHeight * 0.68;
    const baseR = Math.max(2.2, this.cfg.ribRadius * 0.42);

    const topSpineNode = this.spineNodes[Math.min(this.spineNodes.length - 1, Math.max(1, Math.round(this.ribs.length * 0.18)))];
    const capIdx = this.verts.length / 3;
    const topOff = this.spineOffset(0.2);
    point(topOff.x, topY + bellHeight * 0.04, topOff.z, this.verts);
    this.uvs.push(0.5, 0);
    this.queueWeights(capIdx, 1, 0.42);
    const dCap = Math.max(0.2, Particulate.Vec3.distance(this.verts, topSpineNode, capIdx));
    this.queueConstraints(Particulate.DistanceConstraint.create([dCap * 0.9, dCap * 1.1], [topSpineNode, capIdx]));

    for (let r = 0; r < coreRings; r++) {
      const t = r / (coreRings - 1);
      const yPos = topY + (botY - topY) * t;
      const profile = Math.sin(Math.PI * (0.14 + 0.78 * t));
      const ringR = baseR * Math.max(0.26, profile);
      const start = this.verts.length / 3;
      const off = this.spineOffset(0.2 + t * 0.4);

      const spineIdx = this.spineNodes[
        Math.min(this.spineNodes.length - 1, Math.max(1, Math.round(this.ribs.length * (0.22 + t * 0.42))))
      ];

      const step = (Math.PI * 2) / coreSegments;
      for (let s = 0; s < coreSegments; s++) {
        const ang = s * step;
        const lobe = 1.0 + Math.cos(ang * 4) * 0.24 * profile + Math.cos(ang * 8) * 0.06;
        const px = off.x + Math.cos(ang) * ringR * lobe;
        const pz = off.z + Math.sin(ang) * ringR * lobe;
        const py = yPos + Math.cos(ang * 4) * bellHeight * 0.024 * profile;
        this.verts.push(px, py, pz);
        this.uvs.push(s / coreSegments, t);
      }

      this.queueWeights(start, coreSegments, 0.48 + 0.16 * t);
      const { outerConstraints, innerConstraints } = this.buildRingConstraints(
        start,
        coreSegments,
        [0.92, 1.08],
        [0.92, 1.08],
      );

      const spokeConstraints: ScalableConstraint[] = [];
      for (let s = 0; s < coreSegments; s += 2) {
        const vIdx = start + s;
        const d = Math.max(0.1, Particulate.Vec3.distance(this.verts, spineIdx, vIdx));
        const rest: [number, number] = [d * 0.92, d * 1.08];
        const c = Particulate.DistanceConstraint.create(rest, [spineIdx, vIdx]);
        spokeConstraints.push({ constraint: c, rest });
        this.queueConstraints(c);
      }

      this.coreRibs.push({
        start,
        spineIndex: spineIdx,
        radius: ringR,
        centerX: off.x,
        centerZ: off.z,
        yParam: t,
        yPos,
        outerConstraints,
        innerConstraints,
        spokeConstraints,
      });

      if (r === 0) {
        radialFaces(capIdx, start, coreSegments, this.gastricCoreFaces);
        // Anchor top core ring directly to cap & upper spine so the core never twists loosely
        for (let s = 0; s < coreSegments; s += 2) {
          const vIdx = start + s;
          const dTop = Math.max(0.1, Particulate.Vec3.distance(this.verts, capIdx, vIdx));
          this.queueConstraints(Particulate.DistanceConstraint.create([dTop * 0.94, dTop * 1.06], [capIdx, vIdx]));
        }
      } else {
        const prev = this.coreRibs[r - 1];
        for (let s = 0; s < coreSegments; s++) {
          const a = prev.start + s;
          const b = start + s;
          const bNext = start + ((s + 1) % coreSegments);
          const d = Math.max(0.05, Particulate.Vec3.distance(this.verts, a, b));
          const dDiag = Math.max(0.05, Particulate.Vec3.distance(this.verts, a, bNext));
          this.queueConstraints(
            Particulate.DistanceConstraint.create([d * 0.94, d * 1.06], [a, b]),
            Particulate.DistanceConstraint.create([dDiag * 0.94, dDiag * 1.06], [a, bNext]),
          );
        }
        ringFaces(prev.start, start, coreSegments, this.gastricCoreFaces);
      }
    }

    // Stabilize bottom core throat ring vertically toward pinBottom so oral-arm roots stay coaxial
    const bottomCore = this.coreRibs[this.coreRibs.length - 1];
    for (let s = 0; s < coreSegments; s += 4) {
      const vIdx = bottomCore.start + s;
      const dPin = Math.max(0.1, Particulate.Vec3.distance(this.verts, this.pinBottom, vIdx));
      this.queueConstraints(Particulate.DistanceConstraint.create([dPin * 0.88, dPin * 1.12], [this.pinBottom, vIdx]));
    }

    this.appendageRanges.core = [rangeStart, this.verts.length / 3];
  }

  // ...................................................
  // 4. Apex Stamen Antennae (Ref 4 — Soft-Body Buoyant Particulate Filaments)
  // ...................................................
  private createApexStamens(): void {
    const count = 7;
    const segs = 7;
    const crownRib = this.ribs[Math.min(3, this.ribs.length - 1)];
    const segments = this.cfg.totalSegments;
    const rangeStart = this.verts.length / 3;

    for (let i = 0; i < count; i++) {
      const segIdx = Math.floor((i / count) * segments) % segments;
      const rootIdx = crownRib.start + segIdx;
      const rx = this.verts[rootIdx * 3];
      const ry = this.verts[rootIdx * 3 + 1];
      const rz = this.verts[rootIdx * 3 + 2];

      // Graceful outward botanical spray angle (never rigid vertical spikes!)
      const angle = (i / count) * Math.PI * 2 + 0.35;
      const totalH = this.cfg.size * (0.34 + (i % 3) * 0.08);
      const fanOut = this.cfg.ribRadius * (0.48 + (i % 2) * 0.22);
      const nodeIndices: number[] = [rootIdx];

      for (let s = 1; s <= segs; s++) {
        const t = s / segs;
        const idx = this.verts.length / 3;
        const arch = Math.pow(t, 1.25);
        const px = rx + Math.cos(angle) * fanOut * arch;
        const py = ry + totalH * Math.sin(t * Math.PI * 0.52);
        const pz = rz + Math.sin(angle) * fanOut * arch;
        this.verts.push(px, py, pz);
        this.uvs.push(i / count, t);
        this.queueWeights(idx, 1, 0.38 + 0.42 * t);
        nodeIndices.push(idx);
      }

      for (let s = 1; s < nodeIndices.length; s++) {
        const a = nodeIndices[s - 1];
        const b = nodeIndices[s];
        const d = Math.max(0.1, Particulate.Vec3.distance(this.verts, a, b));
        this.queueConstraints(Particulate.DistanceConstraint.create([d * 0.95, d * 1.05], [a, b]));
        if (s >= 2) {
          // Mass-weighted 2nd-neighbor bending spring (zero AngleConstraint root-yanking!)
          const prev2 = nodeIndices[s - 2];
          const d2 = Math.max(0.1, Particulate.Vec3.distance(this.verts, prev2, b));
          this.queueConstraints(Particulate.DistanceConstraint.create([d2 * 0.92, d2 * 1.08], [prev2, b]));
        }
      }
      // Subtle root bracing to adjacent bell vertex so stamens emerge perpendicular to the crown
      const rootAdj = crownRib.start + ((segIdx + 1) % segments);
      const dRootBrace = Math.max(0.1, Particulate.Vec3.distance(this.verts, rootAdj, nodeIndices[1]));
      this.queueConstraints(Particulate.DistanceConstraint.create([dRootBrace * 0.9, dRootBrace * 1.12], [rootAdj, nodeIndices[1]]));

      this.stamenChains.push({
        nodeIndices,
        baseRadius: 0.2,
        tipRadius: 0.12,
        radialSegments: 8,
        hasBulbTip: true,
        bulbScale: 3.3,
        isStamen: true,
      });
    }

    const rangeEnd = this.verts.length / 3;
    if (rangeEnd > rangeStart) {
      this.appendageRanges.stamens = [rangeStart, rangeEnd];
    }
  }

  // ...................................................
  // 5. Full-Width Inner Bell / Subumbrella (`particulate-medusae` `tailRibs`)
  //    Starts flush at outer bell margin (`attachRib`) and sweeps ALL THE WAY IN
  //    across 10–14 concentric rings to ~15% radius, vaulting gently into the bell
  //    cavity and pulsing in exact lock-step with the outer bell!
  //    Oral arms and tentacles anchor cleanly across `subumbrellaRibAt(frac)`.
  // ...................................................
  private getSubumbrellaAttachRib(): RibData {
    const bellMode = this.cfg.bellShapeMode ?? 'dome';
    // For wide upturned flower bells (Lotus / Orchid), anchor the inner bell
    // beneath the sculpted calyx throat rather than dangling off extreme petal tips.
    if (bellMode === 'lotusCalyx' || bellMode === 'orchidCrown') {
      const idx = Math.max(2, Math.round((this.ribs.length - 1) * 0.60));
      return this.ribs[idx];
    }
    return this.ribs[this.ribs.length - 1];
  }

  /**
   * Indexes across the full-width inner bell (`tailRibs`) just like `Medusae.js` `ribAt`:
   * `frac = 0` -> innermost vault ring (~15% of outer bell radius)
   * `frac = 1` -> outermost subumbrella ring (~94% of outer bell radius)
   */
  private subumbrellaRibAt(frac: number): RibData {
    const clamped = Math.max(0, Math.min(1, frac));
    const count = this.tailRibs.length;
    if (count === 0) return this.getSubumbrellaAttachRib();
    const idx = Math.max(0, Math.min(count - 1, Math.round((1 - clamped) * (count - 1))));
    return this.tailRibs[idx];
  }

  private createTail(): void {
    const visibleSkirt = (this.spec.features?.tail ?? true) && this.cfg.tailRibsCount > 0;
    const needsSubumbrellaAnchors =
      visibleSkirt ||
      (this.spec.features?.mouth ?? true) ||
      (this.spec.features?.tentacles ?? true);
    if (!needsSubumbrellaAnchors) return;

    // Respect configured skirt ring count (6–12); lightweight 6-ring full-width
    // structural scaffold when skirt mesh is hidden (exact same 0.94 -> 0.15 span!).
    const ribsCount = visibleSkirt
      ? Math.max(6, Math.min(12, this.cfg.tailRibsCount || 10))
      : 6;
    const rangeStart = this.verts.length / 3;
    const attachRib = this.getSubumbrellaAttachRib();

    for (let i = 0; i < ribsCount; i++) {
      this.createTailRib(i, ribsCount, attachRib);
      this.createTailSkin(i - 1, i, attachRib, visibleSkirt);
    }

    // Radial spokes closing the innermost inner-bell ring cleanly to the central spine cavity
    // (faithful to `Medusae.js:514`: innermost tail rib spoked to `indexMid`!)
    const innerMost = this.tailRibs[this.tailRibs.length - 1];
    const segments = this.cfg.totalSegments;
    const cavitySpine = this.spineNodes[Math.min(this.spineNodes.length - 1, Math.max(1, Math.round(this.spineNodes.length * 0.56)))];
    for (let s = 0; s < segments; s += 2) {
      const vIdx = innerMost.start + s;
      const d = Math.max(0.2, Particulate.Vec3.distance(this.verts, cavitySpine, vIdx));
      const rest: [number, number] = [d * 0.90, d * 1.10];
      const c = Particulate.DistanceConstraint.create(rest, [cavitySpine, vIdx]);
      if (!innerMost.spokeConstraints) innerMost.spokeConstraints = [];
      innerMost.spokeConstraints.push({ constraint: c, rest });
      this.queueConstraints(c);
    }

    this.appendageRanges.skirt = [rangeStart, this.verts.length / 3];
  }

  private createTailRib(index: number, total: number, attachRib: RibData): void {
    const segments = this.cfg.totalSegments;
    const bellHeight = Math.max(12, this.posTop - this.posBottom);
    const t = (index + 1) / total; // 0 = outer bell rim, 1 = innermost inner-bell vault
    const skirtStyle = this.cfg.skirtStyle ?? 'innerBell';

    // Full-width radial sweep faithful to `Medusae.js:491` (`0.94 -> 0.15` of actual outer bell cross-section!)
    const baseRadialFrac = Math.max(
      0.15,
      Math.sin(0.25 * t * Math.PI + 0.5 * Math.PI) * (1.0 - 0.84 * t),
    );
    let radialFrac = baseRadialFrac;
    if (skirtStyle === 'concentricFrill') {
      radialFrac = Math.max(0.16, baseRadialFrac * (1.0 + Math.sin(t * Math.PI * 2.5) * 0.08));
    } else if (skirtStyle === 'velvetCollar') {
      radialFrac = Math.max(0.16, baseRadialFrac * (0.98 - 0.06 * Math.sin(t * Math.PI)));
    } else if (skirtStyle === 'gastricFlower') {
      radialFrac = Math.max(0.16, baseRadialFrac * (1.0 + Math.sin(t * Math.PI) * 0.06));
    }

    // Vertical vault curve relative to each outer bell margin vertex
    let yOffsetCurve = Math.sin(t * Math.PI * 0.85) * bellHeight * 0.18 - Math.pow(1 - t, 2) * bellHeight * 0.03;
    if (skirtStyle === 'concentricFrill') {
      yOffsetCurve = -Math.sin(t * Math.PI) * bellHeight * 0.12 + Math.sin(t * Math.PI * 3.0) * bellHeight * 0.035 + t * bellHeight * 0.14;
    } else if (skirtStyle === 'velvetCollar') {
      yOffsetCurve = -Math.sin(t * Math.PI) * bellHeight * 0.15 + t * bellHeight * 0.12;
    } else if (skirtStyle === 'gastricFlower') {
      yOffsetCurve = -Math.sin(t * Math.PI) * bellHeight * 0.10 + t * bellHeight * 0.14;
    } else if (skirtStyle === 'emeraldVeils') {
      yOffsetCurve = -Math.sin(t * Math.PI * 0.85) * bellHeight * 0.22 + t * bellHeight * 0.12;
    }

    const start = this.verts.length / 3;
    const centerX = attachRib.centerX ?? 0;
    const centerZ = attachRib.centerZ ?? 0;
    const step = (Math.PI * 2) / segments;
    let avgRadius = 0;
    let avgY = 0;

    // Derive EVERY inner-bell vertex directly from the REAL outer bell ring vertex!
    // Automatically conforms to ANY bell silhouette, cross-section, lobes, flare, and size.
    for (let s = 0; s < segments; s++) {
      const ang = s * step;
      const aIdx = attachRib.start + s;
      const ax = this.verts[aIdx * 3];
      const ay = this.verts[aIdx * 3 + 1];
      const az = this.verts[aIdx * 3 + 2];

      let styleMod = 1.0;
      let styleDy = 0;
      if (skirtStyle === 'concentricFrill') {
        styleMod = 1.0 + Math.sin(ang * 14 + t * 2.4) * 0.065 * Math.sin(t * Math.PI);
        styleDy = Math.cos(ang * 14 + t * 2.0) * bellHeight * 0.018 * Math.sin(t * Math.PI);
      } else if (skirtStyle === 'velvetCollar') {
        styleMod = 1.0 + Math.cos(ang * 6) * 0.09 * Math.sin(t * Math.PI);
        styleDy = -Math.abs(Math.cos(ang * 3)) * bellHeight * 0.03 * Math.sin(t * Math.PI);
      } else if (skirtStyle === 'gastricFlower') {
        styleMod = 1.0 + Math.cos(ang * 8) * 0.08 * Math.sin(t * Math.PI);
      } else if (skirtStyle === 'emeraldVeils') {
        styleMod = 1.0 + Math.sin(ang * 10) * 0.055 * Math.sin(t * Math.PI);
      }

      const effFrac = Math.max(0.10, radialFrac * styleMod);
      const px = centerX + (ax - centerX) * effFrac;
      const pz = centerZ + (az - centerZ) * effFrac;
      const py = ay + yOffsetCurve + styleDy;

      this.verts.push(px, py, pz);
      avgRadius += Math.hypot(px - centerX, pz - centerZ);
      avgY += py;
    }

    avgRadius /= segments;
    avgY /= segments;
    ribUvs(t, segments, this.uvs);

    // Lighter near outer rim so it tracks outer bell effortlessly, slightly firmer inward
    this.queueWeights(start, segments, 0.36 + 0.16 * (1 - t));

    const outerConstraints: ScalableConstraint[] = [];
    const innerConstraints: ScalableConstraint[] = [];
    for (let i = 0; i < segments; i++) {
      const a = start + i;
      const b = start + ((i + 1) % segments);
      const d = Math.max(0.05, Particulate.Vec3.distance(this.verts, a, b));
      const rest: [number, number] = [d * 0.93, d * 1.08];
      const c = Particulate.DistanceConstraint.create(rest, [a, b]);
      outerConstraints.push({ constraint: c, rest });
      this.queueConstraints(c);
    }
    const chordStep = Math.max(2, Math.floor(segments / 3));
    for (let i = 0; i < segments; i += 2) {
      const a = start + i;
      const b = start + ((i + chordStep) % segments);
      const d = Math.max(0.05, Particulate.Vec3.distance(this.verts, a, b));
      const rest: [number, number] = [d * 0.93, d * 1.08];
      const c = Particulate.DistanceConstraint.create(rest, [a, b]);
      innerConstraints.push({ constraint: c, rest });
      this.queueConstraints(c);
    }

    // Spoke every inner-bell ring gently to a matching interior spine node so it pulses
    // coaxially in lock-step with the outer bell and never collapses sideways!
    const spinePosIdx = Math.min(
      this.spineNodes.length - 1,
      Math.max(1, Math.round((this.spineNodes.length - 1) * (0.94 - t * 0.36))),
    );
    const spineIndex = this.spineNodes[spinePosIdx];
    const spokeConstraints: ScalableConstraint[] = [];
    for (let s = 0; s < segments; s += 4) {
      const vIdx = start + s;
      const d = Math.max(0.15, Particulate.Vec3.distance(this.verts, spineIndex, vIdx));
      const rest: [number, number] = [d * 0.90, d * 1.10];
      const c = Particulate.DistanceConstraint.create(rest, [spineIndex, vIdx]);
      spokeConstraints.push({ constraint: c, rest });
      this.queueConstraints(c);
    }

    this.tailRibs.push({
      start,
      spineIndex,
      // yParam = 1 at outer bell margin -> 0 at innermost cavity ring (matches `Medusae.js:526`!)
      yParam: 1 - t,
      yPos: avgY,
      radius: avgRadius,
      radiusOuter: avgRadius,
      centerX,
      centerZ,
      outerConstraints,
      innerConstraints,
      spokeConstraints,
    });
  }

  private createTailSkin(r0: number, r1: number, attachRib: RibData, emitFaces: boolean): void {
    const segments = this.cfg.totalSegments;
    const rib0 = r0 < 0 ? attachRib : this.tailRibs[r0];
    const rib1 = this.tailRibs[r1];

    // Alternating diagonal shear bracing (matches outer bell `createSkin` — 33% lighter & equally smooth!)
    for (let i = 0; i < segments; i++) {
      const a = rib0.start + i;
      const b = rib1.start + i;
      const diagPartner =
        r1 % 2 === 0
          ? rib1.start + ((i + 1) % segments)
          : rib1.start + ((i - 1 + segments) % segments);
      const d = Math.max(0.05, Particulate.Vec3.distance(this.verts, a, b));
      const dDiag = Math.max(0.05, Particulate.Vec3.distance(this.verts, a, diagPartner));
      this.queueConstraints(
        Particulate.DistanceConstraint.create([d * 0.92, d * 1.08], [a, b]),
        Particulate.DistanceConstraint.create([dDiag * 0.91, dDiag * 1.09], [a, diagPartner]),
      );
    }

    if (emitFaces) {
      ringFaces(rib0.start, rib1.start, segments, this.tailFaces);
    }
  }

  // ...................................................
  // 6. Subumbrella-Anchored Discrete Tentacles (`particulate-medusae` architecture)
  //    Anchored across concentric inner-bell rings (`subumbrellaRibAt(0.76..0.95)`),
  //    NEVER pasted on the outer dome shell! Uses Jay Weeks's cubic mass ramp (`t³`)
  //    so bell + inner-bell pulses propagate silky traveling waves down every strand.
  // ...................................................
  private getTentacleRingFracs(): number[] {
    const bellMode = this.cfg.bellShapeMode ?? 'dome';
    const profile = this.cfg.tentacleProfile ?? 'filaments';
    if (bellMode === 'lotusCalyx' || bellMode === 'orchidCrown') {
      // Beneath floral calyx throat so strands cascade cleanly from inside the blossom
      if (profile === 'bulbFilaments' || profile === 'beadedArms') {
        return [0.58, 0.78];
      }
      return [0.52, 0.68, 0.84];
    }
    if (profile === 'bulbFilaments' || profile === 'beadedArms') {
      return [0.72, 0.88];
    }
    // Authentic `particulate-medusae` 3 concentric subumbrella margin rings!
    return [0.76, 0.86, 0.95];
  }

  private createDiscreteTentacles(): void {
    if (this.cfg.tentacleSegments <= 0) return;
    if (this.tentacleAttachRibs.length === 0) return;

    const rangeStart = this.verts.length / 3;
    const profile = this.cfg.tentacleProfile ?? 'filaments';
    const isTubeStyle = this.spec.tentacleStyle === 'tube';
    const requestedCount = this.tentacleAttachRibs.length;

    if (
      isTubeStyle ||
      profile === 'crystalTendrils' ||
      profile === 'bulbFilaments' ||
      profile === 'beadedArms' ||
      profile === 'tubes' ||
      profile === 'tendrils'
    ) {
      this.createVerletTubeStrands(requestedCount, false);
    } else if (profile === 'curtain' || profile === 'fringe') {
      const ribbonCount = Math.max(10, Math.min(18, requestedCount <= 4 ? 14 : requestedCount));
      this.createDiscreteRibbonStrands(ribbonCount);
    } else {
      const filamentCount = Math.max(18, Math.min(30, requestedCount <= 4 ? 24 : requestedCount));
      this.createVerletTubeStrands(filamentCount, true);
    }

    const rangeEnd = this.verts.length / 3;
    if (rangeEnd > rangeStart) {
      this.appendageRanges.tentacles = [rangeStart, rangeEnd];
    }
  }

  private createVerletTubeStrands(requestedCount: number, isFilamentMode: boolean): void {
    const profile = this.cfg.tentacleProfile ?? 'tubes';
    const segments = this.cfg.totalSegments;
    const strandCount = isFilamentMode
      ? Math.max(16, Math.min(30, requestedCount))
      : Math.max(6, Math.min(20, requestedCount));

    const ringFracs = this.getTentacleRingFracs();
    const outerSubRib = this.subumbrellaRibAt(ringFracs[ringFracs.length - 1]);

    const isBulb = !isFilamentMode && profile === 'bulbFilaments';
    const isBeaded = !isFilamentMode && profile === 'beadedArms';
    const isCrystal = !isFilamentMode && profile === 'crystalTendrils';
    const isStippled = isFilamentMode && profile === 'stippledCurtain';

    const nodeSteps = isFilamentMode ? 16 : isBulb ? 17 : isBeaded ? 15 : 16;
    const baseLen = Math.max(
      28,
      this.cfg.tentacleSegments * this.cfg.tentacleSegmentLength * (
        isStippled ? 0.86 : isFilamentMode ? 0.80 : isBeaded ? 0.58 : isBulb ? 0.70 : 0.68
      ),
    );

    const baseRadius = isStippled
      ? 0.30
      : isFilamentMode
        ? 0.22
        : isBulb
          ? 0.34
          : isBeaded
            ? Math.max(0.68, Math.min(1.22, outerSubRib.radius * 0.085))
            : isCrystal
              ? Math.max(0.36, Math.min(0.72, outerSubRib.radius * 0.048))
              : Math.max(0.50, Math.min(1.05, outerSubRib.radius * 0.072));

    const tipRadius = isFilamentMode ? 0.04 : isBulb ? 0.12 : Math.max(0.07, baseRadius * 0.16);

    for (let i = 0; i < strandCount; i++) {
      // Distribute evenly across concentric subumbrella rings with staggered azimuths
      const ringIdx = i % ringFracs.length;
      const attachRib = this.subumbrellaRibAt(ringFracs[ringIdx]);
      const cx = attachRib.centerX ?? 0;
      const cz = attachRib.centerZ ?? 0;

      const idxInRing = Math.floor(i / ringFracs.length);
      const countInRing = Math.max(1, Math.ceil((strandCount - ringIdx) / ringFracs.length));
      const stagger = (ringIdx / ringFracs.length) * (segments / countInRing) * 0.5;
      const segIdx = Math.floor((idxInRing / countInRing) * segments + stagger) % segments;

      const rootIdx = attachRib.start + segIdx;
      const rootAdj = attachRib.start + ((segIdx + 1) % segments);
      const bx = this.verts[rootIdx * 3];
      const by = this.verts[rootIdx * 3 + 1];
      const bz = this.verts[rootIdx * 3 + 2];

      const dx = bx - cx;
      const dz = bz - cz;
      const radialDist = Math.hypot(dx, dz) || 1;
      const rx = dx / radialDist;
      const rz = dz / radialDist;
      const tx = -rz;
      const tz = rx;

      // Natural biological length variation (inner rings slightly shorter, outer rings longer)
      const ringLenBoost = 0.88 + (ringIdx / Math.max(1, ringFracs.length - 1)) * 0.22;
      const lenMod = (0.80 + 0.30 * (((i * 7 + 3) % 11) / 10)) * ringLenBoost;
      const totalLen = baseLen * lenMod;
      const stepLen = totalLen / nodeSteps;

      const nodeIndices: number[] = [rootIdx];

      for (let s = 1; s <= nodeSteps; s++) {
        const t = s / nodeSteps;
        const idx = this.verts.length / 3;

        let outOffset = 0;
        let swayOffset = 0;

        if (isBeaded) {
          // Graceful inward-then-outward sculptural opal arc (starts strictly inside rim)
          outOffset = Math.sin(t * Math.PI) * attachRib.radius * 0.32 - t * attachRib.radius * 0.16;
          swayOffset = Math.sin(t * Math.PI * 1.2 + i) * 0.8;
        } else if (isBulb) {
          // Delicate orchid filaments emerging smoothly underneath throat then flaring softly
          outOffset = -radialDist * 0.14 * (1 - t) + Math.sin(t * Math.PI * 1.1) * 2.4;
          swayOffset = Math.sin(t * Math.PI * 1.4 + i * 1.3) * 1.4 * t;
        } else if (isCrystal) {
          // Sleek tapering glass tendrils streaming cleanly beneath the crystal subumbrella
          outOffset = -radialDist * 0.10 * t + Math.sin(t * Math.PI) * attachRib.radius * 0.08;
          swayOffset = Math.sin(t * Math.PI * 1.2 + i) * 0.65 * t;
        } else if (isStippled) {
          // Flowing stippled curtain strands hanging cleanly from inner lotus throat
          outOffset = -radialDist * 0.16 * Math.pow(t, 0.85);
          swayOffset = Math.cos(t * Math.PI * 1.4 + i * 1.1) * 0.85 * t;
        } else {
          // Classic hair-fine pelagic filaments trailing directly down from subumbrella rings
          outOffset = -radialDist * 0.08 * t;
          swayOffset = Math.sin(t * Math.PI * 1.5 + i * 1.1) * 0.9 * t;
        }

        const px = bx + rx * outOffset + tx * swayOffset;
        const py = by - s * stepLen;
        const pz = bz + rz * outOffset + tz * swayOffset;

        this.verts.push(px, py, pz);
        this.uvs.push(i / strandCount, t);
        // Jay Weeks's cubic mass ramp: near-zero weight at root -> full trailing momentum at tips!
        this.queueWeights(idx, 1, cubicStrandWeight(t) * this.cfg.tentacleWeightFactor);
        nodeIndices.push(idx);
      }

      // Root tangent brace to adjacent vertex on the SAME subumbrella ring
      // -> emerges smoothly downward from the inner bell with zero poking or kinks!
      const dRootBrace = Math.max(0.15, Particulate.Vec3.distance(this.verts, rootAdj, nodeIndices[1]));
      this.queueConstraints(
        Particulate.DistanceConstraint.create([dRootBrace * 0.88, dRootBrace * 1.12], [rootAdj, nodeIndices[1]]),
      );

      // Segment distance springs + gentle 2nd-neighbor bend smoothing
      for (let s = 1; s < nodeIndices.length; s++) {
        const a = nodeIndices[s - 1];
        const b = nodeIndices[s];
        const d = Math.max(0.1, Particulate.Vec3.distance(this.verts, a, b));
        this.queueConstraints(Particulate.DistanceConstraint.create([d * 0.94, d * 1.05], [a, b]));
        this.tentLinks.push(a, b);

        if (s >= 2) {
          const prev2 = nodeIndices[s - 2];
          const d2 = Math.max(0.1, Particulate.Vec3.distance(this.verts, prev2, b));
          const bendMin = isBeaded || isCrystal || isBulb ? 0.86 : 0.80;
          const bendMax = isBeaded || isCrystal || isBulb ? 1.08 : 1.10;
          this.queueConstraints(Particulate.DistanceConstraint.create([d2 * bendMin, d2 * bendMax], [prev2, b]));
        }
      }

      // Slack bottom leash to `pinTentacle` (faithful to `Medusae.js:400`!)
      const midNode = nodeIndices[Math.floor(nodeIndices.length * 0.55)];
      const tipNode = nodeIndices[nodeIndices.length - 1];
      const dMidPin = Math.max(1.0, Particulate.Vec3.distance(this.verts, this.pinTentacle, midNode));
      const dTipPin = Math.max(1.0, Particulate.Vec3.distance(this.verts, this.pinTentacle, tipNode));
      this.queueConstraints(
        Particulate.DistanceConstraint.create([dMidPin * 0.68, dMidPin * 1.24], [this.pinTentacle, midNode]),
        Particulate.DistanceConstraint.create([dTipPin * 0.54, dTipPin * 1.18], [this.pinTentacle, tipNode]),
      );

      this.verletTubeChains.push({
        nodeIndices,
        baseRadius,
        tipRadius,
        radialSegments: isFilamentMode ? 6 : 8,
        hasBulbTip: isBulb,
        bulbScale: isBulb ? 3.2 : 1.0,
        isFilament: isFilamentMode,
        strandIndex: i,
        strandTotal: strandCount,
      });
    }
  }

  /**
   * Independent two-edge Particulate silk ribbon strands anchored cleanly across
   * concentric subumbrella rings (`subumbrellaRibAt(0.76..0.95)`).
   */
  private createDiscreteRibbonStrands(ribbonCount: number): void {
    const segments = this.cfg.totalSegments;
    const ringFracs = this.getTentacleRingFracs();
    const outerSubRib = this.subumbrellaRibAt(ringFracs[ringFracs.length - 1]);
    const nodeSteps = 14;
    const baseLen = Math.max(26, this.cfg.tentacleSegments * this.cfg.tentacleSegmentLength * 0.74);
    const baseWidth = Math.max(1.0, Math.min(2.1, outerSubRib.radius * 0.10));

    for (let i = 0; i < ribbonCount; i++) {
      const ringIdx = i % ringFracs.length;
      const attachRib = this.subumbrellaRibAt(ringFracs[ringIdx]);
      const cx = attachRib.centerX ?? 0;
      const cz = attachRib.centerZ ?? 0;

      const idxInRing = Math.floor(i / ringFracs.length);
      const countInRing = Math.max(1, Math.ceil((ribbonCount - ringIdx) / ringFracs.length));
      const stagger = (ringIdx / ringFracs.length) * (segments / countInRing) * 0.5;
      const segIdx = Math.floor((idxInRing / countInRing) * segments + stagger) % segments;

      const rootA = attachRib.start + segIdx;
      const rootB = attachRib.start + ((segIdx + 1) % segments);

      const bx = this.verts[rootA * 3];
      const by = this.verts[rootA * 3 + 1];
      const bz = this.verts[rootA * 3 + 2];

      const dx = bx - cx;
      const dz = bz - cz;
      const radialDist = Math.hypot(dx, dz) || 1;
      const rx = dx / radialDist;
      const rz = dz / radialDist;
      const tx = -rz;
      const tz = rx;

      const lenMod = 0.80 + 0.30 * (((i * 5 + 2) % 9) / 8);
      const stepLen = (baseLen * lenMod) / nodeSteps;

      const innerIndices: number[] = [rootA];
      const outerIndices: number[] = [rootB];

      for (let s = 1; s <= nodeSteps; s++) {
        const t = s / nodeSteps;
        const twist = t * Math.PI * 0.75 + i * 0.5;
        const w = baseWidth * (1.0 - t * 0.66);
        const sway = Math.sin(t * Math.PI * 1.4 + i) * 1.0 * t;
        const mx = bx - rx * radialDist * 0.08 * t + tx * sway;
        const my = by - s * stepLen;
        const mz = bz - rz * radialDist * 0.08 * t + tz * sway;

        const wx = (tx * Math.cos(twist) + rx * Math.sin(twist)) * w * 0.5;
        const wz = (tz * Math.cos(twist) + rz * Math.sin(twist)) * w * 0.5;

        const lIdx = this.verts.length / 3;
        point(mx - wx, my, mz - wz, this.verts);
        this.uvs.push(0.0, t);

        const rIdx = this.verts.length / 3;
        point(mx + wx, my, mz + wz, this.verts);
        this.uvs.push(1.0, t);

        const wgt = cubicStrandWeight(t) * this.cfg.tentacleWeightFactor;
        this.queueWeights(lIdx, 1, wgt);
        this.queueWeights(rIdx, 1, wgt);

        innerIndices.push(lIdx);
        outerIndices.push(rIdx);
      }

      for (let s = 1; s < innerIndices.length; s++) {
        const lPrev = innerIndices[s - 1];
        const lCurr = innerIndices[s];
        const rPrev = outerIndices[s - 1];
        const rCurr = outerIndices[s];

        const dW = Math.max(0.08, Particulate.Vec3.distance(this.verts, lCurr, rCurr));
        const dL = Math.max(0.1, Particulate.Vec3.distance(this.verts, lPrev, lCurr));
        const dR = Math.max(0.1, Particulate.Vec3.distance(this.verts, rPrev, rCurr));
        const dDiag1 = Math.max(0.1, Particulate.Vec3.distance(this.verts, lPrev, rCurr));
        const dDiag2 = Math.max(0.1, Particulate.Vec3.distance(this.verts, rPrev, lCurr));

        this.queueConstraints(
          Particulate.DistanceConstraint.create([dW * 0.90, dW * 1.10], [lCurr, rCurr]),
          Particulate.DistanceConstraint.create([dL * 0.92, dL * 1.07], [lPrev, lCurr]),
          Particulate.DistanceConstraint.create([dR * 0.92, dR * 1.07], [rPrev, rCurr]),
          Particulate.DistanceConstraint.create([dDiag1 * 0.90, dDiag1 * 1.10], [lPrev, rCurr]),
          Particulate.DistanceConstraint.create([dDiag2 * 0.90, dDiag2 * 1.10], [rPrev, lCurr]),
        );
        this.tentLinks.push(lPrev, lCurr);

        if (s >= 2) {
          const lPrev2 = innerIndices[s - 2];
          const dBend = Math.max(0.1, Particulate.Vec3.distance(this.verts, lPrev2, lCurr));
          this.queueConstraints(Particulate.DistanceConstraint.create([dBend * 0.84, dBend * 1.12], [lPrev2, lCurr]));
        }
      }

      const tipNode = innerIndices[innerIndices.length - 1];
      const dTipPin = Math.max(1.0, Particulate.Vec3.distance(this.verts, this.pinTentacle, tipNode));
      this.queueConstraints(
        Particulate.DistanceConstraint.create([dTipPin * 0.56, dTipPin * 1.22], [this.pinTentacle, tipNode]),
      );

      this.ribbonChains.push({
        innerIndices,
        outerIndices,
        widthCols: 4,
        lengthSubdivs: 42,
        ruffleAmp: 0.14,
        ruffleFreq: 4.5,
        crossCurve: 0.22,
        phaseOffset: i * 1.15,
        isOralArm: false,
      });
    }
  }

  // ...................................................
  // 7. Oral Arms — 6 Genuinely Distinct 3D Topologies
  //    Anchored WIDE across the full-width inner bell (`subumbrellaRibAt(frac)`),
  //    automatically scaling to ANY outer bell size/form with ZERO center clutter!
  // ...................................................
  private createMouth(): void {
    const totalArms = Math.max(2, Math.round(this.cfg.oralArmCount ?? 6));
    const shape = this.cfg.oralArmShape ?? 'ribbons';
    const rangeStart = this.verts.length / 3;

    if (shape === 'kelpFronds') {
      this.createKelpFrondOralArms(totalArms);
    } else if (shape === 'cauliflowerClusters') {
      this.createCauliflowerOralArms(totalArms);
    } else if (shape === 'helicalSpirals') {
      this.createHelicalAugerOralArms(totalArms);
    } else if (shape === 'petalCalyx') {
      this.createCuppedPetalOralArms(totalArms);
    } else if (shape === 'frilledLace') {
      this.createPleatedRosetteOralArms(totalArms);
    } else {
      this.createCurtainOralArms(totalArms, shape);
    }

    const rangeEnd = this.verts.length / 3;
    if (rangeEnd > rangeStart) {
      this.appendageRanges.oralArms = [rangeStart, rangeEnd];
    }
  }

  /**
   * TOPOLOGY 1: Multi-Tier Wide Subumbrella Radial Curtains
   * (`turingRibbons`, `flowingMane`, `ribbons`, `plumedCluster`)
   * Faithful to `Medusae.js:557-673`: each arm spans across TWO distinct concentric
   * inner-bell rings (`innerRib` -> `outerRib`) so width = real radial span across
   * the inner bell — ZERO center clutter!
   */
  private createCurtainOralArms(
    totalArms: number,
    shape: NonNullable<JellyfishGeometryConfig['oralArmShape']>,
  ): void {
    const innerTierCount = Math.max(2, Math.ceil(totalArms * 0.5));
    const outerTierCount = Math.max(0, totalArms - innerTierCount);

    // Tier 1: spans inner cavity out to mid-subumbrella (0.08 -> 0.48)
    const rIn0 = this.subumbrellaRibAt(0.08);
    const rOut0 = this.subumbrellaRibAt(0.48);
    for (let i = 0; i < innerTierCount; i++) {
      this.buildCurtainArm(1.0, rIn0, rOut0, i, innerTierCount, 0, shape, 0);
    }

    // Tier 2 (staggered): spans mid-inner out to wide subumbrella (0.28 -> 0.74)
    const rIn1 = this.subumbrellaRibAt(0.28);
    const rOut1 = this.subumbrellaRibAt(0.74);
    for (let i = 0; i < outerTierCount; i++) {
      const lenScale = shape === 'flowingMane' ? 0.84 : shape === 'turingRibbons' ? 0.86 : 0.76;
      this.buildCurtainArm(lenScale, rIn1, rOut1, i, outerTierCount, 0.5, shape, 1);
    }
  }

  private buildCurtainArm(
    vScale: number,
    innerRib: RibData,
    outerRib: RibData,
    index: number,
    total: number,
    angleStagger: number,
    shape: NonNullable<JellyfishGeometryConfig['oralArmShape']>,
    tier: number,
  ): void {
    const segments = this.cfg.totalSegments;
    const tParam = (index + angleStagger) / Math.max(1, total);
    const segIdx = Math.floor(tParam * segments) % segments;

    // REAL 2-ring radial anchoring directly on the full-width inner bell!
    const innerPin = innerRib.start + segIdx;
    const outerPin = outerRib.start + segIdx;

    const ipx = this.verts[innerPin * 3];
    const ipy = this.verts[innerPin * 3 + 1];
    const ipz = this.verts[innerPin * 3 + 2];
    const opx = this.verts[outerPin * 3];
    const opy = this.verts[outerPin * 3 + 1];
    const opz = this.verts[outerPin * 3 + 2];

    const spanX = opx - ipx;
    const spanZ = opz - ipz;
    const realSpan = Math.max(2.0, Math.hypot(spanX, spanZ));
    const rx = spanX / realSpan;
    const rz = spanZ / realSpan;
    const tx = -rz;
    const tz = rx;

    const widthMul = Math.max(0.65, Math.min(1.65, this.cfg.oralArmWidth ?? 1.0));
    const curlMul = this.cfg.oralArmCurl ?? 1.0;

    const maxSegs = Math.max(12, Math.min(18, Math.round(this.cfg.tailArmSegments * 0.52)));
    const nodeSteps = Math.max(10, Math.round(vScale * maxSegs));
    const totalLength = Math.max(18, vScale * this.cfg.tailArmSegments * this.cfg.tailArmSegmentLength);
    const innerStep = totalLength / nodeSteps;

    const innerIndices: number[] = [innerPin];
    const outerIndices: number[] = [outerPin];

    for (let s = 1; s <= nodeSteps; s++) {
      const t = s / nodeSteps;
      const sway = Math.sin(t * Math.PI * 1.5 + index * 1.4) * (shape === 'turingRibbons' ? 1.8 : 1.1) * t;
      // Gently gather inward near the very bottom tip while keeping upper 65% wide and open!
      const gather = 1.0 - Math.pow(t, 1.5) * 0.25;
      const cx = innerRib.centerX ?? 0;
      const cz = innerRib.centerZ ?? 0;
      const ix = cx + (ipx - cx) * gather + tx * sway;
      const iz = cz + (ipz - cz) * gather + tz * sway;
      const iy = ipy - s * innerStep;

      const widthEnv =
        shape === 'turingRibbons'
          ? Math.max(0.32, Math.sin(Math.PI * (0.14 + 0.80 * t)) * 1.12 + 0.18 * (1 - t))
          : shape === 'flowingMane'
            ? Math.max(0.28, Math.sin(Math.PI * (0.12 + 0.82 * t)) * 1.02 + 0.20 * (1 - t))
            : Math.max(0.24, Math.sin(Math.PI * 0.5 + Math.PI * 0.44 * t));
      const bladeW = realSpan * widthEnv * (0.72 + 0.28 * widthMul);

      const twist = t * Math.PI * (shape === 'turingRibbons' ? 0.65 : 0.45) * Math.min(1.3, curlMul);
      const bx = rx * Math.cos(twist) - rz * Math.sin(twist);
      const bz = rx * Math.sin(twist) + rz * Math.cos(twist);

      const ox = ix + bx * bladeW;
      const oy = opy - s * innerStep * 0.99;
      const oz = iz + bz * bladeW;

      const innerIdx = this.verts.length / 3;
      point(ix, iy, iz, this.verts);
      this.uvs.push(t, 0);

      const outerIdx = this.verts.length / 3;
      point(ox, oy, oz, this.verts);
      this.uvs.push(t, 1);

      const w = (0.12 + 0.88 * t * t) * Math.max(0.45, this.cfg.tailArmWeight);
      this.queueWeights(innerIdx, 1, w);
      this.queueWeights(outerIdx, 1, w * 1.06);

      innerIndices.push(innerIdx);
      outerIndices.push(outerIdx);
    }

    // Hyperbolic cross-braced cloth ladder (faithful to `Medusae.js:619-660`)
    const constraints: Particulate.Constraint[] = [];
    for (let s = 1; s < innerIndices.length; s++) {
      const iPrev = innerIndices[s - 1];
      const iCurr = innerIndices[s];
      const oPrev = outerIndices[s - 1];
      const oCurr = outerIndices[s];

      const dW = Math.max(0.2, Particulate.Vec3.distance(this.verts, iCurr, oCurr));
      const dIn = Math.max(0.1, Particulate.Vec3.distance(this.verts, iPrev, iCurr));
      const dOut = Math.max(0.1, Particulate.Vec3.distance(this.verts, oPrev, oCurr));
      const dDiag1 = Math.max(0.1, Particulate.Vec3.distance(this.verts, iPrev, oCurr));
      const dDiag2 = Math.max(0.1, Particulate.Vec3.distance(this.verts, oPrev, iCurr));

      // Slight hyperbolic outer-edge excess lets the margin flutter organically
      const hyperOut = shape === 'turingRibbons' ? 1.16 : 1.09;
      constraints.push(
        Particulate.DistanceConstraint.create([dW * 0.88, dW * 1.12], [iCurr, oCurr]),
        Particulate.DistanceConstraint.create([dIn * 0.92, dIn * 1.08], [iPrev, iCurr]),
        Particulate.DistanceConstraint.create([dOut * 0.92, dOut * hyperOut], [oPrev, oCurr]),
        Particulate.DistanceConstraint.create([dDiag1 * 0.86, dDiag1 * 1.14], [iPrev, oCurr]),
        Particulate.DistanceConstraint.create([dDiag2 * 0.86, dDiag2 * 1.14], [oPrev, iCurr]),
      );

      if (s >= 2) {
        const iPrev2 = innerIndices[s - 2];
        const oPrev2 = outerIndices[s - 2];
        const dIn2 = Math.max(0.1, Particulate.Vec3.distance(this.verts, iPrev2, iCurr));
        const dOut2 = Math.max(0.1, Particulate.Vec3.distance(this.verts, oPrev2, oCurr));
        constraints.push(
          Particulate.DistanceConstraint.create([dIn2 * 0.86, dIn2 * 1.12], [iPrev2, iCurr]),
          Particulate.DistanceConstraint.create([dOut2 * 0.86, dOut2 * 1.14], [oPrev2, oCurr]),
        );
      }
    }

    const midArm = innerIndices[Math.floor(innerIndices.length * 0.55)];
    const tipArm = innerIndices[innerIndices.length - 1];
    const dMidTail = Math.max(1.0, Particulate.Vec3.distance(this.verts, this.pinTail, midArm));
    const dTipTail = Math.max(1.0, Particulate.Vec3.distance(this.verts, this.pinTail, tipArm));
    constraints.push(
      Particulate.DistanceConstraint.create([dMidTail * 0.65, dMidTail * 1.28], [this.pinTail, midArm]),
      Particulate.DistanceConstraint.create([dTipTail * 0.54, dTipTail * 1.25], [this.pinTail, tipArm]),
    );
    this.queueConstraints(constraints);

    this.oralArmRigs.push({
      kind: 'curtain',
      innerIndices,
      outerIndices,
      widthCols: 5,
      lengthSubdivs: 48,
      ruffleAmp: (shape === 'turingRibbons' ? 0.34 : shape === 'flowingMane' ? 0.26 : 0.16) * Math.min(1.3, 0.72 + curlMul * 0.3),
      ruffleFreq: shape === 'turingRibbons' ? 5.8 : shape === 'flowingMane' ? 4.6 : 3.8,
      crossCurve: 0.22,
      phaseOffset: index * 1.37 + tier * 0.9,
      shapeMode: shape,
    });
  }

  /**
   * Helper: creates a clean Particulate Verlet stalk anchored onto a live vertex of
   * `attachRib` (with root-adjacent tangent bracing + 2nd-neighbor smoothness + slack pinTail leash).
   */
  private buildSubumbrellaStalk(
    attachRib: RibData,
    segIdx: number,
    nodeSteps: number,
    totalLen: number,
    archOutFrac: number,
    swayAmp: number,
    phase: number,
    weightScale: number,
  ): number[] {
    const segments = this.cfg.totalSegments;
    const rootIdx = attachRib.start + segIdx;
    const rootAdj = attachRib.start + ((segIdx + 1) % segments);
    const bx = this.verts[rootIdx * 3];
    const by = this.verts[rootIdx * 3 + 1];
    const bz = this.verts[rootIdx * 3 + 2];
    const cx = attachRib.centerX ?? 0;
    const cz = attachRib.centerZ ?? 0;
    const dx = bx - cx;
    const dz = bz - cz;
    const rDist = Math.hypot(dx, dz) || 1;
    const rx = dx / rDist;
    const rz = dz / rDist;
    const tx = -rz;
    const tz = rx;

    const stepLen = totalLen / nodeSteps;
    const stalkIndices: number[] = [rootIdx];

    for (let s = 1; s <= nodeSteps; s++) {
      const t = s / nodeSteps;
      const arch = Math.sin(t * Math.PI * 0.92) * attachRib.radius * archOutFrac;
      const sway = Math.sin(t * Math.PI * 1.4 + phase) * swayAmp * t;
      const px = bx + rx * arch + tx * sway;
      const py = by - s * stepLen;
      const pz = bz + rz * arch + tz * sway;

      const idx = this.verts.length / 3;
      point(px, py, pz, this.verts);
      this.uvs.push(t, 0.5);
      this.queueWeights(idx, 1, cubicStrandWeight(t) * weightScale);
      stalkIndices.push(idx);
    }

    const dRootBrace = Math.max(0.15, Particulate.Vec3.distance(this.verts, rootAdj, stalkIndices[1]));
    this.queueConstraints(
      Particulate.DistanceConstraint.create([dRootBrace * 0.88, dRootBrace * 1.12], [rootAdj, stalkIndices[1]]),
    );

    for (let s = 1; s < stalkIndices.length; s++) {
      const a = stalkIndices[s - 1];
      const b = stalkIndices[s];
      const d = Math.max(0.1, Particulate.Vec3.distance(this.verts, a, b));
      this.queueConstraints(Particulate.DistanceConstraint.create([d * 0.94, d * 1.06], [a, b]));
      if (s >= 2) {
        const prev2 = stalkIndices[s - 2];
        const d2 = Math.max(0.1, Particulate.Vec3.distance(this.verts, prev2, b));
        this.queueConstraints(Particulate.DistanceConstraint.create([d2 * 0.86, d2 * 1.10], [prev2, b]));
      }
    }

    const midNode = stalkIndices[Math.floor(stalkIndices.length * 0.55)];
    const tipNode = stalkIndices[stalkIndices.length - 1];
    const dMid = Math.max(1.0, Particulate.Vec3.distance(this.verts, this.pinTail, midNode));
    const dTip = Math.max(1.0, Particulate.Vec3.distance(this.verts, this.pinTail, tipNode));
    this.queueConstraints(
      Particulate.DistanceConstraint.create([dMid * 0.68, dMid * 1.26], [this.pinTail, midNode]),
      Particulate.DistanceConstraint.create([dTip * 0.56, dTip * 1.24], [this.pinTail, tipNode]),
    );

    return stalkIndices;
  }

  /**
   * TOPOLOGY 2: Botanical Kelp Fronds (Ref 3)
   * Central live Particulate Verlet cylindrical stalk sprouting 8 alternating
   * 3D cupped spatulate paddle leaves along its length!
   */
  private createKelpFrondOralArms(totalArms: number): void {
    const segments = this.cfg.totalSegments;
    const outerBellR = this.subumbrellaRibAt(0.95).radius;
    const widthMul = Math.max(0.65, Math.min(1.6, this.cfg.oralArmWidth ?? 1.2));
    const baseLen = Math.max(24, this.cfg.tailArmSegments * this.cfg.tailArmSegmentLength);
    const ringFracs = [0.26, 0.56];

    for (let i = 0; i < totalArms; i++) {
      const rIdx = i % ringFracs.length;
      const attachRib = this.subumbrellaRibAt(ringFracs[rIdx]);
      const idxInRing = Math.floor(i / ringFracs.length);
      const countInRing = Math.max(1, Math.ceil((totalArms - rIdx) / ringFracs.length));
      const stagger = rIdx * (segments / countInRing) * 0.5;
      const segIdx = Math.floor((idxInRing / countInRing) * segments + stagger) % segments;

      const armLen = baseLen * (rIdx === 0 ? 1.04 : 0.84) * (0.9 + 0.16 * (i % 3) / 2);
      const stalkIndices = this.buildSubumbrellaStalk(
        attachRib,
        segIdx,
        14,
        armLen,
        0.22 + rIdx * 0.12,
        1.2,
        i * 1.7,
        Math.max(0.55, this.cfg.tailArmWeight),
      );

      this.oralArmRigs.push({
        kind: 'kelpFrond',
        stalkIndices,
        stalkRadius: Math.max(0.32, Math.min(0.65, outerBellR * 0.025)),
        leafCount: 8,
        leafLength: Math.max(4.5, Math.min(11.0, armLen * 0.185)) * (0.85 + 0.18 * widthMul),
        leafWidth: Math.max(2.2, Math.min(5.8, outerBellR * 0.18)) * widthMul,
        phaseOffset: i * 1.43,
      });
    }
  }

  /**
   * TOPOLOGY 3: Volumetric Cauliflower / Lagoon Floret Clusters (Ref 7)
   * Short branching Particulate stalks distributed across TWO wide inner-bell rings,
   * carrying stacked volumetric 3D 6-lobed scalloped coral/cauliflower puffs!
   */
  private createCauliflowerOralArms(totalArms: number): void {
    const segments = this.cfg.totalSegments;
    const outerBellR = this.subumbrellaRibAt(0.95).radius;
    const widthMul = Math.max(0.7, Math.min(1.6, this.cfg.oralArmWidth ?? 1.4));
    const baseLen = Math.max(16, Math.min(42, this.cfg.tailArmSegments * this.cfg.tailArmSegmentLength * 0.72));
    const ringFracs = [0.22, 0.58];

    for (let i = 0; i < totalArms; i++) {
      const rIdx = i % ringFracs.length;
      const attachRib = this.subumbrellaRibAt(ringFracs[rIdx]);
      const idxInRing = Math.floor(i / ringFracs.length);
      const countInRing = Math.max(1, Math.ceil((totalArms - rIdx) / ringFracs.length));
      const stagger = rIdx * (segments / countInRing) * 0.5;
      const segIdx = Math.floor((idxInRing / countInRing) * segments + stagger) % segments;

      const armLen = baseLen * (rIdx === 0 ? 1.05 : 0.78);
      const stalkIndices = this.buildSubumbrellaStalk(
        attachRib,
        segIdx,
        10,
        armLen,
        0.18 + rIdx * 0.14,
        0.7,
        i * 1.3,
        Math.max(0.62, this.cfg.tailArmWeight),
      );

      this.oralArmRigs.push({
        kind: 'cauliflowerCluster',
        stalkIndices,
        stalkRadius: Math.max(0.38, Math.min(0.85, outerBellR * 0.032)),
        floretCount: rIdx === 0 ? 6 : 5,
        floretRadius: Math.max(2.1, Math.min(5.2, outerBellR * 0.175)) * (0.75 + 0.25 * widthMul),
        phaseOffset: i * 1.19 + rIdx * 0.7,
      });
    }
  }

  /**
   * TOPOLOGY 4: Sculpted 3D Corkscrew Helical Augers (`helicalSpirals`)
   * Live Particulate Verlet spine skinned as a 3D tapered cylindrical core tube
   * wrapped with a continuous 3.5-turn protruding 3D spiral flange!
   */
  private createHelicalAugerOralArms(totalArms: number): void {
    const segments = this.cfg.totalSegments;
    const outerBellR = this.subumbrellaRibAt(0.95).radius;
    const widthMul = Math.max(0.65, Math.min(1.6, this.cfg.oralArmWidth ?? 1.2));
    const curlMul = Math.max(0.6, Math.min(2.0, this.cfg.oralArmCurl ?? 1.3));
    const baseLen = Math.max(24, this.cfg.tailArmSegments * this.cfg.tailArmSegmentLength);
    const ringFracs = [0.28, 0.62];

    for (let i = 0; i < totalArms; i++) {
      const rIdx = i % ringFracs.length;
      const attachRib = this.subumbrellaRibAt(ringFracs[rIdx]);
      const idxInRing = Math.floor(i / ringFracs.length);
      const countInRing = Math.max(1, Math.ceil((totalArms - rIdx) / ringFracs.length));
      const stagger = rIdx * (segments / countInRing) * 0.5;
      const segIdx = Math.floor((idxInRing / countInRing) * segments + stagger) % segments;

      const armLen = baseLen * (rIdx === 0 ? 1.02 : 0.85);
      const stalkIndices = this.buildSubumbrellaStalk(
        attachRib,
        segIdx,
        14,
        armLen,
        0.12 + rIdx * 0.08,
        0.85,
        i * 1.6,
        Math.max(0.55, this.cfg.tailArmWeight),
      );

      this.oralArmRigs.push({
        kind: 'helicalAuger',
        stalkIndices,
        coreRadius: Math.max(0.52, Math.min(1.1, outerBellR * 0.042)),
        finWidth: Math.max(2.0, Math.min(5.0, outerBellR * 0.165)) * widthMul,
        turns: 2.6 + curlMul * 1.15,
        handedness: i % 2 === 0 ? 1 : -1,
        phaseOffset: i * 1.25,
      });
    }
  }

  /**
   * TOPOLOGY 5: Double-Curved 3D Concave Cupped Blossom Petals (`petalCalyx`)
   * 3-rail Particulate Verlet truss (left chord edge + raised central midrib + right edge)
   * anchored across a WIDE tangential arc on the inner bell (`subumbrellaRibAt(0.52)`),
   * arching outward and curving back inward to pointed blossom tips!
   */
  private createCuppedPetalOralArms(totalArms: number): void {
    const segments = this.cfg.totalSegments;
    const attachRib = this.subumbrellaRibAt(0.54);
    const outerBellR = this.subumbrellaRibAt(0.95).radius;
    const cx = attachRib.centerX ?? 0;
    const cz = attachRib.centerZ ?? 0;
    const widthMul = Math.max(0.7, Math.min(1.6, this.cfg.oralArmWidth ?? 1.4));
    const curlMul = Math.max(0.6, Math.min(1.6, this.cfg.oralArmCurl ?? 1.0));
    const totalLen = Math.max(18, Math.min(46, this.cfg.tailArmSegments * this.cfg.tailArmSegmentLength * 0.78));
    const nodeSteps = 10;

    // Tangential root chord span in ring segments (wide blossom base!)
    const halfChordSegs = Math.max(2, Math.min(Math.floor(segments / Math.max(4, totalArms * 2.1)), 4));

    for (let i = 0; i < totalArms; i++) {
      const centerSeg = Math.floor((i / totalArms) * segments) % segments;
      const leftSeg = (centerSeg - halfChordSegs + segments) % segments;
      const rightSeg = (centerSeg + halfChordSegs) % segments;

      const rootMid = attachRib.start + centerSeg;
      const rootLeft = attachRib.start + leftSeg;
      const rootRight = attachRib.start + rightSeg;

      const mx0 = this.verts[rootMid * 3];
      const my0 = this.verts[rootMid * 3 + 1];
      const mz0 = this.verts[rootMid * 3 + 2];

      const dx = mx0 - cx;
      const dz = mz0 - cz;
      const rDist = Math.hypot(dx, dz) || 1;
      const rx = dx / rDist;
      const rz = dz / rDist;
      const tx = -rz;
      const tz = rx;

      const baseChordHalf = Math.max(
        1.8,
        Particulate.Vec3.distance(this.verts, rootLeft, rootRight) * 0.5,
      );

      const leftIndices: number[] = [rootLeft];
      const midIndices: number[] = [rootMid];
      const rightIndices: number[] = [rootRight];

      for (let s = 1; s <= nodeSteps; s++) {
        const t = s / nodeSteps;
        // Graceful blossom sepal profile: arches OUTWARD in middle, cups INWARD toward pointed tip
        const archOut = Math.sin(t * Math.PI) * outerBellR * (0.34 + 0.12 * curlMul) - Math.pow(t, 2.2) * outerBellR * 0.14;
        const py = my0 - Math.pow(t, 0.88) * totalLen;
        const midX = mx0 + rx * archOut;
        const midZ = mz0 + rz * archOut;

        // Broad spoon-shaped petal width envelope tapering cleanly to a pointed tip
        const petalHalfW =
          baseChordHalf *
          (0.68 + 0.42 * widthMul) *
          Math.max(0.06, Math.sin(Math.PI * (0.14 + 0.84 * t)));
        const cupBack = -Math.sin(t * Math.PI) * petalHalfW * 0.36;

        const lIdx = this.verts.length / 3;
        point(midX - tx * petalHalfW + rx * cupBack, py, midZ - tz * petalHalfW + rz * cupBack, this.verts);
        this.uvs.push(t, 0);

        const mIdx = this.verts.length / 3;
        point(midX, py, midZ, this.verts);
        this.uvs.push(t, 0.5);

        const rIdx = this.verts.length / 3;
        point(midX + tx * petalHalfW + rx * cupBack, py, midZ + tz * petalHalfW + rz * cupBack, this.verts);
        this.uvs.push(t, 1);

        const w = (0.12 + 0.88 * t * t) * Math.max(0.50, this.cfg.tailArmWeight);
        this.queueWeights(lIdx, 1, w);
        this.queueWeights(mIdx, 1, w * 0.92);
        this.queueWeights(rIdx, 1, w);

        leftIndices.push(lIdx);
        midIndices.push(mIdx);
        rightIndices.push(rIdx);
      }

      // Triangulated 3-rail shell truss constraints (holds concave 3D petal spoon shape natively!)
      const constraints: Particulate.Constraint[] = [];
      for (let s = 1; s < midIndices.length; s++) {
        const l0 = leftIndices[s - 1];
        const l1 = leftIndices[s];
        const m0 = midIndices[s - 1];
        const m1 = midIndices[s];
        const r0 = rightIndices[s - 1];
        const r1 = rightIndices[s];

        const pairs: Array<[number, number]> = [
          [l0, l1], [m0, m1], [r0, r1],
          [l1, m1], [m1, r1], [l1, r1],
          [l0, m1], [m0, l1], [m0, r1], [r0, m1],
        ];
        for (const [a, b] of pairs) {
          const d = Math.max(0.08, Particulate.Vec3.distance(this.verts, a, b));
          constraints.push(Particulate.DistanceConstraint.create([d * 0.91, d * 1.09], [a, b]));
        }
        if (s >= 2) {
          const dBend = Math.max(0.1, Particulate.Vec3.distance(this.verts, midIndices[s - 2], m1));
          constraints.push(Particulate.DistanceConstraint.create([dBend * 0.88, dBend * 1.12], [midIndices[s - 2], m1]));
        }
      }

      const tipMid = midIndices[midIndices.length - 1];
      const dTip = Math.max(1.0, Particulate.Vec3.distance(this.verts, this.pinTail, tipMid));
      constraints.push(
        Particulate.DistanceConstraint.create([dTip * 0.62, dTip * 1.24], [this.pinTail, tipMid]),
      );
      this.queueConstraints(constraints);

      this.oralArmRigs.push({
        kind: 'cuppedPetal',
        leftIndices,
        midIndices,
        rightIndices,
        cupDepth: Math.max(1.0, baseChordHalf * 0.42),
        midribHeight: Math.max(0.35, baseChordHalf * 0.15),
        phaseOffset: i * 1.05,
      });
    }
  }

  /**
   * TOPOLOGY 6: Closed 360° Concentric Circular Pleated Rosette Collars (`frilledLace`)
   * Completely distinct closed circular petticoat topology — 3 concentric 360° Particulate
   * cloth cylinders hanging from `subumbrellaRibAt(0.24)`, `0.50`, and `0.74` with deep
   * baroque radial pleats (ZERO vertical separate ribbon strips!).
   */
  private createPleatedRosetteOralArms(totalArms: number): void {
    const segments = this.cfg.totalSegments;
    const baseLen = Math.max(12, Math.min(34, this.cfg.tailArmSegments * this.cfg.tailArmSegmentLength * 0.62));
    const widthMul = Math.max(0.7, Math.min(1.5, this.cfg.oralArmWidth ?? 1.2));
    const curlMul = Math.max(0.7, Math.min(1.8, this.cfg.oralArmCurl ?? 1.3));

    const tierCount = totalArms <= 4 ? 2 : 3;
    const tierFracs = tierCount === 2 ? [0.30, 0.68] : [0.24, 0.50, 0.76];
    const ringRows = 6;

    for (let tier = 0; tier < tierCount; tier++) {
      const attachRib = this.subumbrellaRibAt(tierFracs[tier]);
      const cx = attachRib.centerX ?? 0;
      const cz = attachRib.centerZ ?? 0;
      const tierLen = baseLen * (1.0 - tier * 0.22);
      const stepY = tierLen / ringRows;
      const pleatFolds = 10 + tier * 4;
      const pleatDepth = (0.14 + 0.06 * curlMul) * widthMul;

      const ringStarts: number[] = [attachRib.start];

      for (let r = 1; r <= ringRows; r++) {
        const t = r / ringRows;
        const start = this.verts.length / 3;
        const flare = 1.0 + Math.sin(t * Math.PI * 0.85) * (0.18 + 0.08 * widthMul);

        for (let s = 0; s < segments; s++) {
          const ang = (s / segments) * Math.PI * 2;
          const rootIdx = attachRib.start + s;
          const rx0 = this.verts[rootIdx * 3] - cx;
          const ry0 = this.verts[rootIdx * 3 + 1];
          const rz0 = this.verts[rootIdx * 3 + 2] - cz;

          const pleatWave = Math.sin(ang * pleatFolds + tier * 1.2) * pleatDepth * Math.pow(t, 0.85);
          const scaleR = flare * (1.0 + pleatWave);
          const py = ry0 - r * stepY + Math.cos(ang * pleatFolds + tier * 1.2) * stepY * 0.28 * t;

          this.verts.push(cx + rx0 * scaleR, py, cz + rz0 * scaleR);
          this.uvs.push(t, s / segments);
        }

        this.queueWeights(start, segments, (0.16 + 0.72 * t * t) * Math.max(0.5, this.cfg.tailArmWeight));

        // Circumferential ring springs
        const prevStart = ringStarts[r - 1];
        for (let s = 0; s < segments; s++) {
          const curr = start + s;
          const currNext = start + ((s + 1) % segments);
          const prev = prevStart + s;
          const prevNext = prevStart + ((s + 1) % segments);

          const dCirc = Math.max(0.08, Particulate.Vec3.distance(this.verts, curr, currNext));
          const dMerid = Math.max(0.08, Particulate.Vec3.distance(this.verts, prev, curr));
          const dDiag = Math.max(0.08, Particulate.Vec3.distance(this.verts, prev, currNext));
          const dDiag2 = Math.max(0.08, Particulate.Vec3.distance(this.verts, prevNext, curr));

          this.queueConstraints(
            Particulate.DistanceConstraint.create([dCirc * 0.90, dCirc * 1.12], [curr, currNext]),
            Particulate.DistanceConstraint.create([dMerid * 0.92, dMerid * 1.08], [prev, curr]),
            Particulate.DistanceConstraint.create([dDiag * 0.90, dDiag * 1.12], [prev, currNext]),
            Particulate.DistanceConstraint.create([dDiag2 * 0.90, dDiag2 * 1.12], [prevNext, curr]),
          );
        }

        // Coaxial radial keep-open bracing on bottom rosette ring
        if (r === ringRows) {
          for (let s = 0; s < segments; s += 4) {
            const vIdx = start + s;
            const dPin = Math.max(0.5, Particulate.Vec3.distance(this.verts, this.pinTail, vIdx));
            this.queueConstraints(
              Particulate.DistanceConstraint.create([dPin * 0.68, dPin * 1.28], [this.pinTail, vIdx]),
            );
          }
        }

        ringStarts.push(start);
      }

      this.oralArmRigs.push({
        kind: 'pleatedRosette',
        ringStarts,
        ringSegments: segments,
        pleatFolds,
        pleatDepth,
        phaseOffset: tier * 1.35,
      });
    }
  }

  // ...................................................
  // Helpers & Anatomical Rib Overlay Lines
  // ...................................................
  private queueConstraints(...constraints: (Particulate.Constraint | Particulate.Constraint[])[]): void {
    for (const constraint of constraints) {
      if (Array.isArray(constraint)) {
        this.queuedConstraints.push(...constraint);
      } else {
        this.queuedConstraints.push(constraint);
      }
    }
  }

  private queueWeights(start: number, howMany: number, weight: number): void {
    const end = start + howMany;
    if (this.weights.length < end) {
      for (let i = this.weights.length; i < end; i++) {
        this.weights.push(1);
      }
    }
    for (let i = start; i < end; i++) {
      this.weights[i] = weight;
    }
  }

  private generateAnatomicalMeridians(): number[] {
    const out: number[] = [];
    const segments = this.cfg.totalSegments;
    if (this.ribs.length < 2) return out;

    const desiredCount =
      this.spec.surface?.ridges?.count ??
      this.spec.lobes?.count ??
      (this.spec.crossSection?.kind === 'superformula' && this.spec.crossSection.superformula?.m
        ? Math.max(6, this.spec.crossSection.superformula.m * 2)
        : 12);
    const meridianStep = Math.max(1, Math.round(segments / Math.min(segments, Math.max(6, desiredCount))));

    const skirtAnchor = this.getSubumbrellaAttachRib();
    for (let s = 0; s < segments; s += meridianStep) {
      if (this.shouldCapTop()) {
        out.push(this.indexTop, this.ribs[0].start + s);
      }
      for (let r = 0; r < this.ribs.length - 1; r++) {
        out.push(this.ribs[r].start + s, this.ribs[r + 1].start + s);
      }
      if (this.tailRibs.length > 0) {
        out.push(skirtAnchor.start + s, this.tailRibs[0].start + s);
        for (let t = 0; t < this.tailRibs.length - 1; t++) {
          out.push(this.tailRibs[t].start + s, this.tailRibs[t + 1].start + s);
        }
      }
    }
    return out;
  }

  private generateAnatomicalRings(): number[] {
    const out: number[] = [];
    const segments = this.cfg.totalSegments;
    for (let r = 1; r < this.ribs.length; r += 2) {
      loop(this.ribs[r].start, segments, out);
    }
    if (this.ribs.length > 1) {
      loop(this.ribs[this.ribs.length - 1].start, segments, out);
    }
    for (let t = 2; t < this.tailRibs.length; t += 3) {
      loop(this.tailRibs[t].start, segments, out);
    }
    return out;
  }

  public static create(spec?: CreatureSpec): JellyfishGeometryData {
    const geometry = new JellyfishGeometry(spec);
    return geometry.generate();
  }

  public generate(): JellyfishGeometryData {
    // 6 relaxation iterations keeps articulated spine, bell dome, oral arms, and strands silky-stable
    const system = Particulate.ParticleSystem.create(this.verts, 6);

    for (const constraint of this.queuedConstraints) {
      system.addConstraint(constraint);
    }

    for (let i = 0; i < this.weights.length; i++) {
      system.setWeight(i, this.weights[i]);
    }

    system.setWeight(this.pinTop, 0);
    system.setWeight(this.pinMid, 0);
    system.setWeight(this.pinBottom, 0);
    system.setWeight(this.pinTail, 0);
    system.setWeight(this.pinTentacle, 0);

    const topOff = this.spineOffset(0.0);
    const midOff = this.spineOffset(0.5);
    const botOff = this.spineOffset(1.0);

    const pinConstraintTop = Particulate.PointConstraint.create([topOff.x, this.posTop, topOff.z], this.pinTop);
    const pinConstraintMid = Particulate.PointConstraint.create([midOff.x, this.posMid, midOff.z], this.pinMid);
    const pinConstraintBottom = Particulate.PointConstraint.create([botOff.x, this.posBottom, botOff.z], this.pinBottom);
    const pinConstraintTail = Particulate.PointConstraint.create([botOff.x, this.posTail, botOff.z], this.pinTail);
    const pinConstraintTentacle = Particulate.PointConstraint.create([botOff.x, this.posTentacle, botOff.z], this.pinTentacle);

    system.addPinConstraint(pinConstraintTop);
    system.addPinConstraint(pinConstraintMid);
    system.addPinConstraint(pinConstraintBottom);
    system.addPinConstraint(pinConstraintTail);
    system.addPinConstraint(pinConstraintTentacle);

    // Kept as a zero-intensity stub for API compatibility (singular PointForce is NOT added to system!)
    const jetForce = Particulate.PointForce.create(
      [botOff.x, this.posBottom, botOff.z],
      {
        type: Particulate.Force.REPULSOR,
        radius: 1,
        intensity: 0.0,
      },
    );
    // Bounded, singularity-free native Particulate Hydrodynamic Wake Force
    const hydroForce = new HydrodynamicWakeForce(this.appendageRanges);
    hydroForce.wakeOriginY = this.posBottom;

    system.addForce(hydroForce);

    const geometry = new THREE.BufferGeometry();
    const uvsArray = new Float32Array(this.uvs);

    const position = new THREE.BufferAttribute(system.positions, 3);
    const positionPrev = new THREE.BufferAttribute(system.positionsPrev, 3);
    const uvs = new THREE.BufferAttribute(uvsArray, 2);

    geometry.setAttribute('position', position);
    geometry.setAttribute('positionPrev', positionPrev);
    geometry.setAttribute('uv', uvs);

    const normals = new Float32Array(system.positions.length);
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

    const linesFore = this.generateAnatomicalMeridians();
    const linesInner = this.generateAnatomicalRings();

    return {
      spec: this.spec,
      config: this.cfg,
      geometry,
      system,
      hydroForce,
      jetForce,
      links: {
        bulb: linesFore,
        tail: [],
        tentacles: this.tentLinks,
        inner: linesInner,
        linesFore,
        linesInner,
      },
      faces: {
        bulb: this.bulbFaces,
        gastricCore: this.gastricCoreFaces,
        tail: this.tailFaces,
        mouth: this.mouthFaces,
        tentacles: this.tentFaces,
        tentacleGroups: this.tentGroupFaces,
      },
      uvs: uvsArray,
      weights: this.weights,
      spineNodes: this.spineNodes,
      ribs: this.ribs,
      tailRibs: this.tailRibs,
      coreRibs: this.coreRibs,
      pins: {
        top: this.pinTop,
        mid: this.pinMid,
        bottom: this.pinBottom,
        tail: this.pinTail,
        tentacle: this.pinTentacle,
      },
      pinRestY: {
        top: this.posTop,
        mid: this.posMid,
        bottom: this.posBottom,
        tail: this.posTail,
        tentacle: this.posTentacle,
      },
      pinRestXZ: {
        top: [topOff.x, topOff.z],
        mid: [midOff.x, midOff.z],
        bottom: [botOff.x, botOff.z],
      },
      pinConstraints: {
        top: pinConstraintTop,
        mid: pinConstraintMid,
        bottom: pinConstraintBottom,
        tail: pinConstraintTail,
        tentacle: pinConstraintTentacle,
      },
      appendageRanges: this.appendageRanges,
      position,
      positionPrev,
      verletTubeChains: this.verletTubeChains,
      stamenChains: this.stamenChains,
      ribbonChains: this.ribbonChains,
      oralArmChains: this.oralArmChains,
      oralArmRigs: this.oralArmRigs,
    };
  }
}

export default JellyfishGeometry;
