/**
 * GastricCoreMaterial.ts
 *
 * Dedicated luminous volumetric shader for the internal gastric core / gonad flower
 * suspended inside the jellyfish bell cavity (Refs 1, 2, 3, 4, 7).
 *
 * Gives genuine 3D parallax depth when viewed through the clear outer refractive dome.
 */

import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec3,
  uniform,
  uv,
  abs,
  sin,
  cos,
  pow,
  mix,
  clamp,
  dot,
  normalize,
  normalWorld,
  positionWorld,
  cameraPosition,
} from 'three/tsl';
import { InterpolatedNodeMaterial } from './InterpolatedNodeMaterial';

export class GastricCoreMaterial extends InterpolatedNodeMaterial {
  protected coreColorUniform: any;
  protected accentColorUniform: any;
  protected intensityUniform: any;
  protected timeUniform: any;

  constructor(parameters: THREE.MeshBasicNodeMaterialParameters = {}) {
    super({
      transparent: true,
      ...parameters,
    });

    this.coreColorUniform = uniform(new THREE.Color(0xffe58f));
    this.accentColorUniform = uniform(new THREE.Color(0x22e8ff));
    this.intensityUniform = uniform(0.95);
    this.timeUniform = uniform(0.0);

    const coreColorFn = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV: any = abs(dot(viewDir, normalize(normalWorld)));
      const centerGlow: any = pow(clamp(nDotV, float(0.0), float(1.0)), float(1.35));
      const rimGlow: any = pow(clamp(float(1.0).sub(nDotV), float(0.0), float(1.0)), float(2.1));

      const uv0: any = uv();
      const t = this.timeUniform;

      // Living undulating internal bioluminescent pulse + fluted gonad petals
      const petalFold: any = sin(uv0.x.mul(25.1327).add(sin(uv0.y.mul(8.0).sub(t.mul(1.6))).mul(0.8))).mul(0.24).add(0.76);
      const breathPulse: any = sin(t.mul(2.1).sub(uv0.y.mul(4.5))).mul(0.14).add(0.92);

      const heartCol: any = mix(this.accentColorUniform, this.coreColorUniform, clamp(centerGlow.mul(1.05), float(0.0), float(1.0)));
      const hotCenter: any = this.coreColorUniform.mul(pow(centerGlow, float(2.6)).mul(0.42));
      const rimCol: any = this.accentColorUniform.mul(rimGlow.mul(0.55));

      const rawCore: any = heartCol.mul(petalFold).mul(0.72).add(hotCenter).add(rimCol).mul(breathPulse).mul(this.intensityUniform);
      // Soft filmic shoulder keeps warm gold/emerald/indigo hues richly saturated (never flat white!)
      return rawCore.div(rawCore.mul(0.55).add(1.0)).mul(1.08);
    });

    const coreAlphaFn = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV: any = abs(dot(viewDir, normalize(normalWorld)));
      const uv0: any = uv();
      const edgeSoft: any = cos(clamp(uv0.y.sub(0.5), float(-0.5), float(0.5)).mul(3.14159));
      const bodyAlpha: any = clamp(nDotV.mul(0.58).add(0.18), float(0.14), float(0.76));
      return clamp(bodyAlpha.mul(edgeSoft.mul(0.72).add(0.28)).mul(this.intensityUniform), float(0.0), float(0.76));
    });

    this.colorNode = coreColorFn();
    this.opacityNode = coreAlphaFn();
    this.transparent = true;
    this.blending = THREE.NormalBlending;
    this.side = THREE.DoubleSide;
    this.depthWrite = false;
  }

  setCoreColor(col: THREE.Color | number | string): void {
    if (col instanceof THREE.Color) {
      this.coreColorUniform.value.copy(col);
    } else {
      this.coreColorUniform.value.set(col as any);
    }
  }

  setAccentColor(col: THREE.Color | number | string): void {
    if (col instanceof THREE.Color) {
      this.accentColorUniform.value.copy(col);
    } else {
      this.accentColorUniform.value.set(col as any);
    }
  }

  setIntensity(val: number): void {
    this.intensityUniform.value = Math.max(0, Math.min(2.0, val));
  }

  setTime(t: number): void {
    this.timeUniform.value = t;
  }
}

export default GastricCoreMaterial;
