/**
 * TailNodeMaterial.ts
 *
 * Composable WebGPU TSL material for both the Inner Skirt (Velum / Subumbrella)
 * and the sculpted Oral Arms (Turing Ribbons, Botanical Kelp Fronds, Cauliflower
 * Clusters, Corkscrew Helices, Lotus Calyx, Cathedral Mane).
 *
 * Features:
 * - Synchronized with the 4-stop colorway (coreColor, bellColor, accentColor, tipColor)
 * - Evaluates the live composable surface pattern (Turing maze, leaf veins, starfield, etc.)
 * - Soft feathered translucency & delicate edge glow (never turns into a chalky white cone)
 */

import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec2,
  vec3,
  uniform,
  uv,
  attribute,
  positionWorld,
  normalWorld,
  normalize,
  cameraPosition,
  dot,
  abs,
  sin,
  cos,
  pow,
  clamp,
  mix,
  smoothstep,
} from 'three/tsl';
import {
  evalComposablePattern,
  evalCosmicStarfield,
  selectWeight,
} from './TslPatternLibrary';

export class TailNodeMaterial extends THREE.MeshBasicNodeMaterial {
  private coreColorUniform: any;
  private bellColorUniform: any;
  private accentColorUniform: any;
  private tipColorUniform: any;

  private opacityUniform: any;
  private scaleUniform: any;
  private stepProgressUniform: any;
  private timeUniform: any;
  private opticalBaseUniform: any;
  private patternTypeUniform: any;
  private patternScaleUniform: any;
  private sparkleIntensityUniform: any;
  private isOralArmUniform: any;

  constructor(parameters: THREE.MeshBasicNodeMaterialParameters = {}) {
    super({
      transparent: true,
      ...parameters,
    });

    this.coreColorUniform = uniform(new THREE.Color(0xffe58f));
    this.bellColorUniform = uniform(new THREE.Color(0x22e8ff));
    this.accentColorUniform = uniform(new THREE.Color(0x0e4bff));
    this.tipColorUniform = uniform(new THREE.Color(0xff7a1a));

    this.opacityUniform = uniform(0.58);
    this.scaleUniform = uniform(12.0);
    this.stepProgressUniform = uniform(0.0);
    this.timeUniform = uniform(0.0);
    this.opticalBaseUniform = uniform(0.0);
    this.patternTypeUniform = uniform(0.0);
    this.patternScaleUniform = uniform(1.0);
    this.sparkleIntensityUniform = uniform(0.35);
    this.isOralArmUniform = uniform(0.0);

    this.setupTSLNodes();
  }

