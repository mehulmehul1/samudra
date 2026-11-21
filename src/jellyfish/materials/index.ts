/**
 * Materials module index
 *
 * Exports all composable WebGPU TSL jellyfish materials and pattern library.
 */

export {
  InterpolatedNodeMaterial,
  InterpolatedStandardMaterial,
  InterpolatedPhysicalMaterial,
  InterpolatedLineMaterial,
  InterpolatedPointsMaterial,
  type InterpolatedMaterial,
} from './InterpolatedNodeMaterial';

export { BulbNodeMaterial } from './BulbNodeMaterial';
export { TentacleNodeMaterial, type TentacleMaterialParams } from './TentacleNodeMaterial';
export { TailNodeMaterial } from './TailNodeMaterial';
export { GelNodeMaterial, type GelMaterialUniforms } from './GelNodeMaterial';
export { GastricCoreMaterial } from './GastricCoreMaterial';
export * from './TslPatternLibrary';

export {
  DustNodeMaterial,
  createDustTexture,
  createDustGeometry,
  createDustSystem,
  type DustNodeMaterialParameters,
} from './DustNodeMaterial';
