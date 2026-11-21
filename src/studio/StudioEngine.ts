import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { JellyfishRenderer } from '../jellyfish/JellyfishRenderer';
import { InterpolationSystem } from '../systems/physics-bridge';
import {
  BulbNodeMaterial,
  TentacleNodeMaterial,
  TailNodeMaterial,
  GelNodeMaterial,
  GastricCoreMaterial,
  DustNodeMaterial,
  createDustSystem,
  InterpolatedLineMaterial,
} from '../jellyfish/materials';
import { JellyfishPostProcessing } from '../post-processing';
import { jellyfishArchetype } from '../creatures/archetypes/JellyfishArchetype';
import type { BodyData } from '../creatures/archetypes/CreatureArchetype';
import {
  compileLookConfig,
  compileModularRecipe,
  type ModularJellyfishRecipe,
  type StudioMotionState,
} from './modularRecipe';

interface StudioUnitRuntime {
  id: string;
  geometryData: any;
  group: THREE.Group;
  bulbMaterial?: BulbNodeMaterial;
  gelMaterial?: GelNodeMaterial;
  gastricCoreMaterial?: GastricCoreMaterial;
  tailMaterial?: TailNodeMaterial;
  mouthMaterial?: TailNodeMaterial;
  tentacleMaterial?: TentacleNodeMaterial;
  stamenMaterial?: TentacleNodeMaterial;
  lineMaterials?: InterpolatedLineMaterial[];
}

export interface StudioEngineCallbacks {
  onFirstInteract?: () => void;
  onError?: (message: string) => void;
}

/**
 * StudioEngine — Live WebGPU/WebGL Hyperrealistic Optical Engine for Medusa Studio.
 *
 * - Owns a dedicated isolated canvas per mount (StrictMode-safe).
 * - OrbitControls exclusively handles pointer orbit/zoom/pan.
 * - Instant zero-rebuild uniform synchronization across all 3 composable surface
 *   shader layers (Optical Base × Surface Pattern × 4-Stop Chromatic Colorway).
 */
export class StudioEngine {
  private canvas: HTMLCanvasElement;
  private callbacks: StudioEngineCallbacks;
  private renderer!: JellyfishRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private orbitControls!: OrbitControls;
  private postProcessing?: JellyfishPostProcessing;
  private refractionTarget?: THREE.RenderTarget;
  private dustSystem?: ReturnType<typeof createDustSystem>;
  private dustMaterial?: DustNodeMaterial;

  private creatureGroup = new THREE.Group();
  private units: StudioUnitRuntime[] = [];
  private bodyData: BodyData | null = null;
  private interpolation = new InterpolationSystem({ timestep: 1000 / 30 });

  private isInitialized = false;
  private isDisposed = false;
  private isRunning = false;
  private rafId: number | null = null;
  private lastFrameTime = 0;
  private animTime = 0;

  private motion: StudioMotionState = {
    playing: true,
    pulseSpeed: 0.55,
    pulseAmplitude: 0.14,
    autoRotate: true,
    showRibLines: false,
  };

  private currentRecipe: ModularJellyfishRecipe | null = null;
  private hasInteracted = false;

  private desiredDistance: number | null = null;
  private creatureCenter = new THREE.Vector3(0, 6, 0);

  // Pre-allocated scratch helpers (zero allocations inside RAF loop)
  private readonly scratchOffset = new THREE.Vector3();
  private readonly scratchBox = new THREE.Box3();
  private readonly scratchSize = new THREE.Vector3();
  private readonly scratchCenter = new THREE.Vector3();
  private readonly scratchColor = new THREE.Color();

  private resizeObserver: ResizeObserver | null = null;

  constructor(canvas: HTMLCanvasElement, callbacks: StudioEngineCallbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;
  }

  public async init(initialRecipe: ModularJellyfishRecipe, initialMotion: StudioMotionState): Promise<void> {
    if (this.isDisposed) return;

    this.motion = { ...initialMotion };
    this.currentRecipe = initialRecipe;

    this.renderer = new JellyfishRenderer(this.canvas);
    const ok = await this.renderer.init();
    if (this.isDisposed) {
      this.renderer.dispose();
      return;
    }
    if (!ok) {
      this.callbacks.onError?.('Unable to initialize WebGPU or WebGL2 renderer.');
      return;
    }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(initialRecipe.surface.background || '#03060E');
    this.scene.add(this.creatureGroup);

    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);

