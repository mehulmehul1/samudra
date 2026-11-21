/**
 * TentacleNodeMaterial.ts
 *
 * Self-luminous WebGPU TSL material for all unified Particulate Verlet tentacles:
 * Supports both Silk Curtains AND smoothly skinned 3D Verlet Tubes with 6 ornament modes:
 *   0 — Silk Curtain        (flowing iridescent veil strands with vertical biolume pulses)
 *   1 — Articulated Tubes   (sculpted 3D translucent soft-body tubes with Fresnel rim)
 *   2 — Stippled Curtain    (Ref 4: shimmering micro-beaded nematocyst stipple fade)
 *   3 — Bulb Filaments      (Ref 5: orchid violet strands with incandescent molten tip bulbs!)
 *   4 — Pearl-Beaded Arms   (Ref 6: opal chromatophore arms lined with crisp glowing pearl beads!)
 *   5 — Crystal Tendrils    (Ref 1: high-contrast cyan-amber prismatic glass trailing tendrils)
 */

import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec2,
  vec3,
  uniform,
  uv,
  positionWorld,
  normalWorld,
  cameraPosition,
  normalize,
  dot,
  abs,
  sin,
  cos,
  pow,
  floor,
  fract,
  length,
  clamp,
  mix,
  smoothstep,
} from 'three/tsl';
import { InterpolatedNodeMaterial } from './InterpolatedNodeMaterial';
import { selectWeight, hash21 } from './TslPatternLibrary';

export interface TentacleMaterialParams {
  color?: number | string | THREE.Color;
  diffuseB?: number | string | THREE.Color;
  opacity?: number;
  area?: number;
  transparent?: boolean;
  depthTest?: boolean;
  depthWrite?: boolean;
  useGlow?: boolean;
  ornamentMode?: number;
}

export class TentacleNodeMaterial extends InterpolatedNodeMaterial {
  private coreColorUniform: any;
  private bellColorUniform: any;
  private accentColorUniform: any;
  private tipColorUniform: any;

  private opacityUniform: any;
  private areaUniform: any;
  private timeUniform: any;
  private opticalBaseUniform: any;
  private ornamentModeUniform: any;

  constructor(params: TentacleMaterialParams = {}) {
    const isCurtain = params.useGlow ?? true;
    super({
      transparent: params.transparent ?? true,
      depthTest: params.depthTest ?? true,
      depthWrite: params.depthWrite ?? false,
      side: THREE.DoubleSide,
    });

    const baseCol = params.color !== undefined ? new THREE.Color(params.color as any) : new THREE.Color(0x22e8ff);
    const tipCol = params.diffuseB !== undefined ? new THREE.Color(params.diffuseB as any) : new THREE.Color(0xff7a1a);

    this.coreColorUniform = uniform(new THREE.Color(0xffe58f));
    this.bellColorUniform = uniform(baseCol);
    this.accentColorUniform = uniform(new THREE.Color(0x7c5cff));
    this.tipColorUniform = uniform(tipCol);

    this.opacityUniform = uniform(params.opacity ?? (isCurtain ? 0.58 : 0.84));
    this.areaUniform = uniform(params.area ?? 2000.0);
    this.timeUniform = uniform(0.0);
    this.opticalBaseUniform = uniform(0.0);
    this.ornamentModeUniform = uniform(params.ornamentMode ?? (isCurtain ? 0.0 : 1.0));

    this.setupTentacleNodes();
  }

