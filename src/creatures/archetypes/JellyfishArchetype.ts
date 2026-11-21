/**
 * JellyfishArchetype.ts
 *
 * Unified Particulate.js Soft-Body CreatureArchetype for Medusa Studio:
 * - 100% Particulate.js physics inside one shared ParticleSystem (zero singular PointForce
 *   explosions, zero AngleConstraint teleports, true exponential underwater Verlet damping).
 * - Catmull-Rom spline-subdivided parallel-transport 3D tube skinner for all discrete
 *   tentacles, gossamer filaments, pearl-beaded arms, and buoyant apex stamens (48 smooth
 *   spline rings × 6–8 radial segments, zero jagged elbows!).
 * - Catmull-Rom spline-subdivided 5-column curved 3D membrane skinner for all Oral Arms
 *   and discrete Silk Ribbons (48 smooth spline rings × 5 cross-sectional columns with silky
 *   non-aliased scalloped edges and organic U-trough camber!).
 * - Zero heap allocations inside the live animation loop.
 */

import * as THREE from 'three/webgpu';
import {
  CreatureArchetype,
  BodyData,
  PhysicsConfig,
  SeededRNG,
  UnitMaterialPack,
  MeshOptions,
  UnitRuntime,
} from './CreatureArchetype';
import {
  JellyfishGeometry,
  JellyfishGeometryData,
  type VerletTubeChain,
  type VerletRibbonChain,
  type OralArmRig,
} from '../../jellyfish/JellyfishGeometry';
import {
  BulbNodeMaterial,
  TentacleNodeMaterial,
  TailNodeMaterial,
  GelNodeMaterial,
  GastricCoreMaterial,
  InterpolatedLineMaterial,
} from '../../jellyfish/materials';
import { CreatureSpec, JellyfishSpec } from '../../jellyfish/creatures/CreatureSpec';
import { createCreatureRig } from '../../jellyfish/creatures';
import { LookConfig } from '../../editor/look-presets';
import { registerArchetype } from './archetypeRegistry';

interface SkinnedTubeRuntime {
  chain: VerletTubeChain;
  mesh: THREE.Mesh;
  ringCount: number;
  positions: Float32Array;
  positionsPrev: Float32Array;
  normals: Float32Array;
  splinePts: Float32Array;
}

interface SkinnedRibbonRuntime {
  chain: VerletRibbonChain;
  mesh: THREE.Mesh;
  positions: Float32Array;
  positionsPrev: Float32Array;
  innerSpline: Float32Array;
  outerSpline: Float32Array;
}

interface DynamicOralArmRuntime {
  mesh: THREE.Mesh;
  update: (sysPos: Float32Array, time: number, initial: boolean) => void;
}

// Reusable scratch vectors (zero GC allocations inside animation loop)
const _tan = new THREE.Vector3();
const _prevTan = new THREE.Vector3();
const _norm = new THREE.Vector3();
const _binorm = new THREE.Vector3();
const _rotAxis = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _vPos = new THREE.Vector3();
const _vNorm = new THREE.Vector3();
const _edgeVec = new THREE.Vector3();
const _surfNorm = new THREE.Vector3();
const _leafDir = new THREE.Vector3();
const _leafLat = new THREE.Vector3();
const _leafUp = new THREE.Vector3();
const _ptA = new THREE.Vector3();
const _ptB = new THREE.Vector3();
const _ptC = new THREE.Vector3();

/**
 * Evaluates a smooth uniform Catmull-Rom spline over a live Particulate node index chain
 * into a pre-allocated Float32Array (`outCount * 3`). Zero heap allocations!
 */
