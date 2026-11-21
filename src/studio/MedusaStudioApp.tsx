import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Pause,
  Play,
  RotateCcw,
  Save,
  Shuffle,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { StudioEngine } from './StudioEngine';
import {
  BELL_VARIANTS,
  COLORWAY_PRESETS,
  DEFAULT_MOTION_STATE,
  HERO_SPECIMENS,
  OPTICAL_BASES,
  ORAL_ARMS_VARIANTS,
  SKIRT_VARIANTS,
  SURFACE_PATTERNS,
  TENTACLES_VARIANTS,
  cloneRecipe,
  deleteSpecimenFromStorage,
  getStructureKey,
  loadSavedSpecimens,
  randomizeAllParts,
  randomizePart,
  saveSpecimenToStorage,
  type BellCrossSection,
  type BellRelief,
  type ModularJellyfishRecipe,
  type NamedSpecimen,
  type PartCategory,
  type StudioMotionState,
  type TentacleStyle,
} from './modularRecipe';
import {
  BellSilhouetteIcon,
  ColorwaySwatchIcon,
  OpticalBaseIcon,
  OralArmsSilhouetteIcon,
  PatternIcon,
  SkirtSilhouetteIcon,
  TentaclesSilhouetteIcon,
} from './PartVisualIcons';

const PART_TABS: Array<{ id: PartCategory; label: string }> = [
  { id: 'bell', label: 'Bell' },
  { id: 'skirt', label: 'Inner Skirt' },
  { id: 'oralArms', label: 'Oral Arms' },
  { id: 'tentacles', label: 'Tentacles' },
  { id: 'surface', label: 'Surface' },
];

type SurfaceSubTab = 'optical' | 'pattern' | 'colorway';

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue?: string;
  onChange: (value: number) => void;
}

const SliderControl: React.FC<SliderControlProps> = ({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
}) => (
  <label className="flex flex-col gap-1.5 min-w-[120px] flex-1">
    <div className="flex items-center justify-between gap-2 text-[11px] leading-none">
      <span className="text-[#94A3B8] font-medium tracking-[0.01em] whitespace-nowrap">{label}</span>
      <span className="font-mono text-[11px] text-[#F1F5F9] tabular-nums">
        {displayValue ?? value.toFixed(step < 1 ? 2 : 0)}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="medusa-range w-full"
    />
  </label>
);