  private setupTSLNodes(): void {
    const posCurr: any = attribute('position', 'vec3');
    const posPrev: any = attribute('positionPrev', 'vec3');
    this.positionNode = mix(posPrev, posCurr, this.stepProgressUniform);

    const colorFn = Fn(() => {
      const uv0: any = uv();
      const t = this.timeUniform;
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const surfNorm = normalize(normalWorld);
      const nDotV: any = abs(dot(viewDir, surfNorm));
      const rawRim: any = clamp(float(1.0).sub(nDotV), float(0.0), float(1.0));
      const fresnel: any = pow(rawRim, float(2.0));

      // Oral arms store length along uv.x and width along uv.y; Inner skirt stores ring along uv.x and height along uv.y
      const armFlag = this.isOralArmUniform;
      const alongLen: any = mix(uv0.y, uv0.x, armFlag);
      const acrossW: any = mix(uv0.x, uv0.y, armFlag);
      const patUV = vec2(acrossW, alongLen);

      // Evaluate live composable pattern (so Turing Labyrinth / Leaf Veins / Starfield flow down the arms!)
      // @ts-ignore
      const patVal: any = evalComposablePattern(patUV, viewDir, t, this.patternTypeUniform, this.patternScaleUniform);
      // @ts-ignore
      const sparkle: any = evalCosmicStarfield(patUV, viewDir, t, this.patternScaleUniform.mul(1.2)).mul(this.sparkleIntensityUniform);

      // Subtle silk ripple striations along the membrane
      const pleat: any = sin(acrossW.mul(this.scaleUniform).add(alongLen.mul(8.0)).sub(t.mul(1.8))).mul(0.16).add(0.84);

      // 4-stop flow down the inner skirt / oral arms:
      // Throat (coreColor) -> Mid-membrane (bellColor/accentColor) -> Outer Ruffle Edge (tipColor)
      const rootToMid: any = mix(this.coreColorUniform, this.bellColorUniform, smoothstep(float(0.0), float(0.45), alongLen));
      const midToTip: any = mix(rootToMid, this.accentColorUniform, smoothstep(float(0.38), float(0.85), alongLen));
      const edgeHighlight: any = smoothstep(float(0.68), float(1.0), acrossW).mul(armFlag);
      const tipMixFactor: any = clamp(
        edgeHighlight.mul(0.85).add(smoothstep(float(0.75), float(1.0), alongLen).mul(0.55)),
        float(0.0),
        float(0.95),
      );
      const bodyCol: any = mix(midToTip, this.tipColorUniform, tipMixFactor);

      // Delicate optical-base tinting
      const opt: any = this.opticalBaseUniform;
      const wOpal: any = (selectWeight as any)(opt, float(5.0));
      const opalPhase: any = rawRim.mul(6.0).add(alongLen.mul(4.5)).sub(t.mul(1.2));
      const opalShift: any = vec3(
        cos(opalPhase).mul(0.5).add(0.5),
        cos(opalPhase.add(2.094)).mul(0.5).add(0.5),
        cos(opalPhase.add(4.188)).mul(0.5).add(0.5),
      ).mul(wOpal.mul(0.42));

      const patternGlow: any = mix(this.bellColorUniform, this.tipColorUniform, float(0.45)).mul(patVal.mul(0.58));
      const rimGlow: any = mix(this.coreColorUniform, this.tipColorUniform, alongLen).mul(fresnel.mul(0.54));
      const sparkleGlow: any = mix(vec3(0.95, 0.99, 1.0), this.coreColorUniform, float(0.4)).mul(sparkle.mul(0.52));

      const rawCol: any = bodyCol.mul(pleat).mul(0.74).add(patternGlow).add(rimGlow).add(opalShift);
      // Soft filmic shoulder keeps translucent silk richly colored with crisp bright accents
      return rawCol.div(rawCol.mul(0.45).add(1.0)).add(sparkleGlow);
    });

    const alphaFn = Fn(() => {
      const uv0: any = uv();
      const armFlag = this.isOralArmUniform;
      const alongLen: any = mix(uv0.y, uv0.x, armFlag);
      const acrossW: any = mix(uv0.x, uv0.y, armFlag);

      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV: any = abs(dot(viewDir, normalize(normalWorld)));
      const fresnel: any = pow(clamp(float(1.0).sub(nDotV), float(0.0), float(1.0)), float(1.9));

      // Graceful translucent gossamer falloff at both attachment seam & trailing tips
      const topSeamSoft: any = smoothstep(float(0.0), float(0.10), alongLen).mul(0.68).add(0.32);
      const bottomFeather: any = float(1.0).sub(smoothstep(float(0.70), float(1.0), alongLen)).mul(0.80).add(0.12);
      const edgeRuffleAlpha: any = smoothstep(float(0.64), float(0.98), acrossW).mul(0.28).mul(armFlag);
      const gossamer: any = clamp(fresnel.mul(0.52).add(0.18).add(edgeRuffleAlpha), float(0.12), float(0.78));

      return clamp(gossamer.mul(topSeamSoft).mul(bottomFeather).mul(this.opacityUniform), float(0.04), float(0.74));
    });

    this.colorNode = colorFn();
    this.opacityNode = alphaFn();
    this.transparent = true;
    this.blending = THREE.NormalBlending;
    this.side = THREE.DoubleSide;
    this.depthWrite = false;
  }

  setIsOralArm(isArm: boolean): void {
    this.isOralArmUniform.value = isArm ? 1.0 : 0.0;
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

  setDiffuse(col: THREE.Color | number | string): void {
    this.setBellColor(col);
  }

  setDiffuseB(col: THREE.Color | number | string): void {
    this.setAccentColor(col);
  }

  updateOpacity(opacity: number): void {
    this.opacityUniform.value = opacity;
  }

  setScale(scale: number): void {
    this.scaleUniform.value = scale;
  }

  setStepProgress(progress: number): void {
    this.stepProgressUniform.value = progress;
  }

  updateStepProgress(progress: number): void {
    this.setStepProgress(progress);
  }

  setTime(time: number): void {
    this.timeUniform.value = time;
  }

  setOpticalBase(styleIndex: number): void {
    this.opticalBaseUniform.value = Math.max(0, Math.min(5, Math.round(styleIndex)));
  }

  setPatternType(patternIndex: number): void {
    this.patternTypeUniform.value = Math.max(0, Math.min(7, Math.round(patternIndex)));
  }

  setPatternScale(scale: number): void {
    this.patternScaleUniform.value = Math.max(0.25, scale);
  }

  setSparkleIntensity(value: number): void {
    this.sparkleIntensityUniform.value = Math.max(0, Math.min(2.0, value));
  }

  setMaterialStyle(styleIndex: number): void {
    this.setOpticalBase(styleIndex);
  }

  getStepProgress(): number {
    return this.stepProgressUniform.value;
  }
}

export default TailNodeMaterial;