  private setupTentacleNodes(): void {
    const colorFn = Fn(() => {
      const uv0: any = uv();
      const u = uv0.x;
      const v = uv0.y; // 0 at bell attachment root -> 1 at trailing tip
      const t = this.timeUniform;
      const mode = this.ornamentModeUniform;

      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const surfNorm = normalize(normalWorld);
      const nDotV: any = abs(dot(viewDir, surfNorm));
      const rawRim: any = clamp(float(1.0).sub(nDotV), float(0.0), float(1.0));
      const fresnel: any = pow(rawRim, float(2.1));

      // Traveling bioluminescent pulse down each tentacle
      const pulse = sin(v.mul(11.0).sub(t.mul(3.2)).add(u.mul(6.283))).mul(0.24).add(0.86);

      // Base 3-stop gradient along tentacle length
      const rootToMid = mix(this.coreColorUniform, this.bellColorUniform, smoothstep(float(0.0), float(0.32), v));
      const gradCol = mix(rootToMid, this.accentColorUniform, smoothstep(float(0.32), float(0.88), v));

      // ── MODE 0: Independent Flowing Cloth Ribbons & Fine Filaments ──
      // Softly feathered across each individual strand width u in [0, 1] with luminous center spine
      const strandCore: any = float(1.0).sub(abs(u.sub(0.5)).mul(2.0));
      const ribbonSpine: any = pow(clamp(strandCore, float(0.0), float(1.0)), float(1.3));
      const colCurtain: any = mix(gradCol, this.tipColorUniform, smoothstep(float(0.62), float(1.0), v))
        .mul(ribbonSpine.mul(0.45).add(0.42))
        .mul(pulse)
        .add(this.bellColorUniform.mul(fresnel.mul(0.55)));

      // ── MODE 1: Articulated 3D Translucent Tubes ──
      const colTube: any = gradCol.mul(nDotV.mul(0.42).add(0.48)).mul(pulse)
        .add(mix(this.bellColorUniform, this.tipColorUniform, v).mul(fresnel.mul(0.82)));

      // ── MODE 2: Discrete Glitter-Stippled Filaments (Ref 4 — Individual Shimmering Starlight Strands!) ──
      const stippleGrid: any = vec2(u.mul(6.0), v.mul(130.0));
      const sId: any = floor(stippleGrid);
      const sLocal: any = fract(stippleGrid).sub(0.5);
      const sHash: any = (hash21 as any)(sId);
      const sTwinkle: any = sin(t.mul(2.8).add(sHash.mul(25.0))).mul(0.28).add(0.82);
      const bead: any = float(1.0).sub(smoothstep(float(0.08), float(0.36), length(sLocal))).mul(sTwinkle);
      const silverFade: any = mix(this.coreColorUniform, vec3(0.92, 0.99, 0.96), smoothstep(float(0.2), float(0.92), v));
      const colStipple: any = gradCol.mul(0.42).add(silverFade.mul(bead.mul(1.25)));

      // ── MODE 3: Bulb-Tipped Orchid Filaments (Ref 5) ──
      const tipBulbMask: any = smoothstep(float(0.84), float(0.97), v);
      const bulbGlow: any = pow(clamp(tipBulbMask, float(0.0), float(1.0)), float(1.4));
      const orchidStrand: any = mix(this.bellColorUniform, this.accentColorUniform, smoothstep(float(0.1), float(0.8), v));
      const colBulb: any = orchidStrand.mul(0.62).mul(pulse)
        .add(orchidStrand.mul(fresnel.mul(0.75)))
        .add(this.tipColorUniform.mul(bulbGlow.mul(1.65)))
        .add(vec3(1.0, 0.72, 0.35).mul(pow(bulbGlow, float(2.5)).mul(1.05)));

      // ── MODE 4: Pearl-Beaded Opal Chromatophore Arms (Ref 6) ──
      const innerStrip: any = float(1.0).sub(smoothstep(float(0.04), float(0.22), abs(u.sub(0.5))));
      const beadPhase: any = fract(v.mul(28.0)).sub(0.5);
      const pearlDot: any = float(1.0).sub(smoothstep(float(0.12), float(0.36), abs(beadPhase))).mul(innerStrip);
      const opalPhase: any = rawRim.mul(5.5).add(v.mul(5.0)).sub(t.mul(1.2));
      const opalSheen: any = vec3(
        cos(opalPhase).mul(0.5).add(0.5),
        cos(opalPhase.add(2.094)).mul(0.5).add(0.5),
        cos(opalPhase.add(4.188)).mul(0.5).add(0.5),
      );
      const colBeaded: any = mix(this.coreColorUniform.mul(0.45), this.bellColorUniform.mul(0.68), rawRim)
        .add(opalSheen.mul(fresnel.mul(0.68)))
        .add(this.accentColorUniform.mul(smoothstep(float(0.2), float(0.8), v).mul(0.38)))
        .add(vec3(0.94, 0.99, 1.0).mul(pearlDot.mul(1.45)));

      // ── MODE 5: Crystalline Prismatic Tendrils (Ref 1) ──
      const glassHighlight: any = pow(rawRim, float(3.2)).mul(1.05);
      const colCrystal: any = mix(this.bellColorUniform, this.tipColorUniform, pow(rawRim, float(2.0)).mul(0.62))
        .mul(0.58).mul(pulse)
        .add(vec3(0.82, 0.97, 1.0).mul(glassHighlight));

      const m0: any = (selectWeight as any)(mode, float(0.0));
      const m1: any = (selectWeight as any)(mode, float(1.0));
      const m2: any = (selectWeight as any)(mode, float(2.0));
      const m3: any = (selectWeight as any)(mode, float(3.0));
      const m4: any = (selectWeight as any)(mode, float(4.0));
      const m5: any = (selectWeight as any)(mode, float(5.0));

      return colCurtain.mul(m0)
        .add(colTube.mul(m1))
        .add(colStipple.mul(m2))
        .add(colBulb.mul(m3))
        .add(colBeaded.mul(m4))
        .add(colCrystal.mul(m5));
    });

    const alphaFn = Fn(() => {
      const uv0: any = uv();
      const u = uv0.x;
      const v = uv0.y;
      const mode = this.ornamentModeUniform;

      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV: any = abs(dot(viewDir, normalize(normalWorld)));
      const fresnel: any = pow(clamp(float(1.0).sub(nDotV), float(0.0), float(1.0)), float(1.8));

      const rootBlend: any = smoothstep(float(0.0), float(0.06), v).mul(0.55).add(0.45);
      const tipFade: any = float(1.0).sub(smoothstep(float(0.76), float(1.0), v)).mul(0.84).add(0.16);

      // Discrete filaments & cloth ribbons feather cleanly at their edges (zero solid sheet banding!)
      const edgeFeather: any = float(1.0).sub(pow(abs(u.sub(0.5)).mul(2.0), float(2.4))).mul(0.65).add(0.35);
      const aRibbon: any = edgeFeather.mul(tipFade).mul(rootBlend).mul(0.88);
      const aFilament: any = clamp(fresnel.mul(0.35).add(0.62), float(0.45), float(0.95)).mul(tipFade).mul(rootBlend);
      const aTube: any = clamp(fresnel.mul(0.44).add(0.52), float(0.42), float(0.92)).mul(tipFade);
      const aBulb: any = clamp(fresnel.mul(0.38).add(0.54).add(smoothstep(float(0.84), float(0.96), v).mul(0.44)), float(0.48), float(0.98));

      const m0: any = (selectWeight as any)(mode, float(0.0));
      const m1: any = (selectWeight as any)(mode, float(1.0));
      const m2: any = (selectWeight as any)(mode, float(2.0));
      const m3: any = (selectWeight as any)(mode, float(3.0));
      const m4: any = (selectWeight as any)(mode, float(4.0));
      const m5: any = (selectWeight as any)(mode, float(5.0));

      const baseAlpha: any = aRibbon.mul(m0)
        .add(aFilament.mul(m2))
        .add(aTube.mul(m1.add(m4).add(m5)))
        .add(aBulb.mul(m3));

      return clamp(baseAlpha.mul(this.opacityUniform), float(0.06), float(0.95));
    });

    this.colorNode = colorFn();
    this.opacityNode = alphaFn();
  }