export const MedusaStudioApp: React.FC = () => {
  const stageHostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<StudioEngine | null>(null);
  const lastStructureKeyRef = useRef<string>('');

  const [recipe, setRecipe] = useState<ModularJellyfishRecipe>(() => cloneRecipe(HERO_SPECIMENS[0].recipe));
  const [activeSpecimenId, setActiveSpecimenId] = useState<string>(HERO_SPECIMENS[0].id);
  const [motion, setMotion] = useState<StudioMotionState>(DEFAULT_MOTION_STATE);
  const [activePart, setActivePart] = useState<PartCategory>('surface');
  const [surfaceTab, setSurfaceTab] = useState<SurfaceSubTab>('optical');
  const [dockOpen, setDockOpen] = useState<boolean>(true);
  const [collectionOpen, setCollectionOpen] = useState<boolean>(false);
  const [showSavePrompt, setShowSavePrompt] = useState<boolean>(false);
  const [saveName, setSaveName] = useState<string>('');
  const [savedSpecimens, setSavedSpecimens] = useState<NamedSpecimen[]>(() => loadSavedSpecimens());
  const [hasInteracted, setHasInteracted] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2400);
  }, []);

  // Mount Three.js WebGPU/WebGL engine on an isolated canvas per mount (StrictMode-safe)
  useEffect(() => {
    const host = stageHostRef.current;
    if (!host) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'block w-full h-full touch-none outline-none cursor-grab active:cursor-grabbing';
    canvas.setAttribute('aria-label', 'Interactive 3D modular jellyfish stage');
    host.appendChild(canvas);

    const initialRecipe = cloneRecipe(HERO_SPECIMENS[0].recipe);
    lastStructureKeyRef.current = getStructureKey(initialRecipe);

    const engine = new StudioEngine(canvas, {
      onFirstInteract: () => setHasInteracted(true),
      onError: (msg) => setInitError(msg),
    });
    engineRef.current = engine;

    void engine.init(initialRecipe, DEFAULT_MOTION_STATE);

    return () => {
      engine.dispose();
      engineRef.current = null;
      canvas.remove();
    };
  }, []);

  const structureKey = useMemo(() => getStructureKey(recipe), [recipe]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    if (structureKey !== lastStructureKeyRef.current) {
      lastStructureKeyRef.current = structureKey;
      engine.applyStructure(recipe, false);
    } else {
      engine.applySurface(recipe);
    }
  }, [recipe, structureKey]);

  useEffect(() => {
    engineRef.current?.applyMotion(motion);
  }, [motion]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (e.key === 'Escape') {
        if (showSavePrompt) setShowSavePrompt(false);
        else if (collectionOpen) setCollectionOpen(false);
        return;
      }

      if (isInput) return;

      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        setDockOpen((prev) => !prev);
      } else if (e.key === ' ') {
        e.preventDefault();
        setMotion((prev) => ({ ...prev, playing: !prev.playing }));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [collectionOpen, showSavePrompt]);

  const handleSelectHeroSpecimen = (specimen: NamedSpecimen) => {
    setActiveSpecimenId(specimen.id);
    setRecipe(cloneRecipe(specimen.recipe));
    showToast(`Loaded ${specimen.name}`);
  };

  const handleSelectBell = (variantId: string) => {
    const variant = BELL_VARIANTS.find((v) => v.id === variantId);
    if (!variant) return;
    setActiveSpecimenId('');
    setRecipe((prev) => ({
      ...prev,
      bell: { variantId: variant.id, ...variant.defaults },
    }));
  };

  const handleSelectSkirt = (variantId: string) => {
    const variant = SKIRT_VARIANTS.find((v) => v.id === variantId);
    if (!variant) return;
    setActiveSpecimenId('');
    setRecipe((prev) => ({
      ...prev,
      skirt: { variantId: variant.id, ...variant.defaults },
    }));
  };

  const handleSelectOralArms = (variantId: string) => {
    const variant = ORAL_ARMS_VARIANTS.find((v) => v.id === variantId);
    if (!variant) return;
    setActiveSpecimenId('');
    setRecipe((prev) => ({
      ...prev,
      oralArms: { variantId: variant.id, ...variant.defaults },
    }));
  };

  const handleSelectTentacles = (variantId: string) => {
    const variant = TENTACLES_VARIANTS.find((v) => v.id === variantId);
    if (!variant) return;
    setActiveSpecimenId('');
    setRecipe((prev) => ({
      ...prev,
      tentacles: { variantId: variant.id, ...variant.defaults },
    }));
  };

  const handleSelectOpticalBase = (baseId: number) => {
    const opt = OPTICAL_BASES.find((o) => o.id === baseId);
    if (!opt) return;
    setActiveSpecimenId('');
    setRecipe((prev) => ({
      ...prev,
      surface: {
        ...prev.surface,
        opticalBase: opt.id,
        opacity: opt.defaultOpacity,
        rimGlow: opt.defaultRimGlow,
        refractionStrength: opt.defaultRefraction,
      },
    }));
  };

  const handleSelectPattern = (patternId: number) => {
    const pat = SURFACE_PATTERNS.find((p) => p.id === patternId);
    if (!pat) return;
    setActiveSpecimenId('');
    setRecipe((prev) => ({
      ...prev,
      surface: {
        ...prev.surface,
        patternType: pat.id,
        patternScale: pat.defaultScale,
        sparkleIntensity: pat.defaultSparkle,
      },
    }));
  };

  const handleSelectColorway = (colorwayId: string) => {
    const cw = COLORWAY_PRESETS.find((c) => c.id === colorwayId);
    if (!cw) return;
    setActiveSpecimenId('');
    setRecipe((prev) => ({
      ...prev,
      surface: {
        ...prev.surface,
        colorwayId: cw.id,
        coreColor: cw.coreColor,
        bellColor: cw.bellColor,
        accentColor: cw.accentColor,
        tipColor: cw.tipColor,
        background: cw.background,
      },
    }));
  };

  const handleShuffleActivePart = () => {
    setActiveSpecimenId('');
    setRecipe((prev) => randomizePart(prev, activePart));
    const tabName = PART_TABS.find((t) => t.id === activePart)?.label ?? 'Part';
    showToast(`Remixed ${tabName}`);
  };

  const handleShuffleAll = () => {
    setActiveSpecimenId('');
    setRecipe((prev) => randomizeAllParts(prev));
    showToast('Remixed all 5 anatomical layers');
  };

  const handleSaveSpecimen = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = saveSpecimenToStorage(saveName || 'Custom Medusa', recipe);
    setSavedSpecimens(updated);
    setSaveName('');
    setShowSavePrompt(false);
    showToast('Saved to collection');
  };

  const handleDeleteSaved = (id: string) => {
    const updated = deleteSpecimenFromStorage(id);
    setSavedSpecimens(updated);
    showToast('Removed specimen');
  };

  const handleCopyRecipe = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(recipe, null, 2));
      showToast('Copied modular recipe JSON');
    } catch {
      showToast('Clipboard unavailable');
    }
  };

  const activeOpticalName = OPTICAL_BASES.find((o) => o.id === recipe.surface.opticalBase)?.name ?? 'Prismatic Crystal';
  const activePatternName = SURFACE_PATTERNS.find((p) => p.id === recipe.surface.patternType)?.name ?? 'Hex Voronoi';
  const activeColorwayName = COLORWAY_PRESETS.find((c) => c.id === recipe.surface.colorwayId)?.name ?? 'Custom';

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#03060E] text-[#F1F5F9] select-none">
      {/* Full-viewport 3D WebGPU Stage */}
      <div ref={stageHostRef} className="absolute inset-0 w-full h-full" />

      {/* Top Bar — Strict 3-Zone Contract: Wordmark | 7 Hero Specimens | Saved Action */}
      <header className="pointer-events-none fixed top-0 left-0 right-0 z-20 flex items-center justify-between gap-6 px-6 py-3.5 bg-gradient-to-b from-[#03060E]/90 via-[#03060E]/55 to-transparent">
        {/* Zone 1: Brand Title */}
        <div className="pointer-events-auto flex items-center shrink-0">
          <span className="font-display text-[18px] font-semibold tracking-[-0.02em] text-[#F8FAFC] whitespace-nowrap">
            Medusa Studio
          </span>
        </div>

        {/* Zone 2: 7 Reference Hero Specimens Switcher */}
        <nav
          aria-label="Reference Hero Specimens"
          className="pointer-events-auto flex items-center gap-5 overflow-x-auto no-scrollbar max-w-[68vw] py-0.5"
        >
          {HERO_SPECIMENS.map((spec) => {
            const isActive = activeSpecimenId === spec.id;
            return (
              <button
                key={spec.id}
                type="button"
                onClick={() => handleSelectHeroSpecimen(spec)}
                className={`relative text-[12.5px] font-medium whitespace-nowrap shrink-0 pb-1 transition-colors cursor-pointer ${
                  isActive
                    ? 'text-[#7CF0FF]'
                    : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                }`}
              >
                {spec.name}
                {isActive && (
                  <span className="absolute left-0 right-0 bottom-0 h-[1.5px] bg-[#7CF0FF]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="pointer-events-auto flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setCollectionOpen(true)}
            className="px-3.5 py-1.5 rounded-lg bg-[#0D1322] border border-[#E2E8F0]/15 text-[12px] font-medium text-[#F1F5F9] hover:border-[#7CF0FF]/50 hover:text-[#7CF0FF] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Collection{savedSpecimens.length > 0 ? ` (${savedSpecimens.length})` : ''}
          </button>
        </div>
      </header>

      {/* Subtle Orbit Hint (fades out on first interaction) */}
      {!hasInteracted && !initError && (
        <div className="pointer-events-none fixed top-16 left-1/2 -translate-x-1/2 z-10 text-[11px] text-[#94A3B8]/80 tracking-[0.02em]">
          Drag to orbit · Scroll to zoom · Press H to hide studio dock
        </div>
      )}

      {/* Renderer Fallback / Error Notice */}
      {initError && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#03060E] p-6">
          <div className="max-w-md rounded-xl border border-[#E2E8F0]/15 bg-[#0C1120] p-6 text-center">
            <h2 className="font-display text-lg font-semibold text-[#F8FAFC]">3D Stage Unavailable</h2>
            <p className="mt-2 text-sm text-[#94A3B8]">{initError}</p>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="pointer-events-none fixed top-16 right-6 z-30 rounded-lg bg-[#0D1322] border border-[#7CF0FF]/30 px-3.5 py-2 text-[12px] font-medium text-[#E2E8F0]">
          {toast}
        </div>
      )}

      {/* Collapsible Unified Bottom Control Dock (Zero backdrop-filter over WebGPU) */}
      <div className="pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center w-[min(1040px,95vw)]">
        {/* Collapse / Expand Toggle Handle */}
        <button
          type="button"
          onClick={() => setDockOpen((prev) => !prev)}
          className="pointer-events-auto mb-1.5 flex items-center gap-1.5 rounded-full bg-[#0A0F1E] border border-[#E2E8F0]/15 px-3.5 py-1 text-[11px] font-medium text-[#CBD5E1] hover:text-[#7CF0FF] hover:border-[#7CF0FF]/40 transition-colors cursor-pointer"
        >
          <SlidersHorizontal className="w-3 h-3" />
          <span>{dockOpen ? 'Hide Controls' : 'Show Studio Dock'}</span>
          {dockOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>

        {dockOpen && (
          <section
            aria-label="Modular Specimen Controls"
            className="pointer-events-auto w-full rounded-2xl bg-[#090E1C]/95 border border-[#E2E8F0]/12 shadow-2xl px-4 py-3 flex flex-col gap-3"
          >
            {/* Row 1: 5 Modular Part Tabs + Quick Actions */}
            <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0]/10 pb-2.5 flex-wrap">
              <div className="flex items-center gap-1 bg-[#050812] p-1 rounded-xl border border-[#E2E8F0]/8">
                {PART_TABS.map((tab) => {
                  const active = activePart === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActivePart(tab.id)}
                      className={`px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#16223C] text-[#7CF0FF]'
                          : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Composable Surface Sub-Tabs when Surface is active, else Motion Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMotion((prev) => ({ ...prev, playing: !prev.playing }))}
                  title={motion.playing ? 'Pause pulse (Space)' : 'Resume pulse (Space)'}
                  className="p-1.5 rounded-lg bg-[#0F1528] border border-[#E2E8F0]/10 text-[#CBD5E1] hover:text-[#7CF0FF] transition-colors cursor-pointer"
                >
                  {motion.playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setMotion((prev) => ({ ...prev, showRibLines: !prev.showRibLines }))}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                    motion.showRibLines
                      ? 'bg-[#16223C] border-[#7CF0FF]/40 text-[#7CF0FF]'
                      : 'bg-[#0F1528] border-[#E2E8F0]/10 text-[#94A3B8] hover:text-[#F1F5F9]'
                  }`}
                >
                  Rib Lines
                </button>
                <button
                  type="button"
                  onClick={handleShuffleActivePart}
                  title="Remix active part"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0F1528] border border-[#E2E8F0]/10 text-[11px] font-medium text-[#CBD5E1] hover:text-[#7CF0FF] transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Shuffle className="w-3 h-3" />
                  <span>Remix</span>
                </button>
                <button
                  type="button"
                  onClick={handleShuffleAll}
                  className="px-2.5 py-1.5 rounded-lg bg-[#0F1528] border border-[#E2E8F0]/10 text-[11px] font-medium text-[#CBD5E1] hover:text-[#7CF0FF] transition-colors whitespace-nowrap cursor-pointer"
                >
                  Shuffle All
                </button>
                <button
                  type="button"
                  onClick={() => engineRef.current?.resetCameraView()}
                  title="Reset camera framing"
                  className="p-1.5 rounded-lg bg-[#0F1528] border border-[#E2E8F0]/10 text-[#CBD5E1] hover:text-[#7CF0FF] transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowSavePrompt(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#7CF0FF] text-[#040914] text-[11.5px] font-semibold hover:bg-[#9CF5FF] transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
              </div>
            </div>

            {/* Row 2: Visual Variant Cards for Active Part */}
            {activePart === 'surface' ? (
              <div className="flex flex-col gap-2.5">
                {/* 3-Layer Composable Switcher Header */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-1 bg-[#050812] p-0.5 rounded-lg border border-[#E2E8F0]/10">
                    {(
                      [
                        { id: 'optical', label: `1. Optical Base · ${activeOpticalName}` },
                        { id: 'pattern', label: `2. Surface Pattern · ${activePatternName}` },
                        { id: 'colorway', label: `3. Colorway · ${activeColorwayName}` },
                      ] as Array<{ id: SurfaceSubTab; label: string }>
                    ).map((sub) => (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => setSurfaceTab(sub.id)}
                        className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                          surfaceTab === sub.id
                            ? 'bg-[#7CF0FF] text-[#040914]'
                            : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                        }`}
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sub-tab Cards */}
                <div className="flex items-stretch gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {surfaceTab === 'optical' &&
                    OPTICAL_BASES.map((opt) => {
                      const active = recipe.surface.opticalBase === opt.id;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => handleSelectOpticalBase(opt.id)}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-colors shrink-0 min-w-[164px] cursor-pointer ${
                            active
                              ? 'bg-[#121D36] border-[#7CF0FF]/65 text-[#F8FAFC]'
                              : 'bg-[#0D1322] border-[#E2E8F0]/10 text-[#CBD5E1] hover:border-[#E2E8F0]/25'
                          }`}
                        >
                          <OpticalBaseIcon baseId={opt.id} active={active} />
                          <div className="flex flex-col min-w-0">
                            <span className="text-[12px] font-semibold truncate">{opt.name}</span>
                            <span className="text-[10px] text-[#94A3B8] truncate">{opt.subtitle}</span>
                          </div>
                        </button>
                      );
                    })}

                  {surfaceTab === 'pattern' &&
                    SURFACE_PATTERNS.map((pat) => {
                      const active = recipe.surface.patternType === pat.id;
                      return (
                        <button
                          key={pat.key}
                          type="button"
                          onClick={() => handleSelectPattern(pat.id)}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-colors shrink-0 min-w-[158px] cursor-pointer ${
                            active
                              ? 'bg-[#121D36] border-[#7CF0FF]/65 text-[#F8FAFC]'
                              : 'bg-[#0D1322] border-[#E2E8F0]/10 text-[#CBD5E1] hover:border-[#E2E8F0]/25'
                          }`}
                        >
                          <PatternIcon patternId={pat.id} active={active} />
                          <div className="flex flex-col min-w-0">
                            <span className="text-[12px] font-semibold truncate">{pat.name}</span>
                            <span className="text-[10px] text-[#94A3B8] truncate">{pat.subtitle}</span>
                          </div>
                        </button>
                      );
                    })}

                  {surfaceTab === 'colorway' &&
                    COLORWAY_PRESETS.map((cw) => {
                      const active = recipe.surface.colorwayId === cw.id;
                      return (
                        <button
                          key={cw.id}
                          type="button"
                          onClick={() => handleSelectColorway(cw.id)}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-colors shrink-0 min-w-[154px] cursor-pointer ${
                            active
                              ? 'bg-[#121D36] border-[#7CF0FF]/65 text-[#F8FAFC]'
                              : 'bg-[#0D1322] border-[#E2E8F0]/10 text-[#CBD5E1] hover:border-[#E2E8F0]/25'
                          }`}
                        >
                          <ColorwaySwatchIcon
                            coreColor={cw.coreColor}
                            bellColor={cw.bellColor}
                            accentColor={cw.accentColor}
                            tipColor={cw.tipColor}
                            active={active}
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="text-[12px] font-semibold truncate">{cw.name}</span>
                            <span className="text-[10px] text-[#94A3B8] truncate">{cw.subtitle}</span>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            ) : (
              <div className="flex items-stretch gap-2 overflow-x-auto pb-1 no-scrollbar">
                {activePart === 'bell' &&
                  BELL_VARIANTS.map((v) => {
                    const active = recipe.bell.variantId === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => handleSelectBell(v.id)}
                        className={`flex flex-col items-center gap-1 px-2.5 py-2 rounded-xl border text-center transition-colors shrink-0 min-w-[106px] cursor-pointer ${
                          active
                            ? 'bg-[#121D36] border-[#7CF0FF]/65 text-[#F8FAFC]'
                            : 'bg-[#0D1322] border-[#E2E8F0]/10 text-[#CBD5E1] hover:border-[#E2E8F0]/25'
                        }`}
                      >
                        <BellSilhouetteIcon variantId={v.id} active={active} />
                        <span className="text-[11px] font-semibold whitespace-nowrap">{v.name}</span>
                      </button>
                    );
                  })}

                {activePart === 'skirt' &&
                  SKIRT_VARIANTS.map((v) => {
                    const active = recipe.skirt.variantId === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => handleSelectSkirt(v.id)}
                        className={`flex flex-col items-center gap-1 px-2.5 py-2 rounded-xl border text-center transition-colors shrink-0 min-w-[108px] cursor-pointer ${
                          active
                            ? 'bg-[#121D36] border-[#7CF0FF]/65 text-[#F8FAFC]'
                            : 'bg-[#0D1322] border-[#E2E8F0]/10 text-[#CBD5E1] hover:border-[#E2E8F0]/25'
                        }`}
                      >
                        <SkirtSilhouetteIcon variantId={v.id} active={active} />
                        <span className="text-[11px] font-semibold whitespace-nowrap">{v.name}</span>
                      </button>
                    );
                  })}

                {activePart === 'oralArms' &&
                  ORAL_ARMS_VARIANTS.map((v) => {
                    const active = recipe.oralArms.variantId === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => handleSelectOralArms(v.id)}
                        className={`flex flex-col items-center gap-1 px-2.5 py-2 rounded-xl border text-center transition-colors shrink-0 min-w-[108px] cursor-pointer ${
                          active
                            ? 'bg-[#121D36] border-[#7CF0FF]/65 text-[#F8FAFC]'
                            : 'bg-[#0D1322] border-[#E2E8F0]/10 text-[#CBD5E1] hover:border-[#E2E8F0]/25'
                        }`}
                      >
                        <OralArmsSilhouetteIcon variantId={v.id} active={active} />
                        <span className="text-[11px] font-semibold whitespace-nowrap">{v.name}</span>
                      </button>
                    );
                  })}

                {activePart === 'tentacles' &&
                  TENTACLES_VARIANTS.map((v) => {
                    const active = recipe.tentacles.variantId === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => handleSelectTentacles(v.id)}
                        className={`flex flex-col items-center gap-1 px-2.5 py-2 rounded-xl border text-center transition-colors shrink-0 min-w-[112px] cursor-pointer ${
                          active
                            ? 'bg-[#121D36] border-[#7CF0FF]/65 text-[#F8FAFC]'
                            : 'bg-[#0D1322] border-[#E2E8F0]/10 text-[#CBD5E1] hover:border-[#E2E8F0]/25'
                        }`}
                      >
                        <TentaclesSilhouetteIcon variantId={v.id} active={active} />
                        <span className="text-[11px] font-semibold whitespace-nowrap">{v.name}</span>
                      </button>
                    );
                  })}
              </div>
            )}

            {/* Row 3: Targeted Fine-Tuning Sliders & Modifiers */}
            <div className="pt-2 border-t border-[#E2E8F0]/8">
              {activePart === 'bell' && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                  <div className="flex items-center gap-1 bg-[#050812] p-0.5 rounded-lg border border-[#E2E8F0]/10">
                    {(['circle', 'ellipse', 'superformula'] as BellCrossSection[]).map((cs) => (
                      <button
                        key={cs}
                        type="button"
                        onClick={() =>
                          setRecipe((prev) => ({ ...prev, bell: { ...prev.bell, crossSection: cs } }))
                        }
                        className={`px-2 py-1 rounded-md text-[11px] font-medium capitalize cursor-pointer ${
                          recipe.bell.crossSection === cs
                            ? 'bg-[#7CF0FF] text-[#040914]'
                            : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                        }`}
                      >
                        {cs === 'superformula' ? 'Star' : cs}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1 bg-[#050812] p-0.5 rounded-lg border border-[#E2E8F0]/10">
                    {(['plain', 'ridges', 'frill', 'lobes'] as BellRelief[]).map((rel) => (
                      <button
                        key={rel}
                        type="button"
                        onClick={() =>
                          setRecipe((prev) => ({ ...prev, bell: { ...prev.bell, relief: rel } }))
                        }
                        className={`px-2 py-1 rounded-md text-[11px] font-medium capitalize cursor-pointer ${
                          recipe.bell.relief === rel
                            ? 'bg-[#7CF0FF] text-[#040914]'
                            : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                        }`}
                      >
                        {rel}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setRecipe((prev) => ({
                        ...prev,
                        bell: { ...prev.bell, apexStamens: !prev.bell.apexStamens },
                      }))
                    }
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                      recipe.bell.apexStamens
                        ? 'bg-[#16223C] border-[#7CF0FF]/50 text-[#7CF0FF]'
                        : 'bg-[#0F1528] border-[#E2E8F0]/10 text-[#94A3B8] hover:text-[#F1F5F9]'
                    }`}
                  >
                    Apex Stamens
                  </button>

                  <SliderControl
                    label="Height"
                    value={recipe.bell.size}
                    min={22}
                    max={58}
                    step={1}
                    onChange={(size) => setRecipe((prev) => ({ ...prev, bell: { ...prev.bell, size } }))}
                  />
                  <SliderControl
                    label="Width"
                    value={recipe.bell.flare}
                    min={11}
                    max={23}
                    step={0.5}
                    onChange={(flare) => setRecipe((prev) => ({ ...prev, bell: { ...prev.bell, flare } }))}
                  />
                  <SliderControl
                    label="Twist"
                    value={recipe.bell.twist}
                    min={0}
                    max={1.2}
                    step={0.05}
                    onChange={(twist) => setRecipe((prev) => ({ ...prev, bell: { ...prev.bell, twist } }))}
                  />
                </div>
              )}

              {activePart === 'skirt' && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
                  {!recipe.skirt.enabled ? (
                    <div className="flex items-center justify-between w-full text-[12px] text-[#94A3B8]">
                      <span>Inner skirt disabled for an open subumbrella cavity.</span>
                      <button
                        type="button"
                        onClick={() => handleSelectSkirt('concentricFrill')}
                        className="px-3 py-1 rounded-md bg-[#7CF0FF]/15 text-[#7CF0FF] text-[11px] font-medium hover:bg-[#7CF0FF]/25 cursor-pointer"
                      >
                        Add Concentric Frill
                      </button>
                    </div>
                  ) : (
                    <>
                      <SliderControl
                        label="Skirt Flare"
                        value={recipe.skirt.flare}
                        min={8}
                        max={28}
                        step={1}
                        onChange={(flare) =>
                          setRecipe((prev) => ({ ...prev, skirt: { ...prev.skirt, flare } }))
                        }
                      />
                      <SliderControl
                        label="Rib Rings"
                        value={recipe.skirt.ribCount}
                        min={5}
                        max={16}
                        step={1}
                        onChange={(ribCount) =>
                          setRecipe((prev) => ({ ...prev, skirt: { ...prev.skirt, ribCount } }))
                        }
                      />
                    </>
                  )}
                </div>
              )}

              {activePart === 'oralArms' && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
                  {!recipe.oralArms.enabled ? (
                    <div className="flex items-center justify-between w-full text-[12px] text-[#94A3B8]">
                      <span>Oral arms disabled.</span>
                      <button
                        type="button"
                        onClick={() => handleSelectOralArms('turingRibbons')}
                        className="px-3 py-1 rounded-md bg-[#7CF0FF]/15 text-[#7CF0FF] text-[11px] font-medium hover:bg-[#7CF0FF]/25 cursor-pointer"
                      >
                        Add Turing Ribbons
                      </button>
                    </div>
                  ) : (
                    <>
                      <SliderControl
                        label="Arms"
                        value={recipe.oralArms.armCount}
                        min={2}
                        max={12}
                        step={1}
                        onChange={(armCount) =>
                          setRecipe((prev) => ({ ...prev, oralArms: { ...prev.oralArms, armCount } }))
                        }
                      />
                      <SliderControl
                        label="Length"
                        value={recipe.oralArms.length}
                        min={18}
                        max={80}
                        step={2}
                        onChange={(length) =>
                          setRecipe((prev) => ({ ...prev, oralArms: { ...prev.oralArms, length } }))
                        }
                      />
                      <SliderControl
                        label="Ribbon Width"
                        value={recipe.oralArms.ribbonWidth}
                        min={0.5}
                        max={2.2}
                        step={0.05}
                        onChange={(ribbonWidth) =>
                          setRecipe((prev) => ({ ...prev, oralArms: { ...prev.oralArms, ribbonWidth } }))
                        }
                      />
                      <SliderControl
                        label="Ruffle / Curl"
                        value={recipe.oralArms.curl}
                        min={0.4}
                        max={2.2}
                        step={0.05}
                        onChange={(curl) =>
                          setRecipe((prev) => ({ ...prev, oralArms: { ...prev.oralArms, curl } }))
                        }
                      />
                    </>
                  )}
                </div>
              )}

              {activePart === 'tentacles' && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
                  {!recipe.tentacles.enabled ? (
                    <div className="flex items-center justify-between w-full text-[12px] text-[#94A3B8]">
                      <span>Marginal tentacles disabled.</span>
                      <button
                        type="button"
                        onClick={() => handleSelectTentacles('bulbFilaments')}
                        className="px-3 py-1 rounded-md bg-[#7CF0FF]/15 text-[#7CF0FF] text-[11px] font-medium hover:bg-[#7CF0FF]/25 cursor-pointer"
                      >
                        Add Bulb Filaments
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1 bg-[#050812] p-0.5 rounded-lg border border-[#E2E8F0]/10">
                        {(
                          [
                            { id: 'curtain', label: 'Filaments / Ribbons' },
                            { id: 'tube', label: '3D Verlet Tubes' },
                          ] as Array<{ id: TentacleStyle; label: string }>
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              setRecipe((prev) => ({
                                ...prev,
                                tentacles: {
                                  ...prev.tentacles,
                                  style: opt.id,
                                  profile: opt.id === 'tube' ? 'tubes' : 'filaments',
                                  count: opt.id === 'tube' ? Math.min(20, Math.max(8, prev.tentacles.count)) : Math.min(28, Math.max(16, prev.tentacles.count)),
                                },
                              }))
                            }
                            className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                              recipe.tentacles.style === opt.id
                                ? 'bg-[#7CF0FF] text-[#040914]'
                                : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      <SliderControl
                        label="Strands"
                        value={recipe.tentacles.count}
                        min={6}
                        max={recipe.tentacles.style === 'tube' ? 20 : 28}
                        step={1}
                        onChange={(count) =>
                          setRecipe((prev) => ({ ...prev, tentacles: { ...prev.tentacles, count } }))
                        }
                      />
                      <SliderControl
                        label="Length"
                        value={recipe.tentacles.length}
                        min={36}
                        max={120}
                        step={2}
                        onChange={(length) =>
                          setRecipe((prev) => ({ ...prev, tentacles: { ...prev.tentacles, length } }))
                        }
                      />
                      <SliderControl
                        label="Drape Weight"
                        value={recipe.tentacles.weight}
                        min={0.5}
                        max={1.6}
                        step={0.05}
                        onChange={(weight) =>
                          setRecipe((prev) => ({ ...prev, tentacles: { ...prev.tentacles, weight } }))
                        }
                      />
                    </>
                  )}
                </div>
              )}

              {activePart === 'surface' && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                  {/* 4-Stop Chromatic Palette Pickers */}
                  <div className="flex items-center gap-2.5 shrink-0">
                    {(
                      [
                        { key: 'coreColor', label: 'Core' },
                        { key: 'bellColor', label: 'Bell' },
                        { key: 'accentColor', label: 'Accent' },
                        { key: 'tipColor', label: 'Tip' },
                      ] as const
                    ).map((sw) => (
                      <label key={sw.key} className="flex items-center gap-1 text-[11px] text-[#94A3B8] cursor-pointer">
                        <input
                          type="color"
                          value={recipe.surface[sw.key]}
                          onChange={(e) =>
                            setRecipe((prev) => ({
                              ...prev,
                              surface: { ...prev.surface, colorwayId: 'custom', [sw.key]: e.target.value },
                            }))
                          }
                          className="w-5 h-5 rounded-md border border-[#E2E8F0]/20 bg-transparent cursor-pointer"
                        />
                        <span>{sw.label}</span>
                      </label>
                    ))}
                  </div>

                  <SliderControl
                    label="Opacity"
                    value={recipe.surface.opacity}
                    min={0.3}
                    max={0.96}
                    step={0.02}
                    onChange={(opacity) =>
                      setRecipe((prev) => ({ ...prev, surface: { ...prev.surface, opacity } }))
                    }
                  />
                  <SliderControl
                    label="Core Glow"
                    value={recipe.surface.coreGlow}
                    min={0}
                    max={1.8}
                    step={0.05}
                    onChange={(coreGlow) =>
                      setRecipe((prev) => ({ ...prev, surface: { ...prev.surface, coreGlow } }))
                    }
                  />
                  <SliderControl
                    label="Pattern Scale"
                    value={recipe.surface.patternScale}
                    min={0.5}
                    max={2.0}
                    step={0.05}
                    onChange={(patternScale) =>
                      setRecipe((prev) => ({ ...prev, surface: { ...prev.surface, patternScale } }))
                    }
                  />
                  <SliderControl
                    label="Sparkle"
                    value={recipe.surface.sparkleIntensity}
                    min={0}
                    max={1.6}
                    step={0.05}
                    onChange={(sparkleIntensity) =>
                      setRecipe((prev) => ({ ...prev, surface: { ...prev.surface, sparkleIntensity } }))
                    }
                  />
                  <SliderControl
                    label="Pulse Speed"
                    value={motion.pulseSpeed}
                    min={0.15}
                    max={1.2}
                    step={0.05}
                    onChange={(pulseSpeed) => setMotion((prev) => ({ ...prev, pulseSpeed }))}
                  />
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Save Modal */}
      {showSavePrompt && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 p-4">
          <form
            onSubmit={handleSaveSpecimen}
            className="w-full max-w-sm rounded-2xl bg-[#0B1020] border border-[#E2E8F0]/15 p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-[16px] font-semibold text-[#F8FAFC]">Save Specimen</h2>
              <button
                type="button"
                onClick={() => setShowSavePrompt(false)}
                className="p-1 text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="mt-1 text-[12px] text-[#94A3B8]">
              Store your current 3D silhouette, optical shader, pattern, and colorway locally.
            </p>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="e.g. Biolume Crystal Lotus"
              autoFocus
              className="mt-3 w-full rounded-lg bg-[#050812] border border-[#E2E8F0]/15 px-3 py-2 text-[13px] text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#7CF0FF]"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSavePrompt(false)}
                className="px-3.5 py-1.5 rounded-lg text-[12px] text-[#94A3B8] hover:text-[#F1F5F9] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-[#7CF0FF] text-[#040914] text-[12px] font-semibold hover:bg-[#9CF5FF] cursor-pointer"
              >
                Save Specimen
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Collection Slide-Over Drawer */}
      {collectionOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/55">
          <div className="w-full max-w-sm h-full bg-[#090E1C] border-l border-[#E2E8F0]/12 p-5 flex flex-col gap-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-[17px] font-semibold text-[#F8FAFC]">Specimen Collection</h2>
              <button
                type="button"
                onClick={() => setCollectionOpen(false)}
                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-[#94A3B8]">7 Reference Hero Specimens</span>
              <button
                type="button"
                onClick={handleCopyRecipe}
                className="flex items-center gap-1 text-[11px] text-[#7CF0FF] hover:underline cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                <span>Copy Current JSON</span>
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {HERO_SPECIMENS.map((spec) => (
                <button
                  key={spec.id}
                  type="button"
                  onClick={() => {
                    handleSelectHeroSpecimen(spec);
                    setCollectionOpen(false);
                  }}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-[#0F1629] border border-[#E2E8F0]/10 hover:border-[#7CF0FF]/45 text-left transition-colors cursor-pointer"
                >
                  <ColorwaySwatchIcon
                    coreColor={spec.recipe.surface.coreColor}
                    bellColor={spec.recipe.surface.bellColor}
                    accentColor={spec.recipe.surface.accentColor}
                    tipColor={spec.recipe.surface.tipColor}
                    active={activeSpecimenId === spec.id}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold text-[#F8FAFC] truncate">{spec.name}</div>
                    <div className="text-[11px] text-[#94A3B8] truncate">{spec.subtitle}</div>
                  </div>
                </button>
              ))}
            </div>

            {savedSpecimens.length > 0 && (
              <>
                <div className="pt-2 border-t border-[#E2E8F0]/10 text-[11px] font-medium text-[#94A3B8]">
                  Saved Custom Specimens ({savedSpecimens.length})
                </div>
                <div className="flex flex-col gap-2">
                  {savedSpecimens.map((spec) => (
                    <div
                      key={spec.id}
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-[#0F1629] border border-[#E2E8F0]/10"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          handleSelectHeroSpecimen(spec);
                          setCollectionOpen(false);
                        }}
                        className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <ColorwaySwatchIcon
                          coreColor={spec.recipe.surface.coreColor}
                          bellColor={spec.recipe.surface.bellColor}
                          accentColor={spec.recipe.surface.accentColor}
                          tipColor={spec.recipe.surface.tipColor}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[12.5px] font-semibold text-[#F8FAFC] truncate">{spec.name}</div>
                          <div className="text-[11px] text-[#94A3B8] truncate">{spec.subtitle}</div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSaved(spec.id)}
                        title="Delete specimen"
                        className="p-1.5 text-[#64748B] hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MedusaStudioApp;