    this.camera = new THREE.PerspectiveCamera(32, width / height, 2, 3500);
    this.camera.position.set(0, 12, 138);

    this.orbitControls = new OrbitControls(this.camera, this.canvas);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.06;
    this.orbitControls.enablePan = true;
    this.orbitControls.minDistance = 42;
    this.orbitControls.maxDistance = 420;
    this.orbitControls.autoRotate = this.motion.autoRotate;
    this.orbitControls.autoRotateSpeed = 0.4;
    this.orbitControls.target.copy(this.creatureCenter);
    this.orbitControls.addEventListener('start', this.handleControlsStart);

    // WebGPU post-processing (calibrated selective HDR bloom + subtle vignette)
    if (this.renderer.getIsWebGPU()) {
      try {
        const threeRenderer = this.renderer.getRenderer() as THREE.WebGPURenderer;
        this.postProcessing = new JellyfishPostProcessing(threeRenderer, this.scene, this.camera, {
          lensDirt: {
            maxQuads: 90,
            opacity: 0.14,
            fadeRate: 0.995,
            spawnSpread: 0.45,
            maxScale: 0.11,
          },
          debug: false,
        });
      } catch (err) {
        console.warn('Post-processing setup skipped:', err);
      }
    }

    // Background render target for live crystal chromatic refraction
    {
      const r = this.renderer.getRenderer() as any;
      const dpr = typeof r.getPixelRatio === 'function' ? r.getPixelRatio() : Math.min(window.devicePixelRatio, 2);
      const rtW = Math.max(1, Math.floor(width * dpr));
      const rtH = Math.max(1, Math.floor(height * dpr));
      this.refractionTarget = new THREE.RenderTarget(rtW, rtH);
      this.refractionTarget.texture.name = 'StudioRefractionRT';
      this.refractionTarget.texture.generateMipmaps = false;
      this.refractionTarget.texture.minFilter = THREE.LinearFilter;
      this.refractionTarget.texture.magFilter = THREE.LinearFilter;
    }

    // Subtle deep-sea bioluminescent plankton dust
    this.dustSystem = createDustSystem({
      count: 4200,
      psColor: 0xdce8ff,
      opacity: 0.36,
      size: 22,
      scale: 140,
      area: 300,
    });
    this.dustMaterial = this.dustSystem.material;
    this.scene.add(this.dustSystem.points);

    this.canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    if (this.canvas.parentElement) {
      this.resizeObserver.observe(this.canvas.parentElement);
    }
    window.addEventListener('resize', this.handleResize);

    this.isInitialized = true;
    this.handleResize();

    this.applyStructure(initialRecipe, true);
    this.applySurface(initialRecipe);
    this.applyMotion(initialMotion);