  setCoreColor(col: THREE.Color | number | string): void {
    if (col instanceof THREE.Color) this.coreColorUniform.value.copy(col);
    else this.coreColorUniform.value.set(col as any);
  }

  setBellColor(col: THREE.Color | number | string): void {
    if (col instanceof THREE.Color) this.bellColorUniform.value.copy(col);
    else this.bellColorUniform.value.set(col as any);
  }

  setAccentColor(col: THREE.Color | number | string): void {
    if (col instanceof THREE.Color) this.accentColorUniform.value.copy(col);
    else this.accentColorUniform.value.set(col as any);
  }

  setTipColor(col: THREE.Color | number | string): void {
    if (col instanceof THREE.Color) this.tipColorUniform.value.copy(col);
    else this.tipColorUniform.value.set(col as any);
  }

  setDiffuse(col: number | string | THREE.Color): void {
    this.setBellColor(col);
  }

  setDiffuseB(col: number | string | THREE.Color): void {
    this.setTipColor(col);
  }

  setOpacity(opacity: number): void {
    this.opacityUniform.value = opacity;
  }

  setArea(area: number): void {
    this.areaUniform.value = area;
  }

  setTime(time: number): void {
    this.timeUniform.value = time;
  }

  setOpticalBase(styleIndex: number): void {
    this.opticalBaseUniform.value = Math.max(0, Math.min(5, Math.round(styleIndex)));
  }

  setMaterialStyle(styleIndex: number): void {
    this.setOpticalBase(styleIndex);
  }

  setOrnamentMode(mode: number): void {
    this.ornamentModeUniform.value = Math.max(0, Math.min(5, Math.round(mode)));
  }
}

export default TentacleNodeMaterial;
