/**
 * BulbNodeMaterial.ts
 *
 * Hyperrealistic Composable 3-Layer WebGPU TSL Material for the jellyfish bell:
 *   Layer 1 — Surface Pattern (0..7 via TslPatternLibrary):
 *     0: Biolume Waves      | 1: Hex Voronoi        | 2: Turing Labyrinth | 3: Leaf Veins & Pearls
 *     4: Cosmic Starfield   | 5: Chromatophore      | 6: Exumbrella Spots | 7: Radial Glass Flutes
 *   Layer 2 — 4-Stop Chromatic Palette:
 *     coreColor -> bellColor -> accentColor -> tipColor
 *   Layer 3 — Optical Base Physics (0..5):
 *     0: Prismatic Crystal Glass (live RGB dispersion refraction + caustics + wet Fresnel)
 *     1: Abyssal Biolume Gel     (deep velvet absorption + radial internal canals + gold dust rim)
 *     2: Water-Clear Botanical   (ultra-clear specular glass + subtle emerald subsurface + silver rim)
 *     3: Phosphorescent Flora    (radiant hearth diffusion + emissive petal veins & margin pearls)
 *     4: Frosted Cosmic Crystal  (icy frosted translucent shell + violet fold blush + diamond glitter)
 *     5: Opal Iridescence        (thin-film soap-bubble spectral shift + amber/ultraviolet sheen)
 */

import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec2,
  vec3,
  uniform,
  uv,
  screenUV,
  texture,
  mix,
  smoothstep,
  max,
  clamp,
  abs,
  sin,
  cos,
  pow,
  refract,
  positionWorld,
  normalWorld,
  normalize,
  dot,
  cameraPosition,
} from 'three/tsl';
import { InterpolatedNodeMaterial } from './InterpolatedNodeMaterial';
import {
  selectWeight,
  evalComposablePattern,
  evalCosmicStarfield,
  evalChromaticRamp4,
} from './TslPatternLibrary';

export class BulbNodeMaterial extends InterpolatedNodeMaterial {
  protected timeUniform: any;
  protected coreColorUniform: any;
  protected bellColorUniform: any;
  protected accentColorUniform: any;
  protected tipColorUniform: any;

  protected opacityUniform: any;
  protected rimBoostUniform: any;
  protected patternScaleUniform: any;
  protected sparkleIntensityUniform: any;
  protected coreGlowUniform: any;

  protected opticalBaseUniform: any;
  protected patternTypeUniform: any;

  protected iorUniform: any;
  protected dispersionUniform: any;
  protected refractionStrengthUniform: any;
  protected refractionResolutionUniform: any;

  private refractionTexture: THREE.Texture;
  private refractionTexNodeR: any;
  private refractionTexNodeG: any;
  private refractionTexNodeB: any;

  constructor(parameters: THREE.MeshBasicNodeMaterialParameters = {}) {
    super({
      transparent: true,
      ...parameters,
    });

    // Always pass native JS/Three values to uniform() so WGSLNodeBuilder resolves exact types
    this.coreColorUniform = uniform(new THREE.Color(0xffe58f));
    this.bellColorUniform = uniform(new THREE.Color(0x22e8ff));
    this.accentColorUniform = uniform(new THREE.Color(0x0e4bff));
    this.tipColorUniform = uniform(new THREE.Color(0xff7a1a));

    this.opacityUniform = uniform(0.74);
    this.timeUniform = uniform(0.0);
    this.rimBoostUniform = uniform(1.25);
    this.patternScaleUniform = uniform(1.0);
    this.sparkleIntensityUniform = uniform(0.45);
    this.coreGlowUniform = uniform(0.75);

    this.opticalBaseUniform = uniform(0.0);
    this.patternTypeUniform = uniform(1.0);

    this.iorUniform = uniform(1.44);
    this.dispersionUniform = uniform(0.045);
    this.refractionStrengthUniform = uniform(22.0);
    this.refractionResolutionUniform = uniform(new THREE.Vector2(1024, 1024));

    const px = new Uint8Array([3, 6, 14, 255]);
    const dt = new THREE.DataTexture(px, 1, 1);
    dt.needsUpdate = true;
    this.refractionTexture = dt;

    this.setupTSLNodes();
  }