    this.start();
  }

  /**
   * Rebuild unified soft-body Particulate.js rig & sculpted 3D meshes.
   */
  public applyStructure(recipe: ModularJellyfishRecipe, immediateCamera: boolean = false): void {
    this.currentRecipe = recipe;
    if (!this.isInitialized || this.isDisposed) return;

    this.disposeUnits();

    const spec = compileModularRecipe(recipe);
    const body = jellyfishArchetype.buildBody(
      spec,
      { timestep: 1000 / 30 },
      { random: () => Math.random() },
    );
    body.animationState.pulseSpeed = this.motion.pulseSpeed;
    body.animationState.pulseAmplitude = this.motion.pulseAmplitude;
    this.bodyData = body;

    const look = compileLookConfig(recipe, this.motion);
    const matPack = jellyfishArchetype.createMaterials(look, this.refractionTarget);
    const builtUnits = jellyfishArchetype.buildMeshes(body, matPack, { showConstraints: false }) as unknown as StudioUnitRuntime[];
    this.units = builtUnits;

    for (const unit of this.units) {
      this.creatureGroup.add(unit.group);
    }

    // Gently settle Verlet soft-body appendages into natural underwater drape
    for (let i = 0; i < 6; i++) {
      jellyfishArchetype.animateBody(body, this.animTime + i * 0.02, 1000 / 30, this.motion.pulseAmplitude * 0.45);
    }

    this.applySurface(recipe);
    this.updateFramingFromBody(immediateCamera);
  }

  /**
   * Update all 3 composable TSL shader layers (Optical Base × Pattern × 4-Stop Colorway)
   * across Bell, Gastric Core, Stamens, Skirt, Oral Arms, and Tentacles in-place (zero rebuild).
   */
  public applySurface(recipe: ModularJellyfishRecipe): void {
    this.currentRecipe = recipe;
    if (!this.isInitialized || this.isDisposed) return;

    const s = recipe.surface;
    const look = compileLookConfig(recipe, this.motion);
    this.scene.background = new THREE.Color(s.background || '#03060E');

    const coreCol = new THREE.Color(s.coreColor);
    const bellCol = new THREE.Color(s.bellColor);
    const accentCol = new THREE.Color(s.accentColor);
    const tipCol = new THREE.Color(s.tipColor);

    const bellHex = this.scratchColor.copy(bellCol).getHex();
    const ribVisible = this.motion.showRibLines;
    const ribOpacity = s.ribOpacity;

    const opticalBase = s.opticalBase ?? 0;
    const patternType = s.patternType ?? 0;
    const refractionStrength = s.refractionStrength ?? 0;
    const isRefractive = opticalBase === 0 || opticalBase === 2 || opticalBase === 5;

    for (const unit of this.units) {
      // 1. Bell Shell (Composable 3-Layer TSL)
      unit.bulbMaterial?.setCoreColor(coreCol);
      unit.bulbMaterial?.setBellColor(bellCol);
      unit.bulbMaterial?.setAccentColor(accentCol);
      unit.bulbMaterial?.setTipColor(tipCol);
      unit.bulbMaterial?.setOpacity(s.opacity);
      unit.bulbMaterial?.setRimBoost(s.rimGlow);
      unit.bulbMaterial?.setOpticalBase(opticalBase);
      unit.bulbMaterial?.setPatternType(patternType);
      unit.bulbMaterial?.setPatternScale(s.patternScale);
      unit.bulbMaterial?.setSparkleIntensity(s.sparkleIntensity);
      unit.bulbMaterial?.setCoreGlow(s.coreGlow);
      unit.bulbMaterial?.setRefractionStrength(refractionStrength);
      unit.bulbMaterial?.setIor(opticalBase === 0 ? 1.48 : opticalBase === 2 ? 1.35 : 1.38);
      unit.bulbMaterial?.setDispersion(opticalBase === 0 ? 0.055 : isRefractive ? 0.028 : 0.015);

      // 2. Subtle Fresnel Wet-Glass Outer Halo (kept gossamer thin for interior clarity)
      unit.gelMaterial?.setDiffuse(bellCol);
      unit.gelMaterial?.setOpacity(opticalBase === 0 || opticalBase === 2 ? 0.16 : 0.10);

      // 3. Dedicated Internal Gastric Core (Parallax Glow inside Bell Cavity)
      unit.gastricCoreMaterial?.setCoreColor(coreCol);
      unit.gastricCoreMaterial?.setAccentColor(bellCol);
      unit.gastricCoreMaterial?.setIntensity(s.coreGlow);

      // 4. Inner Skirt / Subumbrella Collar
      unit.tailMaterial?.setCoreColor(coreCol);
      unit.tailMaterial?.setBellColor(bellCol);
      unit.tailMaterial?.setAccentColor(accentCol);
      unit.tailMaterial?.setTipColor(tipCol);
      unit.tailMaterial?.updateOpacity(look.tail.opacity);
      unit.tailMaterial?.setOpticalBase(opticalBase);
      unit.tailMaterial?.setPatternType(patternType);
      unit.tailMaterial?.setPatternScale(s.patternScale);
      unit.tailMaterial?.setSparkleIntensity(s.sparkleIntensity * 0.7);

      // 5. Sculpted Oral Arms
      unit.mouthMaterial?.setCoreColor(coreCol);
      unit.mouthMaterial?.setBellColor(bellCol);
      unit.mouthMaterial?.setAccentColor(accentCol);
      unit.mouthMaterial?.setTipColor(tipCol);
      unit.mouthMaterial?.updateOpacity(look.mouth.opacity);
      unit.mouthMaterial?.setOpticalBase(opticalBase);
      unit.mouthMaterial?.setPatternType(patternType);
      unit.mouthMaterial?.setPatternScale(s.patternScale);
      unit.mouthMaterial?.setSparkleIntensity(s.sparkleIntensity * 0.85);

      // 6. Unified Particulate Verlet Tentacles (Curtains, Stippled, Bulb Filaments, Pearl-Beaded, Crystal)
      unit.tentacleMaterial?.setCoreColor(coreCol);
      unit.tentacleMaterial?.setBellColor(bellCol);
      unit.tentacleMaterial?.setAccentColor(accentCol);
      unit.tentacleMaterial?.setTipColor(tipCol);
      unit.tentacleMaterial?.setOpacity(look.tentacle.opacity);
      unit.tentacleMaterial?.setOpticalBase(opticalBase);

      // 7. Apex Stamen Antennae (Ref 4)
      unit.stamenMaterial?.setCoreColor(coreCol);
      unit.stamenMaterial?.setBellColor(bellCol);
      unit.stamenMaterial?.setAccentColor(coreCol);
      unit.stamenMaterial?.setTipColor(tipCol);
      unit.stamenMaterial?.setOpacity(0.95);

      // 8. Clean Toggleable Anatomical Rib Lines
      unit.group.traverse((child) => {
        if (child instanceof THREE.LineSegments) {
          child.visible = ribVisible;
        }
      });

      if (unit.lineMaterials) {
        unit.lineMaterials.forEach((lineMat, idx) => {
          lineMat.color.setHex(idx === 0 ? 0xffedf5 : bellHex);
          lineMat.opacity = idx === 0 ? ribOpacity : ribOpacity * 0.65;
          lineMat.needsUpdate = true;
        });
      }
    }

    if (this.dustMaterial) {
      this.dustMaterial.setColor(look.dust.color);
      this.dustMaterial.setOpacity(look.dust.opacity);
    }

    if (this.postProcessing) {
      this.postProcessing.setBloomStrength(look.post.bloomStrength);
      this.postProcessing.setBloomRadius(look.post.bloomRadius);
      this.postProcessing.setBloomThreshold(look.post.bloomThreshold);
      const vignette = this.postProcessing.getVignette();
      if (vignette) {
        vignette.setDarkness(look.post.vignetteDarkness);
        vignette.setOffset(look.post.vignetteOffset);
        vignette.setColor(new THREE.Color(look.post.vignetteColor));
      }
    }
  }

  public applyMotion(motion: StudioMotionState): void {
    const ribChanged = this.motion.showRibLines !== motion.showRibLines;
    this.motion = { ...motion };

    if (!this.isInitialized || this.isDisposed) return;

    this.orbitControls.autoRotate = motion.autoRotate;
    this.orbitControls.autoRotateSpeed = 0.4;

    if (this.bodyData) {
      this.bodyData.animationState.pulseSpeed = motion.pulseSpeed;
      this.bodyData.animationState.pulseAmplitude = motion.pulseAmplitude;
    }

    if (ribChanged && this.currentRecipe) {
      this.applySurface(this.currentRecipe);
    }
  }

  public resetCameraView(): void {
    if (!this.isInitialized || this.isDisposed) return;
    this.desiredDistance = null;
    this.orbitControls.target.copy(this.creatureCenter);
    this.camera.position.set(0, this.creatureCenter.y + 10, this.creatureCenter.z + 138);
    this.orbitControls.update();
  }

  private updateFramingFromBody(immediate: boolean): void {
    this.scratchBox.makeEmpty();
    for (const unit of this.units) {
      const positions: Float32Array | undefined = unit.geometryData?.system?.positions;
      if (!positions) continue;
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];
        const z = positions[i + 2];
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
          this.scratchCenter.set(x, y, z);
          this.scratchBox.expandByPoint(this.scratchCenter);
        }
      }
    }

    if (this.scratchBox.isEmpty()) return;

    this.scratchBox.getSize(this.scratchSize);
    this.scratchBox.getCenter(this.scratchCenter);

    const bellTopY = this.scratchBox.max.y;
    const targetY = THREE.MathUtils.lerp(this.scratchCenter.y, bellTopY - 22, 0.36) - 5;
    this.creatureCenter.set(0, targetY, 0);

    const maxSpan = Math.max(this.scratchSize.x, this.scratchSize.y * 0.84, this.scratchSize.z, 55);
    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const fitDistance = Math.max(105, Math.min(235, (maxSpan * 0.62) / Math.tan(fovRad * 0.5)));

    if (immediate) {
      this.orbitControls.target.copy(this.creatureCenter);
      this.camera.position.set(0, this.creatureCenter.y + 8, fitDistance);
      this.orbitControls.update();
      this.desiredDistance = null;
    } else {
      this.desiredDistance = fitDistance;
    }
  }

  private handleControlsStart = (): void => {
    this.desiredDistance = null;
    if (!this.hasInteracted) {
      this.hasInteracted = true;
      this.callbacks.onFirstInteract?.();
    }
  };

  private handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.stop();
  };

  private handleContextRestored = (): void => {
    if (!this.isDisposed) {
      this.start();
    }
  };

  private handleResize = (): void => {
    if (!this.isInitialized || this.isDisposed) return;
    const parent = this.canvas.parentElement;
    const width = Math.max(1, parent ? parent.clientWidth : window.innerWidth);
    const height = Math.max(1, parent ? parent.clientHeight : window.innerHeight);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);

    if (this.refractionTarget) {
      const r = this.renderer.getRenderer() as any;
      const dpr = typeof r.getPixelRatio === 'function' ? r.getPixelRatio() : Math.min(window.devicePixelRatio, 2);
      const rtW = Math.max(1, Math.floor(width * dpr));
      const rtH = Math.max(1, Math.floor(height * dpr));
      this.refractionTarget.setSize(rtW, rtH);
      for (const unit of this.units) {
        unit.bulbMaterial?.setRefractionResolution(rtW, rtH);
      }
    }

    this.postProcessing?.setSize(width, height);
  };

  private start(): void {
    if (this.isRunning || this.isDisposed) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.animate();
  }

  private stop(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private animate = (): void => {
    if (!this.isRunning || this.isDisposed) return;

    const now = performance.now();
    const clampedDelta = Math.min(now - this.lastFrameTime, 100);
    this.lastFrameTime = now;

    let stepProgress = 1;
    if (this.motion.playing && this.bodyData) {
      this.animTime += clampedDelta * 0.001 * this.motion.pulseSpeed;
      stepProgress = this.interpolation.update(clampedDelta, (physicsDelta) => {
        if (this.bodyData) {
          jellyfishArchetype.animateBody(
            this.bodyData,
            this.animTime,
            physicsDelta,
            this.motion.pulseAmplitude,
          );
        }
      });
    } else {
      stepProgress = this.interpolation.getStepProgress();
    }

    for (const unit of this.units) {
      unit.bulbMaterial?.setTime(this.animTime);
      unit.bulbMaterial?.setStepProgress(stepProgress);
      unit.gelMaterial?.setStepProgress(stepProgress);
      unit.gastricCoreMaterial?.setTime(this.animTime);
      unit.gastricCoreMaterial?.setStepProgress(stepProgress);
      unit.tailMaterial?.setTime(this.animTime);
      unit.tailMaterial?.setStepProgress(stepProgress);
      unit.mouthMaterial?.setTime(this.animTime);
      unit.mouthMaterial?.setStepProgress(stepProgress);
      unit.tentacleMaterial?.setTime(this.animTime);
      unit.tentacleMaterial?.setStepProgress(stepProgress);
      unit.stamenMaterial?.setTime(this.animTime);
      unit.stamenMaterial?.setStepProgress(stepProgress);
      if (unit.lineMaterials) {
        for (const lineMat of unit.lineMaterials) {
          lineMat.setStepProgress(stepProgress);
        }
      }
    }

    if (this.dustMaterial) {
      this.dustMaterial.setTime(this.animTime * 0.75);
    }

    const surgeY = typeof this.bodyData?.animationState?.surgeY === 'number' ? this.bodyData.animationState.surgeY : 0;
    this.scratchCenter.set(this.creatureCenter.x, this.creatureCenter.y + surgeY * 0.22, this.creatureCenter.z);
    this.orbitControls.target.lerp(this.scratchCenter, 0.06);
    if (this.desiredDistance !== null) {
      this.scratchOffset.copy(this.camera.position).sub(this.orbitControls.target);
      const currentDist = this.scratchOffset.length();
      if (currentDist > 1e-3) {
        const nextDist = THREE.MathUtils.lerp(currentDist, this.desiredDistance, 0.06);
        this.scratchOffset.multiplyScalar(nextDist / currentDist);
        this.camera.position.copy(this.orbitControls.target).add(this.scratchOffset);
        if (Math.abs(nextDist - this.desiredDistance) < 0.35) {
          this.desiredDistance = null;
        }
      }
    }

    this.orbitControls.update();

    // Run background refraction pass whenever Crystal / Botanical / Opal optical base is active
    const opt = this.currentRecipe?.surface.opticalBase ?? 0;
    const needsRefraction = (opt === 0 || opt === 2 || opt === 5) && (this.currentRecipe?.surface.refractionStrength ?? 0) > 0;
    if (this.refractionTarget && needsRefraction) {
      const r = this.renderer.getRenderer() as any;
      if (typeof r.setRenderTarget === 'function') {
        this.creatureGroup.visible = false;
        r.setRenderTarget(this.refractionTarget);
        if (typeof r.clear === 'function') r.clear();
        r.render(this.scene, this.camera);
        r.setRenderTarget(null);
        this.creatureGroup.visible = true;
      }
    }

    if (!this.canvas.isConnected) {
      this.stop();
      return;
    }

    if (this.postProcessing) {
      this.postProcessing.update(clampedDelta);
      try {
        const result = this.postProcessing.render() as unknown as Promise<void> | undefined;
        if (result && typeof (result as Promise<void>).catch === 'function') {
          (result as Promise<void>).catch(() => {
            if (!this.isDisposed) {
              this.postProcessing = undefined;
            }
          });
        }
      } catch {
        this.postProcessing = undefined;
        this.renderer.render(this.scene, this.camera);
      }
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    this.rafId = requestAnimationFrame(this.animate);
  };

  private disposeUnits(): void {
    const disposedMaterials = new Set<THREE.Material>();
    for (const unit of this.units) {
      this.creatureGroup.remove(unit.group);
      unit.group.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
          child.geometry.dispose();
          const mat = child.material;
          if (Array.isArray(mat)) {
            for (const m of mat) {
              if (!disposedMaterials.has(m)) {
                m.dispose();
                disposedMaterials.add(m);
              }
            }
          } else if (mat && !disposedMaterials.has(mat)) {
            mat.dispose();
            disposedMaterials.add(mat);
          }
        }
      });
    }
    this.units = [];
    if (this.bodyData) {
      jellyfishArchetype.dispose(this.bodyData);
      this.bodyData = null;
    }
  }

  public dispose(): void {
    this.isDisposed = true;
    this.stop();

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener('resize', this.handleResize);

    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.orbitControls?.removeEventListener('start', this.handleControlsStart);
    this.orbitControls?.dispose();

    this.disposeUnits();

    if (this.dustSystem) {
      this.scene?.remove(this.dustSystem.points);
      this.dustSystem.geometry.dispose();
      this.dustSystem.material.dispose();
      this.dustSystem = undefined;
    }

    this.refractionTarget?.dispose();
    this.postProcessing?.dispose();
    this.renderer?.dispose();
  }
}