function sampleChainCatmullRom(
  nodes: number[],
  sysPos: Float32Array,
  outBuf: Float32Array,
  outCount: number,
): void {
  const n = nodes.length;
  if (n < 2) return;
  const maxSeg = n - 1;

  for (let s = 0; s < outCount; s++) {
    const u = s / Math.max(1, outCount - 1);
    const scaled = u * maxSeg;
    const i1 = Math.min(maxSeg - 1, Math.floor(scaled));
    const t = scaled - i1;
    const t2 = t * t;
    const t3 = t2 * t;

    const i0 = Math.max(0, i1 - 1);
    const i2 = Math.min(maxSeg, i1 + 1);
    const i3 = Math.min(maxSeg, i1 + 2);

    const p0 = nodes[i0] * 3;
    const p1 = nodes[i1] * 3;
    const p2 = nodes[i2] * 3;
    const p3 = nodes[i3] * 3;

    const o = s * 3;
    for (let c = 0; c < 3; c++) {
      const v0 = sysPos[p0 + c];
      const v1 = sysPos[p1 + c];
      const v2 = sysPos[p2 + c];
      const v3 = sysPos[p3 + c];
      outBuf[o + c] =
        0.5 *
        (2 * v1 +
          (-v0 + v2) * t +
          (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 +
          (-v0 + 3 * v1 - 3 * v2 + v3) * t3);
    }
  }
}

/**
 * Computes parallel-transport frames (`tangents`, `normals`, `binormals`, each `ringCount * 3`)
 * along a pre-sampled Catmull-Rom spline curve with zero allocations.
 */
function computeParallelTransportFrames(
  splinePts: Float32Array,
  ringCount: number,
  outTan: Float32Array,
  outNorm: Float32Array,
  outBinorm: Float32Array,
  defaultDirY: number = -1,
): void {
  for (let i = 0; i < ringCount; i++) {
    const o = i * 3;
    const cx = splinePts[o];
    const cy = splinePts[o + 1];
    const cz = splinePts[o + 2];

    if (i === 0) {
      _tan.set(splinePts[3] - cx, splinePts[4] - cy, splinePts[5] - cz);
    } else if (i === ringCount - 1) {
      const prevO = (i - 1) * 3;
      _tan.set(cx - splinePts[prevO], cy - splinePts[prevO + 1], cz - splinePts[prevO + 2]);
    } else {
      const prevO = (i - 1) * 3;
      const nextO = (i + 1) * 3;
      _tan.set(
        splinePts[nextO] - splinePts[prevO],
        splinePts[nextO + 1] - splinePts[prevO + 1],
        splinePts[nextO + 2] - splinePts[prevO + 2],
      );
    }

    if (_tan.lengthSq() < 1e-8) {
      _tan.set(0, defaultDirY, 0);
    } else {
      _tan.normalize();
    }

    if (i === 0) {
      const radLen = Math.hypot(cx, cz);
      if (radLen > 1e-4) {
        _norm.set(cx / radLen, 0, cz / radLen);
        _norm.addScaledVector(_tan, -_norm.dot(_tan));
      } else {
        _norm.set(1, 0, 0);
      }
      if (_norm.lengthSq() < 1e-6) {
        _norm.set(Math.abs(_tan.x) < 0.9 ? 1 : 0, 0, Math.abs(_tan.x) < 0.9 ? 0 : 1);
        _norm.addScaledVector(_tan, -_norm.dot(_tan));
      }
      _norm.normalize();
      _binorm.crossVectors(_tan, _norm).normalize();
      _prevTan.copy(_tan);
    } else {
      _rotAxis.crossVectors(_prevTan, _tan);
      const axisLen = _rotAxis.length();
      if (axisLen > 1e-6) {
        _rotAxis.divideScalar(axisLen);
        const angle = Math.acos(Math.max(-1, Math.min(1, _prevTan.dot(_tan))));
        _quat.setFromAxisAngle(_rotAxis, angle);
        _norm.applyQuaternion(_quat).normalize();
      }
      _binorm.crossVectors(_tan, _norm).normalize();
      _prevTan.copy(_tan);
    }

    outTan[o] = _tan.x;
    outTan[o + 1] = _tan.y;
    outTan[o + 2] = _tan.z;
    outNorm[o] = _norm.x;
    outNorm[o + 1] = _norm.y;
    outNorm[o + 2] = _norm.z;
    outBinorm[o] = _binorm.x;
    outBinorm[o + 1] = _binorm.y;
    outBinorm[o + 2] = _binorm.z;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Catmull-Rom Spline Parallel-Transport 3D Tube / Filament Skinner
// ─────────────────────────────────────────────────────────────────────────────
function createSkinnedTubeRuntime(
  chain: VerletTubeChain,
  systemPositions: Float32Array,
  material: THREE.Material,
): SkinnedTubeRuntime {
  const ringCount = chain.isStamen ? 24 : chain.isFilament ? 42 : 48;
  const radialSegs = Math.max(6, chain.radialSegments);
  const vertCount = ringCount * (radialSegs + 1);

  const positions = new Float32Array(vertCount * 3);
  const positionsPrev = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const splinePts = new Float32Array(ringCount * 3);

  for (let i = 0; i < ringCount; i++) {
    const v = i / Math.max(1, ringCount - 1);
    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const idx = (i * (radialSegs + 1) + j) * 2;
      uvs[idx] = u;
      uvs[idx + 1] = v;
    }
  }

  const indices: number[] = [];
  for (let i = 0; i < ringCount - 1; i++) {
    const row0 = i * (radialSegs + 1);
    const row1 = (i + 1) * (radialSegs + 1);
    for (let j = 0; j < radialSegs; j++) {
      const a = row0 + j;
      const b = row0 + j + 1;
      const c = row1 + j + 1;
      const d = row1 + j;
      indices.push(a, d, b, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('positionPrev', new THREE.BufferAttribute(positionsPrev, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;

  const runtime: SkinnedTubeRuntime = {
    chain,
    mesh,
    ringCount,
    positions,
    positionsPrev,
    normals,
    splinePts,
  };

  updateSkinnedTubeMesh(runtime, systemPositions, true);
  return runtime;
}

function updateSkinnedTubeMesh(
  rt: SkinnedTubeRuntime,
  sysPos: Float32Array,
  initial: boolean = false,
): void {
  const { chain, ringCount, positions, positionsPrev, normals, splinePts } = rt;
  const radialSegs = Math.max(6, chain.radialSegments);

  if (!initial) {
    positionsPrev.set(positions);
  }

  sampleChainCatmullRom(chain.nodeIndices, sysPos, splinePts, ringCount);

  for (let i = 0; i < ringCount; i++) {
    const o = i * 3;
    const cx = splinePts[o];
    const cy = splinePts[o + 1];
    const cz = splinePts[o + 2];

    if (i === 0) {
      _tan.set(splinePts[3] - cx, splinePts[4] - cy, splinePts[5] - cz);
    } else if (i === ringCount - 1) {
      const prevO = (i - 1) * 3;
      _tan.set(cx - splinePts[prevO], cy - splinePts[prevO + 1], cz - splinePts[prevO + 2]);
    } else {
      const prevO = (i - 1) * 3;
      const nextO = (i + 1) * 3;
      _tan.set(
        splinePts[nextO] - splinePts[prevO],
        splinePts[nextO + 1] - splinePts[prevO + 1],
        splinePts[nextO + 2] - splinePts[prevO + 2],
      );
    }

    if (_tan.lengthSq() < 1e-8) {
      _tan.set(0, chain.isStamen ? 1 : -1, 0);
    } else {
      _tan.normalize();
    }

    if (i === 0) {
      const radLen = Math.hypot(cx, cz);
      if (radLen > 1e-4) {
        _norm.set(cx / radLen, 0, cz / radLen);
        _norm.addScaledVector(_tan, -_norm.dot(_tan));
      } else {
        _norm.set(1, 0, 0);
      }
      if (_norm.lengthSq() < 1e-6) {
        _norm.set(Math.abs(_tan.x) < 0.9 ? 1 : 0, 0, Math.abs(_tan.x) < 0.9 ? 0 : 1);
        _norm.addScaledVector(_tan, -_norm.dot(_tan));
      }
      _norm.normalize();
      _binorm.crossVectors(_tan, _norm).normalize();
      _prevTan.copy(_tan);
    } else {
      _rotAxis.crossVectors(_prevTan, _tan);
      const axisLen = _rotAxis.length();
      if (axisLen > 1e-6) {
        _rotAxis.divideScalar(axisLen);
        const angle = Math.acos(Math.max(-1, Math.min(1, _prevTan.dot(_tan))));
        _quat.setFromAxisAngle(_rotAxis, angle);
        _norm.applyQuaternion(_quat).normalize();
      }
      _binorm.crossVectors(_tan, _norm).normalize();
      _prevTan.copy(_tan);
    }

    const t = i / Math.max(1, ringCount - 1);
    let r = chain.baseRadius + (chain.tipRadius - chain.baseRadius) * Math.pow(t, 0.72);

    if (chain.hasBulbTip && t > 0.84) {
      const bulbT = (t - 0.84) / 0.16;
      const droplet = Math.sin(bulbT * Math.PI);
      r = Math.max(0.05, r + droplet * chain.baseRadius * (chain.bulbScale ?? 2.8) * 0.65);
    }

    for (let j = 0; j <= radialSegs; j++) {
      const angle = (j / radialSegs) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      _vNorm
        .set(0, 0, 0)
        .addScaledVector(_norm, cosA)
        .addScaledVector(_binorm, sinA)
        .normalize();

      _vPos.set(cx, cy, cz).addScaledVector(_vNorm, r);

      const vIdx = (i * (radialSegs + 1) + j) * 3;
      positions[vIdx] = _vPos.x;
      positions[vIdx + 1] = _vPos.y;
      positions[vIdx + 2] = _vPos.z;
      normals[vIdx] = _vNorm.x;
      normals[vIdx + 1] = _vNorm.y;
      normals[vIdx + 2] = _vNorm.z;
    }
  }

  if (initial) {
    positionsPrev.set(positions);
  }

  const geo = rt.mesh.geometry;
  (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  (geo.getAttribute('positionPrev') as THREE.BufferAttribute).needsUpdate = true;
  (geo.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Catmull-Rom Spline Multi-Column Curved 3D Membrane Skinner
//    Used for Radial Curtain Oral Arms (Topology 1) & Discrete Silk Ribbons
// ─────────────────────────────────────────────────────────────────────────────
function createSkinnedRibbonRuntime(
  chain: VerletRibbonChain,
  systemPositions: Float32Array,
  material: THREE.Material,
): SkinnedRibbonRuntime {
  const rows = chain.lengthSubdivs;
  const cols = Math.max(3, chain.widthCols);
  const vertCount = rows * cols;

  const positions = new Float32Array(vertCount * 3);
  const positionsPrev = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const innerSpline = new Float32Array(rows * 3);
  const outerSpline = new Float32Array(rows * 3);

  for (let r = 0; r < rows; r++) {
    const vLen = r / Math.max(1, rows - 1);
    for (let c = 0; c < cols; c++) {
      const uWidth = c / Math.max(1, cols - 1);
      const idx = (r * cols + c) * 2;
      if (chain.isOralArm) {
        uvs[idx] = vLen;
        uvs[idx + 1] = uWidth;
      } else {
        uvs[idx] = uWidth;
        uvs[idx + 1] = vLen;
      }
    }
  }

  const indices: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    const row0 = r * cols;
    const row1 = (r + 1) * cols;
    for (let c = 0; c < cols - 1; c++) {
      const a = row0 + c;
      const b = row0 + c + 1;
      const d = row1 + c;
      const e = row1 + c + 1;
      indices.push(a, b, e, e, d, a);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('positionPrev', new THREE.BufferAttribute(positionsPrev, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;

  const runtime: SkinnedRibbonRuntime = {
    chain,
    mesh,
    positions,
    positionsPrev,
    innerSpline,
    outerSpline,
  };

  updateSkinnedRibbonMesh(runtime, systemPositions, 0, true);
  return runtime;
}

function updateSkinnedRibbonMesh(
  rt: SkinnedRibbonRuntime,
  sysPos: Float32Array,
  time: number,
  initial: boolean = false,
): void {
  const { chain, positions, positionsPrev, innerSpline, outerSpline } = rt;
  const rows = chain.lengthSubdivs;
  const cols = Math.max(3, chain.widthCols);

  if (!initial) {
    positionsPrev.set(positions);
  }

  sampleChainCatmullRom(chain.innerIndices, sysPos, innerSpline, rows);
  sampleChainCatmullRom(chain.outerIndices, sysPos, outerSpline, rows);

  const freq = chain.ruffleFreq;
  const amp = chain.ruffleAmp;
  const camber = chain.crossCurve;
  const phase = chain.phaseOffset;

  for (let r = 0; r < rows; r++) {
    const t = r / Math.max(1, rows - 1);
    const o = r * 3;
    const ix = innerSpline[o];
    const iy = innerSpline[o + 1];
    const iz = innerSpline[o + 2];
    const ox = outerSpline[o];
    const oy = outerSpline[o + 1];
    const oz = outerSpline[o + 2];

    if (r === 0) {
      _tan.set(innerSpline[3] - ix, innerSpline[4] - iy, innerSpline[5] - iz);
    } else if (r === rows - 1) {
      const pO = (r - 1) * 3;
      _tan.set(ix - innerSpline[pO], iy - innerSpline[pO + 1], iz - innerSpline[pO + 2]);
    } else {
      const pO = (r - 1) * 3;
      const nO = (r + 1) * 3;
      _tan.set(
        innerSpline[nO] - innerSpline[pO],
        innerSpline[nO + 1] - innerSpline[pO + 1],
        innerSpline[nO + 2] - innerSpline[pO + 2],
      );
    }
    if (_tan.lengthSq() < 1e-8) _tan.set(0, -1, 0);
    else _tan.normalize();

    _edgeVec.set(ox - ix, oy - iy, oz - iz);
    const ribbonWidth = _edgeVec.length();

    _surfNorm.crossVectors(_tan, _edgeVec);
    if (_surfNorm.lengthSq() < 1e-8) _surfNorm.set(1, 0, 0);
    else _surfNorm.normalize();

    const tipFade = Math.sin(Math.PI * Math.min(1, t * 1.04));
    const wave1 = Math.sin(t * Math.PI * freq * 2.0 - time * 1.05 + phase);
    const wave2 = Math.cos(t * Math.PI * freq * 1.0 - time * 0.65 + phase * 1.7);
    const scallopWidthMod = 1.0 + wave1 * amp * 0.28 * tipFade;

    for (let c = 0; c < cols; c++) {
      const w = c / Math.max(1, cols - 1);
      const uArch = Math.sin(w * Math.PI) * camber * ribbonWidth;
      const edgeRuffle = Math.pow(w, 1.45) * (wave1 * 0.72 + wave2 * 0.28) * amp * ribbonWidth * tipFade;
      const normalDisp = uArch + edgeRuffle;
      const wScaled = w * scallopWidthMod;

      const vIdx = (r * cols + c) * 3;
      positions[vIdx] = ix + _edgeVec.x * wScaled + _surfNorm.x * normalDisp;
      positions[vIdx + 1] = iy + _edgeVec.y * wScaled + _surfNorm.y * normalDisp;
      positions[vIdx + 2] = iz + _edgeVec.z * wScaled + _surfNorm.z * normalDisp;
    }
  }

  if (initial) {
    positionsPrev.set(positions);
  }

  const geo = rt.mesh.geometry;
  geo.computeVertexNormals();
  (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  (geo.getAttribute('positionPrev') as THREE.BufferAttribute).needsUpdate = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. TOPOLOGY 2 SKINNER: Botanical Kelp Frond (Central Stalk + 3D Paddle Leaves)
// ─────────────────────────────────────────────────────────────────────────────
function createKelpFrondRuntime(
  rig: Extract<OralArmRig, { kind: 'kelpFrond' }>,
  systemPositions: Float32Array,
  material: THREE.Material,
): DynamicOralArmRuntime {
  const stalkRings = 36;
  const stalkRadSegs = 6;
  const stalkVerts = stalkRings * (stalkRadSegs + 1);

  const leafCount = rig.leafCount;
  const leafRows = 10;
  const leafCols = 5;
  const vertsPerLeaf = leafRows * leafCols;
  const totalVerts = stalkVerts + leafCount * vertsPerLeaf;

  const positions = new Float32Array(totalVerts * 3);
  const positionsPrev = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);

  const splinePts = new Float32Array(stalkRings * 3);
  const tangents = new Float32Array(stalkRings * 3);
  const frameNorms = new Float32Array(stalkRings * 3);
  const frameBinorms = new Float32Array(stalkRings * 3);

  const indices: number[] = [];

  // Stalk UVs & indices
  for (let i = 0; i < stalkRings; i++) {
    const vLen = i / Math.max(1, stalkRings - 1);
    for (let j = 0; j <= stalkRadSegs; j++) {
      const idx = (i * (stalkRadSegs + 1) + j) * 2;
      uvs[idx] = vLen;
      uvs[idx + 1] = 0.15; // rich inner stem vein tint
    }
  }
  for (let i = 0; i < stalkRings - 1; i++) {
    const row0 = i * (stalkRadSegs + 1);
    const row1 = (i + 1) * (stalkRadSegs + 1);
    for (let j = 0; j < stalkRadSegs; j++) {
      indices.push(row0 + j, row1 + j, row0 + j + 1, row0 + j + 1, row1 + j, row1 + j + 1);
    }
  }

  // Alternating 3D spatulate paddle leaves UVs & indices
  for (let l = 0; l < leafCount; l++) {
    const baseV = stalkVerts + l * vertsPerLeaf;
    const leafFrac = 0.14 + (l / Math.max(1, leafCount - 1)) * 0.80;
    for (let r = 0; r < leafRows; r++) {
      const u = r / Math.max(1, leafRows - 1);
      for (let c = 0; c < leafCols; c++) {
        const w = c / Math.max(1, leafCols - 1);
        const uvIdx = (baseV + r * leafCols + c) * 2;
        uvs[uvIdx] = Math.min(1, leafFrac * 0.72 + u * 0.28);
        // Edge of paddle blade -> uv.y = 1 (bright bioluminescent leaf margin!), center -> 0.25
        uvs[uvIdx + 1] = 0.25 + 0.75 * Math.abs(w * 2 - 1);
      }
    }
    for (let r = 0; r < leafRows - 1; r++) {
      const r0 = baseV + r * leafCols;
      const r1 = baseV + (r + 1) * leafCols;
      for (let c = 0; c < leafCols - 1; c++) {
        indices.push(r0 + c, r0 + c + 1, r1 + c + 1, r1 + c + 1, r1 + c, r0 + c);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('positionPrev', new THREE.BufferAttribute(positionsPrev, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;

  const update = (sysPos: Float32Array, time: number, initial: boolean) => {
    if (!initial) positionsPrev.set(positions);

    sampleChainCatmullRom(rig.stalkIndices, sysPos, splinePts, stalkRings);
    computeParallelTransportFrames(splinePts, stalkRings, tangents, frameNorms, frameBinorms, -1);

    // A. Skin smooth cylindrical central stalk
    for (let i = 0; i < stalkRings; i++) {
      const o = i * 3;
      const cx = splinePts[o];
      const cy = splinePts[o + 1];
      const cz = splinePts[o + 2];
      _norm.set(frameNorms[o], frameNorms[o + 1], frameNorms[o + 2]);
      _binorm.set(frameBinorms[o], frameBinorms[o + 1], frameBinorms[o + 2]);

      const t = i / Math.max(1, stalkRings - 1);
      const rad = rig.stalkRadius * (1.0 - t * 0.62);

      for (let j = 0; j <= stalkRadSegs; j++) {
        const ang = (j / stalkRadSegs) * Math.PI * 2;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);
        const vIdx = (i * (stalkRadSegs + 1) + j) * 3;
        positions[vIdx] = cx + (_norm.x * cosA + _binorm.x * sinA) * rad;
        positions[vIdx + 1] = cy + (_norm.y * cosA + _binorm.y * sinA) * rad;
        positions[vIdx + 2] = cz + (_norm.z * cosA + _binorm.z * sinA) * rad;
      }
    }

    // B. Skin alternating 3D cupped spatulate paddle leaves along the live stalk!
    for (let l = 0; l < leafCount; l++) {
      const leafT = 0.14 + (l / Math.max(1, leafCount - 1)) * 0.80;
      const ringIdx = Math.min(stalkRings - 1, Math.max(1, Math.round(leafT * (stalkRings - 1))));
      const o = ringIdx * 3;

      const ax = splinePts[o];
      const ay = splinePts[o + 1];
      const az = splinePts[o + 2];
      _tan.set(tangents[o], tangents[o + 1], tangents[o + 2]);
      _norm.set(frameNorms[o], frameNorms[o + 1], frameNorms[o + 2]);
      _binorm.set(frameBinorms[o], frameBinorms[o + 1], frameBinorms[o + 2]);

      // Alternate left/right & slight helical phyllotaxis rotation around stalk
      const phylloAngle = l * 2.39996 + rig.phaseOffset;
      const cosP = Math.cos(phylloAngle);
      const sinP = Math.sin(phylloAngle);
      const leafSizeEnv = 0.62 + 0.56 * Math.sin(Math.PI * (0.12 + 0.82 * leafT));
      const lLen = rig.leafLength * leafSizeEnv;
      const lWid = rig.leafWidth * leafSizeEnv;

      // Outward-and-downward botanical leaf axis + lateral width axis + cup normal
      const outX = _norm.x * cosP + _binorm.x * sinP;
      const outY = _norm.y * cosP + _binorm.y * sinP;
      const outZ = _norm.z * cosP + _binorm.z * sinP;

      const gentleWave = Math.sin(time * 1.15 - leafT * 4.0 + rig.phaseOffset + l * 0.9) * 0.14;
      _leafDir.set(outX * (0.68 + gentleWave) + _tan.x * 0.74, outY * (0.68 + gentleWave) + _tan.y * 0.74, outZ * (0.68 + gentleWave) + _tan.z * 0.74).normalize();
      _leafLat.set(-_norm.x * sinP + _binorm.x * cosP, -_norm.y * sinP + _binorm.y * cosP, -_norm.z * sinP + _binorm.z * cosP).normalize();
      _leafUp.crossVectors(_leafDir, _leafLat).normalize();

      const baseV = stalkVerts + l * vertsPerLeaf;
      for (let r = 0; r < leafRows; r++) {
        const u = r / Math.max(1, leafRows - 1);
        // Narrow petiole base (u < 0.28) swelling into lush rounded spatulate kelp paddle!
        const halfW =
          u < 0.28
            ? lWid * (0.09 + 0.36 * (u / 0.28))
            : lWid * 0.52 * Math.max(0.04, Math.pow(Math.sin(Math.PI * Math.min(1, (u - 0.10) / 0.90)), 0.58));

        // Gentle droop curve along the length of the leaf
        const droop = Math.pow(u, 1.8) * lLen * 0.22;
        const cx = ax + _leafDir.x * (u * lLen) + _tan.x * droop;
        const cy = ay + _leafDir.y * (u * lLen) + _tan.y * droop;
        const cz = az + _leafDir.z * (u * lLen) + _tan.z * droop;

        for (let c = 0; c < leafCols; c++) {
          const w = (c / Math.max(1, leafCols - 1)) * 2 - 1; // -1 .. +1
          // 3D concave spoon cup + sculpted raised central vein ridge + delicate ruffled edge
          const cup = -Math.sin(Math.abs(w) * Math.PI * 0.5) * halfW * 0.32 * Math.sin(u * Math.PI);
          const veinRidge = Math.exp(-w * w * 10.0) * lWid * 0.08 * (1 - u * 0.6);
          const marginRuffle = Math.sin(u * Math.PI * 3.0 + l + time * 1.1) * halfW * 0.14 * (w * w);
          const upDisp = cup + veinRidge + marginRuffle;

          const vIdx = (baseV + r * leafCols + c) * 3;
          positions[vIdx] = cx + _leafLat.x * (w * halfW) + _leafUp.x * upDisp;
          positions[vIdx + 1] = cy + _leafLat.y * (w * halfW) + _leafUp.y * upDisp;
          positions[vIdx + 2] = cz + _leafLat.z * (w * halfW) + _leafUp.z * upDisp;
        }
      }
    }

    if (initial) positionsPrev.set(positions);
    geo.computeVertexNormals();
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('positionPrev') as THREE.BufferAttribute).needsUpdate = true;
  };

  update(systemPositions, 0, true);
  return { mesh, update };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. TOPOLOGY 3 SKINNER: Volumetric 3D Cauliflower / Coral Floret Clusters
// ─────────────────────────────────────────────────────────────────────────────
function createCauliflowerRuntime(
  rig: Extract<OralArmRig, { kind: 'cauliflowerCluster' }>,
  systemPositions: Float32Array,
  material: THREE.Material,
): DynamicOralArmRuntime {
  const stalkRings = 18;
  const stalkRadSegs = 6;
  const stalkVerts = stalkRings * (stalkRadSegs + 1);

  const floretCount = rig.floretCount;
  const latSegs = 8;
  const lonSegs = 16;
  const vertsPerFloret = (latSegs + 1) * (lonSegs + 1);
  const totalVerts = stalkVerts + floretCount * vertsPerFloret;

  const positions = new Float32Array(totalVerts * 3);
  const positionsPrev = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);

  const splinePts = new Float32Array(stalkRings * 3);
  const tangents = new Float32Array(stalkRings * 3);
  const frameNorms = new Float32Array(stalkRings * 3);
  const frameBinorms = new Float32Array(stalkRings * 3);

  // Precompute unit 3D scalloped 6-lobed cauliflower puff offsets (local x, y, z per vertex)
  const localFloret = new Float32Array(vertsPerFloret * 3);
  for (let lat = 0; lat <= latSegs; lat++) {
    const v = lat / latSegs;
    const phi = v * Math.PI;
    const sinP = Math.sin(phi);
    const cosP = Math.cos(phi);
    for (let lon = 0; lon <= lonSegs; lon++) {
      const u = lon / lonSegs;
      const theta = u * Math.PI * 2;
      // Rich volumetric 6-lobed scalloped coral/cauliflower relief!
      const lobe =
        1.0 +
        0.26 * Math.cos(theta * 6) * sinP +
        0.13 * Math.sin(theta * 12 - phi * 3) * sinP +
        0.10 * Math.cos(phi * 4);
      const o = (lat * (lonSegs + 1) + lon) * 3;
      localFloret[o] = Math.cos(theta) * sinP * lobe;
      localFloret[o + 1] = cosP * lobe * 0.72; // slightly oblate volumetric puff
      localFloret[o + 2] = Math.sin(theta) * sinP * lobe;
    }
  }

  const indices: number[] = [];
  for (let i = 0; i < stalkRings; i++) {
    const vLen = i / Math.max(1, stalkRings - 1);
    for (let j = 0; j <= stalkRadSegs; j++) {
      const idx = (i * (stalkRadSegs + 1) + j) * 2;
      uvs[idx] = vLen;
      uvs[idx + 1] = 0.2;
    }
  }
  for (let i = 0; i < stalkRings - 1; i++) {
    const r0 = i * (stalkRadSegs + 1);
    const r1 = (i + 1) * (stalkRadSegs + 1);
    for (let j = 0; j < stalkRadSegs; j++) {
      indices.push(r0 + j, r1 + j, r0 + j + 1, r0 + j + 1, r1 + j, r1 + j + 1);
    }
  }

  for (let f = 0; f < floretCount; f++) {
    const baseV = stalkVerts + f * vertsPerFloret;
    const fFrac = 0.14 + (f / Math.max(1, floretCount - 1)) * 0.82;
    for (let lat = 0; lat <= latSegs; lat++) {
      const v = lat / latSegs;
      for (let lon = 0; lon <= lonSegs; lon++) {
        const u = lon / lonSegs;
        const uvIdx = (baseV + lat * (lonSegs + 1) + lon) * 2;
        uvs[uvIdx] = Math.min(1, fFrac);
        uvs[uvIdx + 1] = 0.35 + 0.65 * Math.sin(v * Math.PI) * (0.65 + 0.35 * Math.cos(u * Math.PI * 12));
      }
    }
    for (let lat = 0; lat < latSegs; lat++) {
      const r0 = baseV + lat * (lonSegs + 1);
      const r1 = baseV + (lat + 1) * (lonSegs + 1);
      for (let lon = 0; lon < lonSegs; lon++) {
        indices.push(r0 + lon, r1 + lon, r0 + lon + 1, r0 + lon + 1, r1 + lon, r1 + lon + 1);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('positionPrev', new THREE.BufferAttribute(positionsPrev, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;

  const update = (sysPos: Float32Array, time: number, initial: boolean) => {
    if (!initial) positionsPrev.set(positions);

    sampleChainCatmullRom(rig.stalkIndices, sysPos, splinePts, stalkRings);
    computeParallelTransportFrames(splinePts, stalkRings, tangents, frameNorms, frameBinorms, -1);

    // Stalk tube
    for (let i = 0; i < stalkRings; i++) {
      const o = i * 3;
      const cx = splinePts[o];
      const cy = splinePts[o + 1];
      const cz = splinePts[o + 2];
      _norm.set(frameNorms[o], frameNorms[o + 1], frameNorms[o + 2]);
      _binorm.set(frameBinorms[o], frameBinorms[o + 1], frameBinorms[o + 2]);
      const t = i / Math.max(1, stalkRings - 1);
      const rad = rig.stalkRadius * (1.0 - t * 0.55);
      for (let j = 0; j <= stalkRadSegs; j++) {
        const ang = (j / stalkRadSegs) * Math.PI * 2;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);
        const vIdx = (i * (stalkRadSegs + 1) + j) * 3;
        positions[vIdx] = cx + (_norm.x * cosA + _binorm.x * sinA) * rad;
        positions[vIdx + 1] = cy + (_norm.y * cosA + _binorm.y * sinA) * rad;
        positions[vIdx + 2] = cz + (_norm.z * cosA + _binorm.z * sinA) * rad;
      }
    }

    // Stacked volumetric 3D 6-lobed cauliflower florets along the stalk
    for (let f = 0; f < floretCount; f++) {
      const fT = 0.14 + (f / Math.max(1, floretCount - 1)) * 0.82;
      const ringIdx = Math.min(stalkRings - 1, Math.max(1, Math.round(fT * (stalkRings - 1))));
      const o = ringIdx * 3;

      _tan.set(tangents[o], tangents[o + 1], tangents[o + 2]);
      _norm.set(frameNorms[o], frameNorms[o + 1], frameNorms[o + 2]);
      _binorm.set(frameBinorms[o], frameBinorms[o + 1], frameBinorms[o + 2]);

      // Alternating lateral offset so puffs cluster like natural coral/cauliflower crowns
      const spiralAng = f * 2.2 + rig.phaseOffset;
      const cosS = Math.cos(spiralAng);
      const sinS = Math.sin(spiralAng);
      const sizeScale = rig.floretRadius * (0.62 + 0.52 * Math.sin(Math.PI * (0.14 + 0.78 * fT)));
      const breathe = 1.0 + Math.sin(time * 1.4 - fT * 3.0 + rig.phaseOffset) * 0.05;
      const R = sizeScale * breathe;
      const offDist = R * 0.42;

      const fx = splinePts[o] + (_norm.x * cosS + _binorm.x * sinS) * offDist;
      const fy = splinePts[o + 1] + (_norm.y * cosS + _binorm.y * sinS) * offDist;
      const fz = splinePts[o + 2] + (_norm.z * cosS + _binorm.z * sinS) * offDist;

      // Rotated basis per floret for organic variety
      _leafDir.set(_norm.x * cosS + _binorm.x * sinS, _norm.y * cosS + _binorm.y * sinS, _norm.z * cosS + _binorm.z * sinS);
      _leafLat.set(-_norm.x * sinS + _binorm.x * cosS, -_norm.y * sinS + _binorm.y * cosS, -_norm.z * sinS + _binorm.z * cosS);

      const baseV = stalkVerts + f * vertsPerFloret;
      for (let k = 0; k < vertsPerFloret; k++) {
        const lo = k * 3;
        const lx = localFloret[lo] * R;
        const ly = localFloret[lo + 1] * R;
        const lz = localFloret[lo + 2] * R;

        const vIdx = (baseV + k) * 3;
        positions[vIdx] = fx + _leafDir.x * lx + _tan.x * ly + _leafLat.x * lz;
        positions[vIdx + 1] = fy + _leafDir.y * lx + _tan.y * ly + _leafLat.y * lz;
        positions[vIdx + 2] = fz + _leafDir.z * lx + _tan.z * ly + _leafLat.z * lz;
      }
    }

    if (initial) positionsPrev.set(positions);
    geo.computeVertexNormals();
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('positionPrev') as THREE.BufferAttribute).needsUpdate = true;
  };

  update(systemPositions, 0, true);
  return { mesh, update };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. TOPOLOGY 4 SKINNER: 3D Corkscrew Helical Auger (Core Spindle + 3D Screw Flange)
// ─────────────────────────────────────────────────────────────────────────────
function createHelicalAugerRuntime(
  rig: Extract<OralArmRig, { kind: 'helicalAuger' }>,
  systemPositions: Float32Array,
  material: THREE.Material,
): DynamicOralArmRuntime {
  const coreRings = 44;
  const coreRadSegs = 6;
  const coreVerts = coreRings * (coreRadSegs + 1);

  const finRings = 56;
  const finCols = 5;
  const finVerts = finRings * finCols;
  const totalVerts = coreVerts + finVerts;

  const positions = new Float32Array(totalVerts * 3);
  const positionsPrev = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);

  const coreSpline = new Float32Array(coreRings * 3);
  const coreTan = new Float32Array(coreRings * 3);
  const coreNorm = new Float32Array(coreRings * 3);
  const coreBinorm = new Float32Array(coreRings * 3);

  const finSpline = new Float32Array(finRings * 3);
  const finTan = new Float32Array(finRings * 3);
  const finNorm = new Float32Array(finRings * 3);
  const finBinorm = new Float32Array(finRings * 3);

  const indices: number[] = [];

  for (let i = 0; i < coreRings; i++) {
    const vLen = i / Math.max(1, coreRings - 1);
    for (let j = 0; j <= coreRadSegs; j++) {
      const idx = (i * (coreRadSegs + 1) + j) * 2;
      uvs[idx] = vLen;
      uvs[idx + 1] = 0.12;
    }
  }
  for (let i = 0; i < coreRings - 1; i++) {
    const r0 = i * (coreRadSegs + 1);
    const r1 = (i + 1) * (coreRadSegs + 1);
    for (let j = 0; j < coreRadSegs; j++) {
      indices.push(r0 + j, r1 + j, r0 + j + 1, r0 + j + 1, r1 + j, r1 + j + 1);
    }
  }

  for (let i = 0; i < finRings; i++) {
    const vLen = i / Math.max(1, finRings - 1);
    for (let c = 0; c < finCols; c++) {
      const w = c / Math.max(1, finCols - 1);
      const idx = (coreVerts + i * finCols + c) * 2;
      uvs[idx] = vLen;
      uvs[idx + 1] = w;
    }
  }
  for (let i = 0; i < finRings - 1; i++) {
    const r0 = coreVerts + i * finCols;
    const r1 = coreVerts + (i + 1) * finCols;
    for (let c = 0; c < finCols - 1; c++) {
      indices.push(r0 + c, r0 + c + 1, r1 + c + 1, r1 + c + 1, r1 + c, r0 + c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('positionPrev', new THREE.BufferAttribute(positionsPrev, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;

  const update = (sysPos: Float32Array, time: number, initial: boolean) => {
    if (!initial) positionsPrev.set(positions);

    sampleChainCatmullRom(rig.stalkIndices, sysPos, coreSpline, coreRings);
    computeParallelTransportFrames(coreSpline, coreRings, coreTan, coreNorm, coreBinorm, -1);

    sampleChainCatmullRom(rig.stalkIndices, sysPos, finSpline, finRings);
    computeParallelTransportFrames(finSpline, finRings, finTan, finNorm, finBinorm, -1);

    // A. Fluted central cylindrical core tube
    for (let i = 0; i < coreRings; i++) {
      const o = i * 3;
      const cx = coreSpline[o];
      const cy = coreSpline[o + 1];
      const cz = coreSpline[o + 2];
      _norm.set(coreNorm[o], coreNorm[o + 1], coreNorm[o + 2]);
      _binorm.set(coreBinorm[o], coreBinorm[o + 1], coreBinorm[o + 2]);
      const t = i / Math.max(1, coreRings - 1);
      const rad = rig.coreRadius * (1.0 - t * 0.72);
      for (let j = 0; j <= coreRadSegs; j++) {
        const ang = (j / coreRadSegs) * Math.PI * 2;
        const flute = 1.0 + Math.cos(ang * 3 + t * rig.turns * Math.PI * 2 * rig.handedness) * 0.14;
        const cosA = Math.cos(ang) * rad * flute;
        const sinA = Math.sin(ang) * rad * flute;
        const vIdx = (i * (coreRadSegs + 1) + j) * 3;
        positions[vIdx] = cx + _norm.x * cosA + _binorm.x * sinA;
        positions[vIdx + 1] = cy + _norm.y * cosA + _binorm.y * sinA;
        positions[vIdx + 2] = cz + _norm.z * cosA + _binorm.z * sinA;
      }
    }

    // B. Continuous protruding 3D helical screw flange wrapping the core tube!
    for (let i = 0; i < finRings; i++) {
      const o = i * 3;
      const cx = finSpline[o];
      const cy = finSpline[o + 1];
      const cz = finSpline[o + 2];
      _tan.set(finTan[o], finTan[o + 1], finTan[o + 2]);
      _norm.set(finNorm[o], finNorm[o + 1], finNorm[o + 2]);
      _binorm.set(finBinorm[o], finBinorm[o + 1], finBinorm[o + 2]);

      const t = i / Math.max(1, finRings - 1);
      const env = Math.sin(Math.PI * (0.04 + 0.94 * t));
      const coreR = rig.coreRadius * (1.0 - t * 0.72);
      const finSpan = rig.finWidth * Math.pow(Math.max(0.05, env), 0.72);
      const theta = t * Math.PI * 2 * rig.turns * rig.handedness + rig.phaseOffset - time * 0.45 * rig.handedness;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Outward radial direction of screw blade at angle theta
      const rx = _norm.x * cosT + _binorm.x * sinT;
      const ry = _norm.y * cosT + _binorm.y * sinT;
      const rz = _norm.z * cosT + _binorm.z * sinT;

      for (let c = 0; c < finCols; c++) {
        const w = c / Math.max(1, finCols - 1);
        const dist = coreR * 0.85 + w * finSpan;
        // Sculpted curved auger pitch cup along tangent so the fin has authentic 3D scroll curvature
        const cupAlongTan = Math.sin(w * Math.PI) * finSpan * 0.28 + Math.pow(w, 2) * finSpan * 0.14;
        const vIdx = (coreVerts + i * finCols + c) * 3;
        positions[vIdx] = cx + rx * dist + _tan.x * cupAlongTan;
        positions[vIdx + 1] = cy + ry * dist + _tan.y * cupAlongTan;
        positions[vIdx + 2] = cz + rz * dist + _tan.z * cupAlongTan;
      }
    }

    if (initial) positionsPrev.set(positions);
    geo.computeVertexNormals();
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('positionPrev') as THREE.BufferAttribute).needsUpdate = true;
  };

  update(systemPositions, 0, true);
  return { mesh, update };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. TOPOLOGY 5 SKINNER: Double-Curved 3D Concave Cupped Blossom Petal
// ─────────────────────────────────────────────────────────────────────────────
function createCuppedPetalRuntime(
  rig: Extract<OralArmRig, { kind: 'cuppedPetal' }>,
  systemPositions: Float32Array,
  material: THREE.Material,
): DynamicOralArmRuntime {
  const rows = 32;
  const cols = 9;
  const vertCount = rows * cols;

  const positions = new Float32Array(vertCount * 3);
  const positionsPrev = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);

  const leftSpline = new Float32Array(rows * 3);
  const midSpline = new Float32Array(rows * 3);
  const rightSpline = new Float32Array(rows * 3);

  for (let r = 0; r < rows; r++) {
    const vLen = r / Math.max(1, rows - 1);
    for (let c = 0; c < cols; c++) {
      const uW = c / Math.max(1, cols - 1);
      const idx = (r * cols + c) * 2;
      uvs[idx] = vLen;
      uvs[idx + 1] = Math.abs(uW * 2 - 1); // glowing luminous sepal edges + delicate center vein
    }
  }

  const indices: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    const r0 = r * cols;
    const r1 = (r + 1) * cols;
    for (let c = 0; c < cols - 1; c++) {
      indices.push(r0 + c, r0 + c + 1, r1 + c + 1, r1 + c + 1, r1 + c, r0 + c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('positionPrev', new THREE.BufferAttribute(positionsPrev, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;

  const update = (sysPos: Float32Array, _time: number, initial: boolean) => {
    if (!initial) positionsPrev.set(positions);

    sampleChainCatmullRom(rig.leftIndices, sysPos, leftSpline, rows);
    sampleChainCatmullRom(rig.midIndices, sysPos, midSpline, rows);
    sampleChainCatmullRom(rig.rightIndices, sysPos, rightSpline, rows);

    for (let r = 0; r < rows; r++) {
      const t = r / Math.max(1, rows - 1);
      const o = r * 3;
      _ptA.set(leftSpline[o], leftSpline[o + 1], leftSpline[o + 2]);
      _ptB.set(midSpline[o], midSpline[o + 1], midSpline[o + 2]);
      _ptC.set(rightSpline[o], rightSpline[o + 1], rightSpline[o + 2]);

      if (r === 0) {
        _tan.set(midSpline[3] - _ptB.x, midSpline[4] - _ptB.y, midSpline[5] - _ptB.z);
      } else if (r === rows - 1) {
        const pO = (r - 1) * 3;
        _tan.set(_ptB.x - midSpline[pO], _ptB.y - midSpline[pO + 1], _ptB.z - midSpline[pO + 2]);
      } else {
        const pO = (r - 1) * 3;
        const nO = (r + 1) * 3;
        _tan.set(midSpline[nO] - midSpline[pO], midSpline[nO + 1] - midSpline[pO + 1], midSpline[nO + 2] - midSpline[pO + 2]);
      }
      if (_tan.lengthSq() < 1e-8) _tan.set(0, -1, 0);
      else _tan.normalize();

      _edgeVec.subVectors(_ptC, _ptA);
      _surfNorm.crossVectors(_tan, _edgeVec);
      if (_surfNorm.lengthSq() < 1e-8) _surfNorm.set(1, 0, 0);
      else _surfNorm.normalize();

      // Orient petal outward normal consistently away from creature axis
      if (_surfNorm.x * _ptB.x + _surfNorm.z * _ptB.z < 0) {
        _surfNorm.negate();
      }

      const sinEnv = Math.sin(t * Math.PI);
      for (let c = 0; c < cols; c++) {
        const s = c / Math.max(1, cols - 1); // 0 .. 1
        const w = s * 2 - 1; // -1 .. +1
        // Quadratic Bezier curve through (left, mid_bulged, right) for genuine concave spoon shell
        const omt = 1 - s;
        const b0 = omt * omt;
        const b1 = 2 * omt * s;
        const b2 = s * s;

        const ctrlX = _ptB.x + _surfNorm.x * rig.cupDepth * sinEnv;
        const ctrlY = _ptB.y + _surfNorm.y * rig.cupDepth * sinEnv;
        const ctrlZ = _ptB.z + _surfNorm.z * rig.cupDepth * sinEnv;

        // Raised sculpted dorsal midrib ridge along w = 0
        const midrib = Math.exp(-w * w * 14.0) * rig.midribHeight * sinEnv;

        const vIdx = (r * cols + c) * 3;
        positions[vIdx] = b0 * _ptA.x + b1 * ctrlX + b2 * _ptC.x + _surfNorm.x * midrib;
        positions[vIdx + 1] = b0 * _ptA.y + b1 * ctrlY + b2 * _ptC.y + _surfNorm.y * midrib;
        positions[vIdx + 2] = b0 * _ptA.z + b1 * ctrlZ + b2 * _ptC.z + _surfNorm.z * midrib;
      }
    }

    if (initial) positionsPrev.set(positions);
    geo.computeVertexNormals();
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('positionPrev') as THREE.BufferAttribute).needsUpdate = true;
  };

  update(systemPositions, 0, true);
  return { mesh, update };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. TOPOLOGY 6 SKINNER: Closed 360° Concentric Circular Pleated Rosette Collar
// ─────────────────────────────────────────────────────────────────────────────
function createPleatedRosetteRuntime(
  rig: Extract<OralArmRig, { kind: 'pleatedRosette' }>,
  systemPositions: Float32Array,
  material: THREE.Material,
): DynamicOralArmRuntime {
  const srcRows = rig.ringStarts.length;
  const srcSegs = rig.ringSegments;
  const outRows = 14;
  const outSegs = srcSegs * 2; // 96 smooth circumferential segments for crisp baroque pleats!
  const vertCount = outRows * (outSegs + 1);

  const positions = new Float32Array(vertCount * 3);
  const positionsPrev = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);

  // Pre-allocated intermediate grid (srcRows × outSegs) for periodic Catmull-Rom circumferential interpolation
  const ringGrid = new Float32Array(srcRows * outSegs * 3);

  for (let r = 0; r < outRows; r++) {
    const vLen = r / Math.max(1, outRows - 1);
    for (let s = 0; s <= outSegs; s++) {
      const idx = (r * (outSegs + 1) + s) * 2;
      uvs[idx] = vLen;
      // Outer pleated skirt hem glows brightly via uv.y!
      uvs[idx + 1] = 0.25 + 0.75 * Math.pow(vLen, 0.85);
    }
  }

  const indices: number[] = [];
  for (let r = 0; r < outRows - 1; r++) {
    const r0 = r * (outSegs + 1);
    const r1 = (r + 1) * (outSegs + 1);
    for (let s = 0; s < outSegs; s++) {
      indices.push(r0 + s, r0 + s + 1, r1 + s + 1, r1 + s + 1, r1 + s, r0 + s);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('positionPrev', new THREE.BufferAttribute(positionsPrev, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;

  const update = (sysPos: Float32Array, time: number, initial: boolean) => {
    if (!initial) positionsPrev.set(positions);

    // Step 1: periodic Catmull-Rom circumferential upsampling per Particulate cloth ring
    for (let sr = 0; sr < srcRows; sr++) {
      const ringStart = rig.ringStarts[sr];
      const rowOff = sr * outSegs * 3;
      for (let os = 0; os < outSegs; os++) {
        const u = (os / outSegs) * srcSegs;
        const i1 = Math.floor(u) % srcSegs;
        const t = u - Math.floor(u);
        const t2 = t * t;
        const t3 = t2 * t;

        const i0 = (i1 - 1 + srcSegs) % srcSegs;
        const i2 = (i1 + 1) % srcSegs;
        const i3 = (i1 + 2) % srcSegs;

        const p0 = (ringStart + i0) * 3;
        const p1 = (ringStart + i1) * 3;
        const p2 = (ringStart + i2) * 3;
        const p3 = (ringStart + i3) * 3;

        const dst = rowOff + os * 3;
        for (let c = 0; c < 3; c++) {
          const v0 = sysPos[p0 + c];
          const v1 = sysPos[p1 + c];
          const v2 = sysPos[p2 + c];
          const v3 = sysPos[p3 + c];
          ringGrid[dst + c] =
            0.5 *
            (2 * v1 +
              (-v0 + v2) * t +
              (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 +
              (-v0 + 3 * v1 - 3 * v2 + v3) * t3);
        }
      }
    }

    // Step 2: vertical Catmull-Rom interpolation + crisp non-aliased baroque pleat flutes!
    const maxSegR = srcRows - 1;
    for (let r = 0; r < outRows; r++) {
      const vFrac = r / Math.max(1, outRows - 1);
      const scaled = vFrac * maxSegR;
      const r1 = Math.min(maxSegR - 1, Math.floor(scaled));
      const t = scaled - r1;
      const t2 = t * t;
      const t3 = t2 * t;
      const r0 = Math.max(0, r1 - 1);
      const r2 = Math.min(maxSegR, r1 + 1);
      const r3 = Math.min(maxSegR, r1 + 2);

      // Compute ring centroid for radial pleat displacement
      let cx = 0;
      let cz = 0;
      for (let s = 0; s < outSegs; s++) {
        const o1 = (r1 * outSegs + s) * 3;
        cx += ringGrid[o1];
        cz += ringGrid[o1 + 2];
      }
      cx /= outSegs;
      cz /= outSegs;

      const pleatEnv = Math.pow(vFrac, 1.35);

      for (let s = 0; s <= outSegs; s++) {
        const sWrapped = s % outSegs;
        const o0 = (r0 * outSegs + sWrapped) * 3;
        const o1 = (r1 * outSegs + sWrapped) * 3;
        const o2 = (r2 * outSegs + sWrapped) * 3;
        const o3 = (r3 * outSegs + sWrapped) * 3;

        let px =
          0.5 *
          (2 * ringGrid[o1] +
            (-ringGrid[o0] + ringGrid[o2]) * t +
            (2 * ringGrid[o0] - 5 * ringGrid[o1] + 4 * ringGrid[o2] - ringGrid[o3]) * t2 +
            (-ringGrid[o0] + 3 * ringGrid[o1] - 3 * ringGrid[o2] + ringGrid[o3]) * t3);
        let py =
          0.5 *
          (2 * ringGrid[o1 + 1] +
            (-ringGrid[o0 + 1] + ringGrid[o2 + 1]) * t +
            (2 * ringGrid[o0 + 1] - 5 * ringGrid[o1 + 1] + 4 * ringGrid[o2 + 1] - ringGrid[o3 + 1]) * t2 +
            (-ringGrid[o0 + 1] + 3 * ringGrid[o1 + 1] - 3 * ringGrid[o2 + 1] + ringGrid[o3 + 1]) * t3);
        let pz =
          0.5 *
          (2 * ringGrid[o1 + 2] +
            (-ringGrid[o0 + 2] + ringGrid[o2 + 2]) * t +
            (2 * ringGrid[o0 + 2] - 5 * ringGrid[o1 + 2] + 4 * ringGrid[o2 + 2] - ringGrid[o3 + 2]) * t2 +
            (-ringGrid[o0 + 2] + 3 * ringGrid[o1 + 2] - 3 * ringGrid[o2 + 2] + ringGrid[o3 + 2]) * t3);

        // Secondary delicate scalloped pleat wave along the lower hem
        const ang = (sWrapped / outSegs) * Math.PI * 2;
        const dx = px - cx;
        const dz = pz - cz;
        const microPleat = 1.0 + Math.sin(ang * rig.pleatFolds * 2 - time * 0.9 + rig.phaseOffset) * 0.08 * pleatEnv;
        px = cx + dx * microPleat;
        pz = cz + dz * microPleat;
        py += Math.cos(ang * rig.pleatFolds + rig.phaseOffset) * 0.65 * pleatEnv;

        const dst = (r * (outSegs + 1) + s) * 3;
        positions[dst] = px;
        positions[dst + 1] = py;
        positions[dst + 2] = pz;
      }
    }

    if (initial) positionsPrev.set(positions);
    geo.computeVertexNormals();
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('positionPrev') as THREE.BufferAttribute).needsUpdate = true;
  };

  update(systemPositions, 0, true);
  return { mesh, update };
}

function createOralArmRigRuntime(
  rig: OralArmRig,
  systemPositions: Float32Array,
  material: THREE.Material,
): DynamicOralArmRuntime {
  if (rig.kind === 'curtain') {
    const rt = createSkinnedRibbonRuntime(
      {
        innerIndices: rig.innerIndices,
        outerIndices: rig.outerIndices,
        widthCols: rig.widthCols,
        lengthSubdivs: rig.lengthSubdivs,
        ruffleAmp: rig.ruffleAmp,
        ruffleFreq: rig.ruffleFreq,
        crossCurve: rig.crossCurve,
        phaseOffset: rig.phaseOffset,
        isOralArm: true,
        shapeMode: rig.shapeMode,
      },
      systemPositions,
      material,
    );
    return {
      mesh: rt.mesh,
      update: (sysPos, time, initial) => updateSkinnedRibbonMesh(rt, sysPos, time, initial),
    };
  }
  if (rig.kind === 'kelpFrond') {
    return createKelpFrondRuntime(rig, systemPositions, material);
  }
  if (rig.kind === 'cauliflowerCluster') {
    return createCauliflowerRuntime(rig, systemPositions, material);
  }
  if (rig.kind === 'helicalAuger') {
    return createHelicalAugerRuntime(rig, systemPositions, material);
  }
  if (rig.kind === 'cuppedPetal') {
    return createCuppedPetalRuntime(rig, systemPositions, material);
  }
  return createPleatedRosetteRuntime(rig, systemPositions, material);
}

function tentacleProfileToOrnamentMode(
  style: 'curtain' | 'tube',
  profile?: string,
): number {
  if (profile === 'stippledCurtain') return 2;
  if (profile === 'bulbFilaments') return 3;
  if (profile === 'beadedArms') return 4;
  if (profile === 'crystalTendrils') return 5;
  return style === 'tube' ? 1 : 0;
}

export const jellyfishArchetype: CreatureArchetype = {
  id: 'jellyfish',
  label: 'Jellyfish',

  buildBody(spec: CreatureSpec, _config: PhysicsConfig, _rng: SeededRNG): BodyData {
    const rig = createCreatureRig(spec);
    const unitData = rig.units.map((u) => {
      const geometryData = JellyfishGeometry.create(u.spec);
      return { id: u.id, transform: u.transform, geometryData };
    });
    return {
      geometryData: { rig, units: unitData },
      physicsComponents: {},
      animationState: { pulseSpeed: 0.5, pulseAmplitude: 0.15, surgeY: 0 },
    } as BodyData;
  },

  createMaterials(_lookConfig: LookConfig, refractionTarget: unknown): UnitMaterialPack {
    return { refractionTarget } as unknown as UnitMaterialPack;
  },

  buildMeshes(
    data: BodyData,
    materials: UnitMaterialPack,
    options: MeshOptions,
  ): UnitRuntime[] {
    const d = data as any;
    const matPack = materials as any;
    const refractionTarget = matPack.refractionTarget as THREE.RenderTarget | undefined;
    const showConstraints = !!(options as any).showConstraints;
    const units: any[] = [];

    for (const ud of d.geometryData.units) {
      const gd = ud.geometryData as JellyfishGeometryData;
      const spec = gd.spec as JellyfishSpec;

      // ── Per-unit composable materials ──
      const bulbMaterial = new BulbNodeMaterial();
      if (refractionTarget) {
        bulbMaterial.setRefractionTexture(refractionTarget.texture);
        bulbMaterial.setRefractionStrength(20);
        bulbMaterial.setIor(1.42);
        bulbMaterial.setDispersion(0.045);
        bulbMaterial.setRefractionResolution(refractionTarget.width, refractionTarget.height);
      }

      const gelMaterial = new GelNodeMaterial({
        diffuse: 0x44c8ff,
        opacity: 0.14,
      });

      const gastricCoreMaterial = new GastricCoreMaterial();
      gastricCoreMaterial.setIntensity(gd.config.gastricCoreIntensity ?? 0.9);

      const tailMaterial = new TailNodeMaterial();
      tailMaterial.setIsOralArm(false);
      tailMaterial.updateOpacity(0.56);

      const mouthMaterial = new TailNodeMaterial();
      mouthMaterial.setIsOralArm(true);
      mouthMaterial.setScale(9);
      mouthMaterial.updateOpacity(0.76);

      const tentacleStyle = spec.tentacleStyle ?? 'curtain';
      const ornamentMode = tentacleProfileToOrnamentMode(tentacleStyle, gd.config.tentacleProfile);
      const isDiscreteTubeOrFilament = gd.verletTubeChains.length > 0;
      const tentacleMaterial = new TentacleNodeMaterial({
        color: 0x22e8ff,
        diffuseB: 0xff7a1a,
        transparent: true,
        opacity: isDiscreteTubeOrFilament ? 0.84 : 0.74,
        depthTest: true,
        depthWrite: false,
        useGlow: false,
        ornamentMode,
      });
      tentacleMaterial.setArea(2000);

      const stamenMaterial = new TentacleNodeMaterial({
        color: 0xc6ff9e,
        diffuseB: 0xf7fff4,
        transparent: true,
        opacity: 0.94,
        depthTest: true,
        depthWrite: false,
        useGlow: false,
        ornamentMode: 3,
      });

      // ── Unified 1.0 Coordinate Space Mesh Group ──
      const group = new THREE.Group();
      const lineMaterials: InterpolatedLineMaterial[] = [];
      const dynamicNormalGeometries: THREE.BufferGeometry[] = [];
      const skinnedTubes: SkinnedTubeRuntime[] = [];
      const skinnedRibbons: SkinnedRibbonRuntime[] = [];
      const dynamicOralArms: DynamicOralArmRuntime[] = [];

      const makePartGeometry = (indexArray: number[]): THREE.BufferGeometry => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', gd.position);
        geo.setAttribute('positionPrev', gd.positionPrev);
        geo.setAttribute('uv', new THREE.BufferAttribute(gd.uvs, 2));
        geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(gd.position.array.length), 3));
        geo.setIndex(indexArray);
        geo.computeVertexNormals();
        dynamicNormalGeometries.push(geo);
        return geo;
      };

      // 1. Internal Gastric Core (rendered first inside bell cavity for crisp parallax)
      if (gd.faces.gastricCore.length > 0) {
        const coreGeo = makePartGeometry(gd.faces.gastricCore);
        const coreMesh = new THREE.Mesh(coreGeo, gastricCoreMaterial);
        coreMesh.renderOrder = 1;
        group.add(coreMesh);
      }

      // 2. Six Distinct 3D Oral Arm Topologies (anchored wide across the full-width inner bell!)
      if (gd.oralArmRigs.length > 0) {
        for (const rig of gd.oralArmRigs) {
          const rt = createOralArmRigRuntime(rig, gd.system.positions, mouthMaterial);
          rt.mesh.renderOrder = 2;
          group.add(rt.mesh);
          dynamicOralArms.push(rt);
        }
      } else if (gd.oralArmChains.length > 0) {
        for (const chain of gd.oralArmChains) {
          const rt = createSkinnedRibbonRuntime(chain, gd.system.positions, mouthMaterial);
          rt.mesh.renderOrder = 2;
          group.add(rt.mesh);
          skinnedRibbons.push(rt);
        }
      } else if (gd.faces.mouth.length > 0) {
        const mouthGeo = makePartGeometry(gd.faces.mouth);
        const mouthMesh = new THREE.Mesh(mouthGeo, mouthMaterial);
        mouthMesh.renderOrder = 2;
        group.add(mouthMesh);
      }

      // 3. Full-Width Inner Bell / Subumbrella (connected flush to outer bell margin!)
      if (gd.faces.tail.length > 0) {
        const tailGeo = makePartGeometry(gd.faces.tail);
        const tailMesh = new THREE.Mesh(tailGeo, tailMaterial);
        tailMesh.renderOrder = 3;
        group.add(tailMesh);
      }

      // 4. Subumbrella-Anchored Discrete Tentacles (Catmull-Rom tubes, filaments, or silk ribbons)
      if (gd.verletTubeChains.length > 0) {
        for (const chain of gd.verletTubeChains) {
          const rt = createSkinnedTubeRuntime(chain, gd.system.positions, tentacleMaterial);
          rt.mesh.renderOrder = 4;
          group.add(rt.mesh);
          skinnedTubes.push(rt);
        }
      } else if (gd.ribbonChains.length > 0) {
        for (const chain of gd.ribbonChains) {
          const rt = createSkinnedRibbonRuntime(chain, gd.system.positions, tentacleMaterial);
          rt.mesh.renderOrder = 4;
          group.add(rt.mesh);
          skinnedRibbons.push(rt);
        }
      } else if (gd.faces.tentacles.length > 0) {
        const tentGeo = makePartGeometry(gd.faces.tentacles);
        const tentMesh = new THREE.Mesh(tentGeo, tentacleMaterial);
        tentMesh.renderOrder = 4;
        group.add(tentMesh);
      }

      // 5. Apex Stamen Antennae (smooth Catmull-Rom botanical arches with pearl bulbs)
      if (gd.stamenChains.length > 0) {
        for (const chain of gd.stamenChains) {
          const rt = createSkinnedTubeRuntime(chain, gd.system.positions, stamenMaterial);
          rt.mesh.renderOrder = 5;
          group.add(rt.mesh);
          skinnedTubes.push(rt);
        }
      }

      // 6. Outer Bell Dome Shell (exact 1.0 scale)
      const bulbGeo = makePartGeometry(gd.faces.bulb);
      const bulbMesh = new THREE.Mesh(bulbGeo, bulbMaterial);
      bulbMesh.renderOrder = 6;
      group.add(bulbMesh);

      // 7. Ultra-delicate Outer Fresnel Wet-Glass Envelope
      const gelMesh = new THREE.Mesh(bulbGeo, gelMaterial);
      gelMesh.scale.setScalar(1.018);
      gelMesh.renderOrder = 7;
      group.add(gelMesh);

      // 8. Toggleable Clean Anatomical Rib Lines
      if (gd.links.linesFore.length > 0) {
        const lfGeo = new THREE.BufferGeometry();
        lfGeo.setAttribute('position', gd.position);
        lfGeo.setAttribute('positionPrev', gd.positionPrev);
        lfGeo.setIndex(gd.links.linesFore);
        const lfMat = new InterpolatedLineMaterial({
          color: 0xffdde9,
          transparent: true,
          opacity: 0.08,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false,
        });
        lineMaterials.push(lfMat);
        group.add(new THREE.LineSegments(lfGeo, lfMat));
      }

      if (gd.links.linesInner.length > 0) {
        const liGeo = new THREE.BufferGeometry();
        liGeo.setAttribute('position', gd.position);
        liGeo.setAttribute('positionPrev', gd.positionPrev);
        liGeo.setIndex(gd.links.linesInner);
        const liMat = new InterpolatedLineMaterial({
          color: 0x9de6ff,
          transparent: true,
          opacity: 0.05,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false,
        });
        lineMaterials.push(liMat);
        group.add(new THREE.LineSegments(liGeo, liMat));
      }

      if (showConstraints) {
        const cGeo = new THREE.BufferGeometry();
        cGeo.setAttribute('position', gd.position);
        cGeo.setAttribute('positionPrev', gd.positionPrev);
        cGeo.setIndex(gd.links.bulb);
        const cMat = new InterpolatedLineMaterial({
          color: 0xff00ff,
          transparent: true,
          opacity: 0.25,
        });
        lineMaterials.push(cMat);
        group.add(new THREE.LineSegments(cGeo, cMat));
      }

      (gd as any).skinnedTubes = skinnedTubes;
      (gd as any).skinnedRibbons = skinnedRibbons;
      (gd as any).dynamicOralArms = dynamicOralArms;
      (gd as any).dynamicNormalGeometries = dynamicNormalGeometries;

      group.position.set(ud.transform.position.x, ud.transform.position.y, ud.transform.position.z);
      group.scale.setScalar(ud.transform.scale);

      units.push({
        id: ud.id,
        geometryData: gd,
        group,
        bulbMaterial,
        gelMaterial,
        gastricCoreMaterial,
        tailMaterial,
        mouthMaterial,
        tentacleMaterial,
        stamenMaterial,
        lineMaterials,
      });
    }

    return units as any;
  },

  animateBody(data: BodyData, time: number, delta: number, amplitude: number): void {
    const d = data as any;
    const dtSec = Math.min(0.04, delta * 0.001);

    // Unified asymmetric medusa jet-propulsion cycle
    const cyclePhase = time * Math.PI;
    const rawWave = (Math.sin(cyclePhase - Math.PI * 0.5) + 1) * 0.5;
    const surgeWave = Math.sin(cyclePhase - Math.PI * 0.82);
    const trailingLagWave = Math.sin(cyclePhase - Math.PI * 1.08);
    const surgeAmplitude = Math.min(7.5, 1.8 + amplitude * 20.0);
    const surgeY = surgeWave * surgeAmplitude;
    const trailingSurgeY = trailingLagWave * surgeAmplitude * 0.85;
    d.animationState.surgeY = surgeY;

    const contractRate = Math.max(0, Math.cos(cyclePhase - Math.PI * 0.5));
    const jetPulse = Math.pow(contractRate, 1.6) * Math.min(1.4, amplitude * 5.5);

    for (const ud of d.geometryData.units) {
      const gd = ud.geometryData as JellyfishGeometryData;

      // 1. True Exponential Underwater Verlet Velocity Damping
      const p0 = gd.system.positions;
      const p1 = gd.system.positionsPrev;
      const weights = gd.system.weights;
      const count = weights.length;
      const tentRange = gd.appendageRanges.tentacles;
      const armRange = gd.appendageRanges.oralArms;
      const stamenRange = gd.appendageRanges.stamens;

      for (let i = 0; i < count; i++) {
        if (weights[i] <= 0) continue;
        const isFlowing =
          (tentRange && i >= tentRange[0] && i < tentRange[1]) ||
          (armRange && i >= armRange[0] && i < armRange[1]) ||
          (stamenRange && i >= stamenRange[0] && i < stamenRange[1]);
        const damp = isFlowing ? 0.90 : 0.84;
        const ix = i * 3;
        p1[ix] = p0[ix] - (p0[ix] - p1[ix]) * damp;
        p1[ix + 1] = p0[ix + 1] - (p0[ix + 1] - p1[ix + 1]) * damp;
        p1[ix + 2] = p0[ix + 2] - (p0[ix + 2] - p1[ix + 2]) * damp;
      }

      // 2. Coaxial Jet-Propulsion Spine & Trailing Pin Kinematics
      const bellStretch = (rawWave - 0.5) * amplitude * gd.config.size * 0.30;
      const topPinY = gd.pinRestY.top + surgeY + bellStretch * 0.52;
      const midPinY = gd.pinRestY.mid + surgeY;
      const botPinY = gd.pinRestY.bottom + surgeY - bellStretch * 0.32;

      gd.pinConstraints.top.setPosition(gd.pinRestXZ.top[0], topPinY, gd.pinRestXZ.top[1]);
      gd.pinConstraints.mid.setPosition(gd.pinRestXZ.mid[0], midPinY, gd.pinRestXZ.mid[1]);
      gd.pinConstraints.bottom.setPosition(gd.pinRestXZ.bottom[0], botPinY, gd.pinRestXZ.bottom[1]);
      gd.pinConstraints.tail.setPosition(gd.pinRestXZ.bottom[0], gd.pinRestY.tail + trailingSurgeY, gd.pinRestXZ.bottom[1]);
      gd.pinConstraints.tentacle.setPosition(
        gd.pinRestXZ.bottom[0],
        gd.pinRestY.tentacle + trailingSurgeY,
        gd.pinRestXZ.bottom[1],
      );

      // 3. Synchronized Traveling Contraction Wave on BOTH Outer Bell (`gd.ribs`) AND
      //    Full-Width Inner Bell (`gd.tailRibs`), faithful to `particulate-medusae` `Medusae.js:1070-1071`!
      const ribCount = Math.max(1, gd.ribs.length);
      for (let r = 0; r < ribCount; r++) {
        const rib = gd.ribs[r];
        const yFrac = r / Math.max(1, ribCount - 1);
        const ribWave = (Math.sin((time - yFrac * 0.30) * Math.PI - Math.PI * 0.5) + 1) * 0.5;
        const localAmp = amplitude * (0.20 + 0.85 * Math.pow(yFrac, 1.15));
        const radialScale = 1.0 + (ribWave - 0.35) * localAmp;

        if (rib.outerConstraints) {
          for (const item of rib.outerConstraints) {
            item.constraint.setDistance(item.rest[0] * radialScale, item.rest[1] * radialScale);
          }
        }
        if (rib.innerConstraints) {
          for (const item of rib.innerConstraints) {
            item.constraint.setDistance(item.rest[0] * radialScale, item.rest[1] * radialScale);
          }
        }
        if (rib.spokeConstraints) {
          for (const item of rib.spokeConstraints) {
            item.constraint.setDistance(item.rest[0] * radialScale, item.rest[1] * radialScale);
          }
        }
      }

      // Inner Bell (`tailRibs`) pulses in exact continuity with the outer bell rim (`yParam = 1 -> 0`)!
      // This organically drives ALL oral arms & subumbrella tentacles via Particulate constraints.
      for (let tr = 0; tr < gd.tailRibs.length; tr++) {
        const trib = gd.tailRibs[tr];
        const yFrac = Math.max(0, Math.min(1, trib.yParam));
        const phaseLag = 0.30 + (1.0 - yFrac) * 0.14;
        const ribWave = (Math.sin((time - phaseLag) * Math.PI - Math.PI * 0.5) + 1) * 0.5;
        const localAmp = amplitude * (0.22 + 0.80 * Math.pow(yFrac, 1.10));
        const radialScale = 1.0 + (ribWave - 0.35) * localAmp;

        if (trib.outerConstraints) {
          for (const item of trib.outerConstraints) {
            item.constraint.setDistance(item.rest[0] * radialScale, item.rest[1] * radialScale);
          }
        }
        if (trib.innerConstraints) {
          for (const item of trib.innerConstraints) {
            item.constraint.setDistance(item.rest[0] * radialScale, item.rest[1] * radialScale);
          }
        }
        if (trib.spokeConstraints) {
          for (const item of trib.spokeConstraints) {
            item.constraint.setDistance(item.rest[0] * radialScale, item.rest[1] * radialScale);
          }
        }
      }

      // 4. Internal Gastric Core gentle elastic recoil
      const coreWave = (Math.sin((time - 0.14) * Math.PI - Math.PI * 0.5) + 1) * 0.5;
      const coreScale = 1.0 + (coreWave - 0.35) * amplitude * 0.35;
      for (const crib of gd.coreRibs) {
        if (crib.outerConstraints) {
          for (const item of crib.outerConstraints) {
            item.constraint.setDistance(item.rest[0] * coreScale, item.rest[1] * coreScale);
          }
        }
        if (crib.spokeConstraints) {
          for (const item of crib.spokeConstraints) {
            item.constraint.setDistance(item.rest[0] * coreScale, item.rest[1] * coreScale);
          }
        }
      }

      // 5. Bounded Singularity-Free Native Particulate Hydrodynamic Wake Force
      gd.hydroForce.time = time;
      gd.hydroForce.wakeStrength = jetPulse;
      gd.hydroForce.wakeOriginY = botPinY;

      // 6. Solve unified Particulate.js soft-body physics (6 relaxation iterations)
      gd.system.tick(dtSec);

      // 7. Recompute smooth vertex normals on deformed bell, core, and inner-bell meshes
      const normalGeos = (gd as any).dynamicNormalGeometries as THREE.BufferGeometry[] | undefined;
      if (normalGeos) {
        for (let g = 0; g < normalGeos.length; g++) {
          normalGeos[g].computeVertexNormals();
        }
      }

      // 8. Skin all Catmull-Rom 3D tubes, filaments, and buoyant stamens
      const skinnedTubes = (gd as any).skinnedTubes as SkinnedTubeRuntime[] | undefined;
      if (skinnedTubes) {
        for (let t = 0; t < skinnedTubes.length; t++) {
          updateSkinnedTubeMesh(skinnedTubes[t], gd.system.positions, false);
        }
      }

      // 9. Skin all Catmull-Rom multi-column discrete silk ribbons
      const skinnedRibbons = (gd as any).skinnedRibbons as SkinnedRibbonRuntime[] | undefined;
      if (skinnedRibbons) {
        for (let rb = 0; rb < skinnedRibbons.length; rb++) {
          updateSkinnedRibbonMesh(skinnedRibbons[rb], gd.system.positions, time, false);
        }
      }

      // 10. Skin all 6 distinct 3D Oral Arm topology rigs
      const dynamicOralArms = (gd as any).dynamicOralArms as DynamicOralArmRuntime[] | undefined;
      if (dynamicOralArms) {
        for (let oa = 0; oa < dynamicOralArms.length; oa++) {
          dynamicOralArms[oa].update(gd.system.positions, time, false);
        }
      }

      gd.position.needsUpdate = true;
      gd.positionPrev.needsUpdate = true;
    }
  },

  applyInteraction(_data: BodyData, _force: number, _origin: THREE.Vector3): void {
    // OrbitControls owns all pointer input.
  },

  dispose(_data: BodyData): void {
    // Cleaned up by StudioEngine.disposeUnits.
  },
};

registerArchetype(jellyfishArchetype);