  private setupTSLNodes(): void {
    const bulbColorNode = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const surfNormal = normalize(normalWorld);
      const nDotV: any = abs(dot(viewDir, surfNormal));
      const rawRim: any = clamp(float(1.0).sub(nDotV), float(0.0), float(1.0));
      const rim: any = clamp(rawRim.mul(this.rimBoostUniform), float(0.0), float(2.2));
      const fresnel: any = pow(rawRim, float(2.35));
      const sharpGlint: any = pow(rawRim, float(5.0));

      const uv0: any = uv();
      const t = this.timeUniform;
      const opt = this.opticalBaseUniform;
      const patType = this.patternTypeUniform;

      // Stage 1: Evaluate Composable Surface Pattern (0..7)
      // @ts-ignore
      const patVal: any = evalComposablePattern(uv0, viewDir, t, patType, this.patternScaleUniform);
      // Optional universal micro-glitter boost controlled by Sparkle slider
      // @ts-ignore
      const microSparkle: any = evalCosmicStarfield(uv0, viewDir, t, this.patternScaleUniform.mul(1.15)).mul(this.sparkleIntensityUniform);

      // Stage 2: 4-Stop Chromatic Palette Ramp
      const basePalette: any = (evalChromaticRamp4 as any)(
        this.coreColorUniform,
        this.bellColorUniform,
        this.accentColorUniform,
        this.tipColorUniform,
        uv0.y,
        fresnel,
        patVal,
      );

      // Internal glowing gastric projection visible softly through apex/mid dome (restrained — never whiteout!)
      const innerHearthMask: any = float(1.0).sub(smoothstep(float(0.06), float(0.62), uv0.y));
      const innerHearthGlow: any = this.coreColorUniform.mul(innerHearthMask.mul(nDotV.mul(0.32).add(0.08)).mul(this.coreGlowUniform).mul(0.38));

      // Live screen-space RGB chromatic dispersion refraction (shared by Crystal / Botanical / Opal)
      const incident = positionWorld.sub(cameraPosition).normalize();
      const ior = this.iorUniform;
      const disp = this.dispersionUniform;
      const etaR = float(1.0).div(ior.add(disp));
      const etaG = float(1.0).div(ior);
      const etaB = float(1.0).div(max(ior.sub(disp), float(1.01)));
      const rVec = refract(incident, surfNormal, etaR);
      const gVec = refract(incident, surfNormal, etaG);
      const bVec = refract(incident, surfNormal, etaB);

      const invRes = vec2(
        float(1.0).div(max(this.refractionResolutionUniform.x, float(1.0))),
        float(1.0).div(max(this.refractionResolutionUniform.y, float(1.0))),
      );
      const refStr = max(this.refractionStrengthUniform, float(10.0));
      const uvR = clamp(screenUV.add(rVec.xy.mul(refStr).mul(invRes)), float(0.001), float(0.999));
      const uvG = clamp(screenUV.add(gVec.xy.mul(refStr).mul(invRes)), float(0.001), float(0.999));
      const uvB = clamp(screenUV.add(bVec.xy.mul(refStr).mul(invRes)), float(0.001), float(0.999));

      this.refractionTexNodeR = texture(this.refractionTexture, uvR);
      this.refractionTexNodeG = texture(this.refractionTexture, uvG);
      this.refractionTexNodeB = texture(this.refractionTexture, uvB);
      const refracted = vec3(this.refractionTexNodeR.r, this.refractionTexNodeG.g, this.refractionTexNodeB.b);

      // ── OPTICAL BASE 0: Prismatic Crystal Glass (Ref 1) ──
      const causticA = sin(uv0.x.mul(25.13).add(t.mul(1.3)).add(sin(uv0.y.mul(14.0).sub(t)).mul(1.1)));
      const causticB = cos(uv0.y.mul(19.0).sub(t.mul(1.6)).add(cos(uv0.x.mul(18.85)).mul(1.0)));
      const caustic = pow(clamp(causticA.mul(causticB).mul(0.5).add(0.5), float(0.0), float(1.0)), float(3.8));
      const dispEdge = mix(this.bellColorUniform, this.tipColorUniform, pow(rawRim, float(1.9)));
      const colCrystal = refracted
        .mul(0.65)
        .add(innerHearthGlow.mul(0.62))
        .add(basePalette.mul(fresnel.mul(0.65).add(patVal.mul(0.68)).add(0.08)))
        .add(dispEdge.mul(fresnel.mul(0.72).add(caustic.mul(0.28))))
        .add(vec3(0.84, 0.96, 1.0).mul(sharpGlint.mul(0.85)));

      // ── OPTICAL BASE 1: Abyssal Biolume Gel (Ref 2 & Ref 7 Sunset) ──
      const radialCanals = pow(clamp(cos(uv0.x.mul(75.398)).mul(0.5).add(0.5), float(0.0), float(1.0)), float(8.0)).mul(0.26);
      const marginDust = smoothstep(float(0.78), float(1.0), uv0.y).mul(fresnel.mul(0.65).add(0.28));
      const colAbyssal = this.accentColorUniform.mul(0.18)
        .add(basePalette.mul(0.52))
        .add(innerHearthGlow.mul(0.65))
        .add(this.bellColorUniform.mul(radialCanals.add(patVal.mul(0.74))))
        .add(this.tipColorUniform.mul(marginDust.mul(0.88)))
        .add(this.bellColorUniform.mul(fresnel.mul(0.72)));

      // ── OPTICAL BASE 2: Water-Clear Botanical Glass (Ref 3) ──
      const glassBody = refracted.mul(0.62).add(this.bellColorUniform.mul(0.12));
      const colBotanical = glassBody
        .add(innerHearthGlow.mul(0.55))
        .add(mix(this.accentColorUniform, this.tipColorUniform, rawRim).mul(patVal.mul(0.78)))
        .add(vec3(0.84, 0.98, 0.95).mul(fresnel.mul(0.68).add(sharpGlint.mul(0.82))));

      // ── OPTICAL BASE 3: Phosphorescent Flora Glow (Ref 4 — Crisp Jade Glass + Luminous Veins, ZERO Whiteout!) ──
      const centerSoft = float(1.0).sub(smoothstep(float(0.0), float(0.68), uv0.y));
      const marginBead = smoothstep(float(0.84), float(1.0), uv0.y);
      const colFlora = mix(this.accentColorUniform.mul(0.24), this.bellColorUniform.mul(0.46), centerSoft)
        .add(basePalette.mul(0.32))
        .add(mix(this.bellColorUniform, this.coreColorUniform, clamp(patVal, float(0.0), float(1.0))).mul(patVal.mul(0.95)))
        .add(this.tipColorUniform.mul(marginBead.mul(0.65).add(fresnel.mul(0.62))));

      // ── OPTICAL BASE 4: Frosted Cosmic Crystal (Ref 5) ──
      const foldBlush = pow(clamp(float(1.0).sub(abs(nDotV.sub(0.38))), float(0.0), float(1.0)), float(2.8));
      const colCosmic = mix(this.bellColorUniform.mul(0.38), this.accentColorUniform.mul(0.68), foldBlush)
        .add(innerHearthGlow.mul(0.55))
        .add(basePalette.mul(0.34))
        .add(this.bellColorUniform.mul(fresnel.mul(0.85)))
        .add(vec3(0.94, 0.97, 1.0).mul(patVal.mul(0.92).add(sharpGlint.mul(0.75))));

      // ── OPTICAL BASE 5: Opal Chromatophore Iridescence (Ref 6) ──
      const filmPhase = rawRim.mul(6.4).add(uv0.y.mul(3.6)).sub(t.mul(0.95)).add(sin(uv0.x.mul(12.566)).mul(0.4));
      const specR = cos(filmPhase).mul(0.5).add(0.5);
      const specG = cos(filmPhase.add(2.094)).mul(0.5).add(0.5);
      const specB = cos(filmPhase.add(4.188)).mul(0.5).add(0.5);
      const opalSpectrum = vec3(specR, specG, specB);
      const colOpal = refracted.mul(0.28)
        .add(mix(this.coreColorUniform.mul(0.42), this.bellColorUniform.mul(0.52), fresnel))
        .add(opalSpectrum.mul(fresnel.mul(0.62).add(0.14)))
        .add(this.accentColorUniform.mul(patVal.mul(0.85)))
        .add(this.tipColorUniform.mul(smoothstep(float(0.7), float(1.0), uv0.y).mul(fresnel.mul(0.72))))
        .add(vec3(0.95, 0.99, 1.0).mul(sharpGlint.mul(0.78)));

      // Blend selected optical base cleanly
      const w0: any = (selectWeight as any)(opt, float(0.0));
      const w1: any = (selectWeight as any)(opt, float(1.0));
      const w2: any = (selectWeight as any)(opt, float(2.0));
      const w3: any = (selectWeight as any)(opt, float(3.0));
      const w4: any = (selectWeight as any)(opt, float(4.0));
      const w5: any = (selectWeight as any)(opt, float(5.0));

      const rawOptical: any = colCrystal.mul(w0)
        .add(colAbyssal.mul(w1))
        .add(colBotanical.mul(w2))
        .add(colFlora.mul(w3))
        .add(colCosmic.mul(w4))
        .add(colOpal.mul(w5));

      // Filmic highlight shoulder on body mass -> keeps color deeply saturated and prevents whiteout!
      const tonemappedBody: any = rawOptical.div(rawOptical.mul(0.52).add(1.0));

      // Selective luminous accent layer (sharp procedural veins/pearls + cosmic sparkle) allowed to gently cross bloom threshold!
      const selectiveVeinGlow: any = mix(this.bellColorUniform, this.coreColorUniform, float(0.45))
        .mul(pow(clamp(patVal, float(0.0), float(1.3)), float(1.8)).mul(0.42));
      const sparkleTint: any = mix(vec3(0.95, 0.98, 1.0), this.coreColorUniform, float(0.35));
      const selectiveSparkle: any = sparkleTint.mul(microSparkle.mul(0.62));

      return tonemappedBody
        .mul(clamp(rim.mul(0.14).add(0.88), float(0.82), float(1.18)))
        .add(selectiveVeinGlow)
        .add(selectiveSparkle);
    });

    const bulbAlphaNode = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const surfNormal = normalize(normalWorld);
      const rawRim: any = clamp(float(1.0).sub(abs(dot(viewDir, surfNormal))), float(0.0), float(1.0));
      const fresnel: any = pow(rawRim, float(2.3));

      const uv0: any = uv();
      const t = this.timeUniform;
      const opt = this.opticalBaseUniform;
      const patType = this.patternTypeUniform;

      const patVal: any = (evalComposablePattern as any)(uv0, viewDir, t, patType, this.patternScaleUniform);

      // Crisp Fresnel-clear interior glass: transparent head-on (0.08..0.18) so internal anatomy shines clearly,
      // rising cleanly to vivid luminous rims & procedural veins!
      const aCrystal = clamp(fresnel.mul(0.72).add(patVal.mul(0.38)).add(0.08), float(0.08), float(0.86));
      const aAbyssal = clamp(fresnel.mul(0.62).add(patVal.mul(0.36)).add(0.18), float(0.14), float(0.88));
      const aBotanical = clamp(fresnel.mul(0.70).add(patVal.mul(0.40)).add(0.07), float(0.07), float(0.84));
      const aFlora = clamp(fresnel.mul(0.58).add(patVal.mul(0.48)).add(0.12), float(0.10), float(0.86));
      const aCosmic = clamp(fresnel.mul(0.68).add(patVal.mul(0.42)).add(0.16), float(0.12), float(0.88));
      const aOpal = clamp(fresnel.mul(0.66).add(patVal.mul(0.36)).add(0.20), float(0.14), float(0.88));

      const w0: any = (selectWeight as any)(opt, float(0.0));
      const w1: any = (selectWeight as any)(opt, float(1.0));
      const w2: any = (selectWeight as any)(opt, float(2.0));
      const w3: any = (selectWeight as any)(opt, float(3.0));
      const w4: any = (selectWeight as any)(opt, float(4.0));
      const w5: any = (selectWeight as any)(opt, float(5.0));

      const blendedAlpha = aCrystal.mul(w0)
        .add(aAbyssal.mul(w1))
        .add(aBotanical.mul(w2))
        .add(aFlora.mul(w3))
        .add(aCosmic.mul(w4))
        .add(aOpal.mul(w5));

      return clamp(blendedAlpha.mul(this.opacityUniform), float(0.06), float(0.90));
    });

    this.colorNode = bulbColorNode();
    this.opacityNode = bulbAlphaNode();
    this.transparent = true;
    this.blending = THREE.NormalBlending;
    this.side = THREE.DoubleSide;
    this.depthWrite = false;
  }

  setTime(time: number): void {
    this.timeUniform.value = time;
  }

  getTime(): number {
    return this.timeUniform.value;
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

  // Backward-compatible aliases
  setDiffuse(col: THREE.Color | number | string): void {
    this.setBellColor(col);
  }

  setDiffuseB(col: THREE.Color | number | string): void {
    this.setAccentColor(col);
  }

  setOpacity(opacity: number): void {
    this.opacityUniform.value = opacity;
  }

  setRimBoost(value: number): void {
    this.rimBoostUniform.value = value;
  }

  setPatternScale(scale: number): void {
    this.patternScaleUniform.value = Math.max(0.25, scale);
  }

  setPatternScale0(scale: number): void {
    this.setPatternScale(scale);
  }

  setPatternScale1(_scale: number): void {
    // Maintained for legacy compatibility
  }

  setSparkleIntensity(value: number): void {
    this.sparkleIntensityUniform.value = Math.max(0, Math.min(2.0, value));
  }

  setCoreGlow(value: number): void {
    this.coreGlowUniform.value = Math.max(0, Math.min(2.0, value));
  }

  setOpticalBase(index: number): void {
    this.opticalBaseUniform.value = Math.max(0, Math.min(5, Math.round(index)));
  }

  setPatternType(index: number): void {
    this.patternTypeUniform.value = Math.max(0, Math.min(7, Math.round(index)));
  }

  setMaterialStyle(styleIndex: number): void {
    this.setOpticalBase(styleIndex);
  }

  setIor(value: number): void {
    this.iorUniform.value = Math.max(1.01, value);
  }

  setDispersion(value: number): void {
    this.dispersionUniform.value = Math.max(0.0, value);
  }

  setRefractionStrength(value: number): void {
    this.refractionStrengthUniform.value = Math.max(0.0, value);
  }

  setRefractionResolution(width: number, height: number): void {
    this.refractionResolutionUniform.value.set(Math.max(1, width), Math.max(1, height));
  }

  setRefractionTexture(tex: THREE.Texture): void {
    this.refractionTexture = tex;
    if (this.refractionTexNodeR) this.refractionTexNodeR.value = tex;
    if (this.refractionTexNodeG) this.refractionTexNodeG.value = tex;
    if (this.refractionTexNodeB) this.refractionTexNodeB.value = tex;
  }
}

export default BulbNodeMaterial;
