/**
 * GelNodeMaterial.ts
 *
 * Subtle optical Fresnel wet-glass outer envelope wrapping the jellyfish bell.
 * Nearly invisible at direct incidence so the internal gastric core and patterns
 * remain razor-sharp, while catching delicate specular rim glow at grazing angles.
 */

import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  uniform,
  attribute,
  positionWorld,
  normalWorld,
  cameraPosition,
  normalize,
  dot,
  abs,
  pow,
  clamp,
  mix,
} from 'three/tsl';

export interface GelMaterialUniforms {
  diffuse?: number | string | THREE.Color;
  opacity?: number;
  stepProgress?: number;
}

export class GelNodeMaterial extends THREE.MeshBasicNodeMaterial {
  private diffuseUniform: any;
  private opacityUniform: any;
  private stepProgressUniform: any;

  constructor(params: GelMaterialUniforms = {}) {
    super({
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
    });

    const diffuseColor = params.diffuse !== undefined ? new THREE.Color(params.diffuse as any) : new THREE.Color(0x44c8ff);
    this.diffuseUniform = uniform(diffuseColor);
    this.opacityUniform = uniform(params.opacity ?? 0.22);
    this.stepProgressUniform = uniform(params.stepProgress ?? 0.0);

    const posCurr: any = attribute('position', 'vec3');
    const posPrev: any = attribute('positionPrev', 'vec3');
    this.positionNode = mix(posPrev, posCurr, this.stepProgressUniform);

    const gelColorFn = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV: any = abs(dot(viewDir, normalize(normalWorld)));
      const rim: any = pow(clamp(float(1.0).sub(nDotV), float(0.0), float(1.0)), float(4.2));
      return this.diffuseUniform.mul(rim.mul(1.05));
    });

    const gelAlphaFn = Fn(() => {
      const viewDir = cameraPosition.sub(positionWorld).normalize();
      const nDotV: any = abs(dot(viewDir, normalize(normalWorld)));
      const rim: any = pow(clamp(float(1.0).sub(nDotV), float(0.0), float(1.0)), float(3.8));
      return clamp(rim.mul(this.opacityUniform), float(0.0), float(0.18));
    });

    this.colorNode = gelColorFn();
    this.opacityNode = gelAlphaFn();
  }

  setDiffuse(col: number | string | THREE.Color): void {
    if (col instanceof THREE.Color) this.diffuseUniform.value.copy(col);
    else this.diffuseUniform.value.set(col as any);
  }

  setOpacity(opacity: number): void {
    this.opacityUniform.value = opacity;
  }

  updateOpacity(opacity: number): void {
    this.setOpacity(opacity);
  }

  setStepProgress(progress: number): void {
    this.stepProgressUniform.value = progress;
  }

  getStepProgress(): number {
    return this.stepProgressUniform.value;
  }
}

export default GelNodeMaterial;
