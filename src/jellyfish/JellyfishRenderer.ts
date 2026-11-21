import * as THREE from 'three/webgpu';
import { WebGLRenderer } from 'three';

/**
 * Renderer type - can be WebGPU or WebGL
 */
export type RendererType = THREE.WebGPURenderer | WebGLRenderer;

/**
 * JellyfishRenderer - WebGPU renderer with WebGL fallback
 * 
 * Handles initialization and configuration of the Three.js renderer
 * with WebGPU support, falling back to WebGL2 if not available.
 */
export class JellyfishRenderer {
  private canvas: HTMLCanvasElement;
  private renderer: RendererType | null = null;
  private isWebGPU: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  private disposed: boolean = false;
  private initializing: boolean = false;

  /**
   * Initialize the renderer
   * Checks for WebGPU support and falls back to WebGL2 if needed
   * @returns Promise<boolean> true if initialization succeeded
   */
  public async init(): Promise<boolean> {
    if (this.disposed) return false;
    this.initializing = true;

    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();

    // Verify a WebGPU adapter actually exists BEFORE calling new WebGPURenderer(canvas)
    // so we never bind the canvas to a dead 'webgpu' context before falling back to WebGL2.
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown | null> } }).gpu;
    let hasWebGPUAdapter = false;
    if (gpu && typeof gpu.requestAdapter === 'function') {
      try {
        const adapter = await gpu.requestAdapter();
        hasWebGPUAdapter = Boolean(adapter);
      } catch {
        hasWebGPUAdapter = false;
      }
    }

    if (this.disposed) {
      this.initializing = false;
      return false;
    }

    if (hasWebGPUAdapter) {
      try {
        const webgpuRenderer = new THREE.WebGPURenderer({
          canvas: this.canvas,
          antialias: false,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
          alpha: true,
        });

        await webgpuRenderer.init();

        if (this.disposed) {
          webgpuRenderer.dispose();
          this.initializing = false;
          return false;
        }

        this.renderer = webgpuRenderer;
        this.isWebGPU = true;
      } catch (error) {
        console.warn('WebGPU initialization failed, falling back to WebGL:', error);
        this.renderer = null;
      }
    }

    if (this.disposed) {
      this.initializing = false;
      return false;
    }

    // Fall back to WebGL2 if WebGPU is not available or failed
    let renderer: RendererType;
    if (!this.renderer) {
      renderer = new WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
        powerPreference: 'high-performance',
        stencil: false,
        depth: true,
        alpha: true,
      });
      this.renderer = renderer;
      this.isWebGPU = false;
    } else {
      renderer = this.renderer;
    }

    // Configure renderer
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const dpr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    renderer.autoClear = true;
    renderer.sortObjects = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Filmic tonemapping keeps additive/emissive work in a clean range.
    (renderer as any).toneMapping = THREE.ACESFilmicToneMapping;
    (renderer as any).toneMappingExposure = 1.0;

    this.initializing = false;
    return true;
  }

  /**
   * Get the underlying Three.js renderer
   */
  public getRenderer(): RendererType {
    if (!this.renderer) {
      throw new Error('Renderer not initialized. Call init() first.');
    }
    return this.renderer;
  }

  /**
   * Check if using WebGPU
   */
  public getIsWebGPU(): boolean {
    return this.isWebGPU;
  }

  /**
   * Set the renderer size
   */
  public setSize(width: number, height: number): void {
    if (!this.renderer) {
      throw new Error('Renderer not initialized. Call init() first.');
    }
    this.renderer.setSize(width, height, false);
  }

  /**
   * Render a scene with a camera
   */
  public render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.renderer) {
      throw new Error('Renderer not initialized. Call init() first.');
    }
    this.renderer.render(scene, camera);
  }

  /**
   * Dispose of the renderer
   */
  public dispose(): void {
    this.disposed = true;
    if (this.renderer && !this.initializing) {
      try {
        this.renderer.dispose();
      } catch {
        // Ignore disposal errors if context was already released
      }
      this.renderer = null;
    }
  }
}

export default JellyfishRenderer;
