import { BodyPlan } from '../jellyfish/creatures/BodyPlan';
import type { JellyfishGeometryConfig, JellyfishSpec } from '../jellyfish/creatures/CreatureSpec';
import type { RadiusProfileCurve } from '../jellyfish/creatures/RadiusProfileCurve';
import { DEFAULT_LOOK_PRESET, type LookConfig } from '../editor/look-presets';

export type PartCategory = 'bell' | 'skirt' | 'oralArms' | 'tentacles' | 'surface';

export type BellCrossSection = 'circle' | 'ellipse' | 'superformula';
export type BellRelief = 'plain' | 'ridges' | 'frill' | 'lobes';
export type BellShapeMode = NonNullable<JellyfishGeometryConfig['bellShapeMode']>;
export type SkirtStyle = NonNullable<JellyfishGeometryConfig['skirtStyle']>;
export type TentacleStyle = 'curtain' | 'tube';
export type OralArmShape = NonNullable<JellyfishGeometryConfig['oralArmShape']>;
export type TentacleProfile = NonNullable<JellyfishGeometryConfig['tentacleProfile']>;

export interface BellModuleState {
  variantId: string;
  shapeMode: BellShapeMode;
  crossSection: BellCrossSection;
  relief: BellRelief;
  size: number;
  flare: number;
  twist: number;
  apexStamens: boolean;
}

export interface SkirtModuleState {
  variantId: string;
  enabled: boolean;
  skirtStyle: SkirtStyle;
  length: number;
  flare: number;
  ribCount: number;
}

export interface OralArmsModuleState {
  variantId: string;
  enabled: boolean;
  shape: OralArmShape;
  armCount: number;
  length: number;
  ribbonWidth: number;
  curl: number;
}

export interface TentaclesModuleState {
  variantId: string;
  enabled: boolean;
  style: TentacleStyle;
  profile: TentacleProfile;
  count: number;
  length: number;
  weight: number;
}

/**
 * Composable 3-Layer Hyperrealistic Surface State:
 *   Layer 1: opticalBase (0..5)
 *   Layer 2: patternType (0..7)
 *   Layer 3: 4-Stop Chromatic Colorway (coreColor -> bellColor -> accentColor -> tipColor)
 */
export interface SurfaceModuleState {
  opticalBase: number;
  patternType: number;
  colorwayId: string;
  coreColor: string;
  bellColor: string;
  accentColor: string;
  tipColor: string;
  background: string;
  opacity: number;
  rimGlow: number;
  refractionStrength: number;
  patternScale: number;
  sparkleIntensity: number;
  coreGlow: number;
  ribOpacity: number;
}

export interface ModularJellyfishRecipe {
  bell: BellModuleState;
  skirt: SkirtModuleState;
  oralArms: OralArmsModuleState;
  tentacles: TentaclesModuleState;
  surface: SurfaceModuleState;
}

export interface StudioMotionState {
  playing: boolean;
  pulseSpeed: number;
  pulseAmplitude: number;
  autoRotate: boolean;
  showRibLines: boolean;
}

export interface BellVariant {
  id: string;
  name: string;
  subtitle: string;
  profile: RadiusProfileCurve;
  defaults: Omit<BellModuleState, 'variantId'>;
  superformulaM?: number;
}

export interface SkirtVariant {
  id: string;
  name: string;
  subtitle: string;
  profile: RadiusProfileCurve;
  defaults: Omit<SkirtModuleState, 'variantId'>;
}

export interface OralArmsVariant {
  id: string;
  name: string;
  subtitle: string;
  defaults: Omit<OralArmsModuleState, 'variantId'>;
}

export interface TentaclesVariant {
  id: string;
  name: string;
  subtitle: string;
  emitterKind: 'band' | 'spiral' | 'phyllotaxis';
  defaults: Omit<TentaclesModuleState, 'variantId'>;
}

export interface OpticalBasePreset {
  id: number;
  key: string;
  name: string;
  subtitle: string;
  defaultRefraction: number;
  defaultOpacity: number;
  defaultRimGlow: number;
}

export interface SurfacePatternPreset {
  id: number;
  key: string;
  name: string;
  subtitle: string;
  defaultScale: number;
  defaultSparkle: number;
}

export interface ColorwayPreset {
  id: string;
  name: string;
  subtitle: string;
  coreColor: string;
  bellColor: string;
  accentColor: string;
  tipColor: string;
  background: string;
}

export interface NamedSpecimen {
  id: string;
  name: string;
  subtitle: string;
  recipe: ModularJellyfishRecipe;
  savedAt?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. BELL VARIATIONS (10 sculptural silhouettes across all 7 references)
// ─────────────────────────────────────────────────────────────────────────────
export const BELL_VARIANTS: BellVariant[] = [
  {
    id: 'scallopedCrystal',
    name: 'Crystal Crown',
    subtitle: 'Scalloped crystal rim (Ref 1)',
    profile: {
      kind: 'polyline',
      points: [
        [0, 0.16],
        [0.14, 0.84],
        [0.42, 1.24],
        [0.72, 1.28],
        [0.9, 1.18],
        [1, 1.06],
      ],
    },
    defaults: { shapeMode: 'scallopedCrystal', crossSection: 'circle', relief: 'plain', size: 34, flare: 18, twist: 0, apexStamens: false },
  },
  {
    id: 'lotusCalyx',
    name: 'Lotus Calyx',
    subtitle: 'Upturned flower canopy (Ref 4)',
    profile: {
      kind: 'polyline',
      points: [
        [0, 0.14],
        [0.18, 0.56],
        [0.44, 0.98],
        [0.72, 1.48],
        [0.9, 1.84],
        [1, 1.98],
      ],
    },
    defaults: { shapeMode: 'lotusCalyx', crossSection: 'circle', relief: 'plain', size: 30, flare: 19, twist: 0, apexStamens: true },
  },
  {
    id: 'orchidCrown',
    name: 'Orchid Crown',
    subtitle: '5-petal dorsal spurs (Ref 5)',
    profile: {
      kind: 'polyline',
      points: [
        [0, 0.14],
        [0.18, 0.58],
        [0.45, 0.96],
        [0.74, 1.46],
        [0.92, 1.78],
        [1, 1.88],
      ],
    },
    defaults: { shapeMode: 'orchidCrown', crossSection: 'circle', relief: 'plain', size: 34, flare: 18, twist: 0, apexStamens: false },
  },
  {
    id: 'opalMantle',
    name: 'Opal Mantle',
    subtitle: 'Torpedo body + top fins (Ref 6)',
    profile: {
      kind: 'polyline',
      points: [
        [0, 0.08],
        [0.16, 0.42],
        [0.34, 0.56],
        [0.58, 0.58],
        [0.84, 0.54],
        [1, 0.46],
      ],
    },
    defaults: { shapeMode: 'opalMantle', crossSection: 'circle', relief: 'plain', size: 54, flare: 15, twist: 0, apexStamens: false },
  },
  {
    id: 'flutedUmbrella',
    name: 'Fluted Nettle',
    subtitle: '16-ribbed radial dome (Ref 7)',
    profile: {
      kind: 'polyline',
      points: [
        [0, 0.14],
        [0.16, 0.88],
        [0.46, 1.38],
        [0.78, 1.44],
        [1, 1.24],
      ],
    },
    defaults: { shapeMode: 'flutedUmbrella', crossSection: 'circle', relief: 'plain', size: 32, flare: 19, twist: 0, apexStamens: false },
  },
  {
    id: 'medusa',
    name: 'Pelagic Dome',
    subtitle: 'Classic clear bell (Ref 3)',
    profile: { kind: 'legacy_bell' },
    defaults: { shapeMode: 'dome', crossSection: 'circle', relief: 'plain', size: 38, flare: 16, twist: 0, apexStamens: false },
  },
  {
    id: 'parasol',
    name: 'Wide Parasol',
    subtitle: 'Broad disc canopy (Ref 2)',
    profile: {
      kind: 'polyline',
      points: [
        [0, 0.14],
        [0.14, 0.96],
        [0.42, 1.54],
        [0.74, 1.62],
        [0.9, 1.44],
        [1, 1.18],
      ],
    },
    defaults: { shapeMode: 'dome', crossSection: 'circle', relief: 'plain', size: 30, flare: 19, twist: 0, apexStamens: false },
  },
  {
    id: 'starCrown',
    name: 'Star Crown',
    subtitle: 'Five-fold pleated star',
    profile: {
      kind: 'polyline',
      points: [
        [0, 0.16],
        [0.22, 0.88],
        [0.55, 1.24],
        [0.82, 1.34],
        [1, 1.14],
      ],
    },
    superformulaM: 5,
    defaults: { shapeMode: 'dome', crossSection: 'superformula', relief: 'plain', size: 36, flare: 17, twist: 0.3, apexStamens: false },
  },
  {
    id: 'egg',
    name: 'Comb Lantern',
    subtitle: 'Ovoid buoyant lantern',
    profile: { kind: 'vesica', min: 0.18, max: 1.16, power: 0.82 },
    defaults: { shapeMode: 'dome', crossSection: 'ellipse', relief: 'ridges', size: 44, flare: 16, twist: 0, apexStamens: false },
  },
  {
    id: 'ruffledRim',
    name: 'Ruffled Margin',
    subtitle: 'Scalloped hem canopy',
    profile: {
      kind: 'polyline',
      points: [
        [0, 0.15],
        [0.2, 0.78],
        [0.52, 1.22],
        [0.8, 1.38],
        [1, 1.46],
      ],
    },
    defaults: { shapeMode: 'dome', crossSection: 'circle', relief: 'frill', size: 36, flare: 18, twist: 0, apexStamens: false },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. INNER SKIRT VARIATIONS (7 distinct subumbrella / collar architectures)
// ─────────────────────────────────────────────────────────────────────────────
export const SKIRT_VARIANTS: SkirtVariant[] = [
  {
    id: 'concentricFrill',
    name: 'Concentric Frill',
    subtitle: 'Layered ruffled collar (Ref 2)',
    profile: {
      kind: 'polyline',
      points: [
        [0, 1.0],
        [0.35, 0.88],
        [0.65, 1.05],
        [1, 0.78],
      ],
    },
    defaults: { enabled: true, skirtStyle: 'concentricFrill', length: 16, flare: 18, ribCount: 10 },
  },
  {
    id: 'velvetCollar',
    name: 'Velvet Collar',
    subtitle: '6-lobed orchid throat (Ref 5)',
    profile: {
      kind: 'polyline',
      points: [
        [0, 0.76],
        [0.45, 0.62],
        [0.85, 0.48],
        [1, 0.36],
      ],
    },
    defaults: { enabled: true, skirtStyle: 'velvetCollar', length: 12, flare: 12, ribCount: 8 },
  },
  {
    id: 'gastricFlower',
    name: 'Gastric Flower',
    subtitle: 'Scalloped coral petals (Ref 3)',
    profile: {
      kind: 'polyline',
      points: [
        [0, 0.95],
        [0.45, 0.84],
        [1, 0.66],
      ],
    },
    defaults: { enabled: true, skirtStyle: 'gastricFlower', length: 11, flare: 14, ribCount: 8 },
  },
  {
    id: 'emeraldVeils',
    name: 'Emerald Veils',
    subtitle: 'Slender lotus inner blades (Ref 4)',
    profile: {
      kind: 'polyline',
      points: [
        [0, 0.68],
        [0.5, 0.56],
        [1, 0.38],
      ],
    },
    defaults: { enabled: true, skirtStyle: 'emeraldVeils', length: 24, flare: 14, ribCount: 12 },
  },
  {
    id: 'innerBell',
    name: 'Classic Velum',
    subtitle: 'Translucent subumbrella (Ref 1)',
    profile: { kind: 'legacy_tail' },
    defaults: { enabled: true, skirtStyle: 'innerBell', length: 14, flare: 16, ribCount: 10 },
  },
  {
    id: 'flaredApron',
    name: 'Flared Apron',
    subtitle: 'Wide undulating ruffle',
    profile: {
      kind: 'polyline',
      points: [
        [0, 1.0],
        [0.45, 1.12],
        [0.85, 1.24],
        [1, 1.18],
      ],
    },
    defaults: { enabled: true, skirtStyle: 'innerBell', length: 18, flare: 22, ribCount: 12 },
  },
  {
    id: 'none',
    name: 'None',
    subtitle: 'Clean open cavity',
    profile: { kind: 'constant', value: 0.4 },
    defaults: { enabled: false, skirtStyle: 'innerBell', length: 0, flare: 10, ribCount: 0 },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. ORAL ARMS VARIATIONS (9 distinct 3D sculptural forms + None)
// ─────────────────────────────────────────────────────────────────────────────
export const ORAL_ARMS_VARIANTS: OralArmsVariant[] = [
  {
    id: 'turingRibbons',
    name: 'Turing Ribbons',
    subtitle: 'Wide scalloped maze sails (Ref 2)',
    defaults: { enabled: true, shape: 'turingRibbons', armCount: 5, length: 58, ribbonWidth: 1.55, curl: 1.3 },
  },
  {
    id: 'kelpFronds',
    name: 'Kelp Fronds',
    subtitle: 'Botanical paddle leaves (Ref 3)',
    defaults: { enabled: true, shape: 'kelpFronds', armCount: 6, length: 52, ribbonWidth: 1.5, curl: 1.05 },
  },
  {
    id: 'cauliflowerClusters',
    name: 'Lagoon Clusters',
    subtitle: 'Frothy cauliflower puffs (Ref 7)',
    defaults: { enabled: true, shape: 'cauliflowerClusters', armCount: 8, length: 28, ribbonWidth: 1.7, curl: 1.6 },
  },
  {
    id: 'flowingMane',
    name: 'Cathedral Mane',
    subtitle: 'Long cascading nettle ribbons',
    defaults: { enabled: true, shape: 'flowingMane', armCount: 6, length: 64, ribbonWidth: 1.4, curl: 1.2 },
  },
  {
    id: 'helicalSpirals',
    name: 'Corkscrew Helices',
    subtitle: 'Sculpted 3D spiral twists',
    defaults: { enabled: true, shape: 'helicalSpirals', armCount: 5, length: 50, ribbonWidth: 1.45, curl: 1.5 },
  },
  {
    id: 'petalCalyx',
    name: 'Lotus Calyx',
    subtitle: 'Cupped arching blossom petals',
    defaults: { enabled: true, shape: 'petalCalyx', armCount: 6, length: 34, ribbonWidth: 1.85, curl: 1.1 },
  },
  {
    id: 'frilledLace',
    name: 'Ruffled Rosette',
    subtitle: 'Flared pleated collar',
    defaults: { enabled: true, shape: 'frilledLace', armCount: 8, length: 30, ribbonWidth: 1.55, curl: 1.45 },
  },
  {
    id: 'ribbons',
    name: 'Classic Ribbons',
    subtitle: 'Slender tapering S-curves',
    defaults: { enabled: true, shape: 'ribbons', armCount: 6, length: 48, ribbonWidth: 0.95, curl: 0.95 },
  },
  {
    id: 'none',
    name: 'None',
    subtitle: 'Clear interior cavity',
    defaults: { enabled: false, shape: 'ribbons', armCount: 0, length: 20, ribbonWidth: 1.0, curl: 1.0 },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 4. TENTACLES VARIATIONS (All unified Particulate Verlet physics!)
// ─────────────────────────────────────────────────────────────────────────────
export const TENTACLES_VARIANTS: TentaclesVariant[] = [
  {
    id: 'crystalTendrils',
    name: 'Crystal Tendrils',
    subtitle: 'Prismatic glass strands (Ref 1)',
    emitterKind: 'band',
    defaults: { enabled: true, style: 'tube', profile: 'crystalTendrils', count: 12, length: 68, weight: 0.9 },
  },
  {
    id: 'stippledCurtain',
    name: 'Stippled Filaments',
    subtitle: 'Glitter-beaded lotus strands (Ref 4)',
    emitterKind: 'band',
    defaults: { enabled: true, style: 'curtain', profile: 'stippledCurtain', count: 24, length: 92, weight: 1.15 },
  },
  {
    id: 'bulbFilaments',
    name: 'Bulb Filaments',
    subtitle: 'Ember-tipped orchid strands (Ref 5)',
    emitterKind: 'band',
    defaults: { enabled: true, style: 'tube', profile: 'bulbFilaments', count: 9, length: 64, weight: 0.85 },
  },
  {
    id: 'beadedArms',
    name: 'Beaded Opal Arms',
    subtitle: 'Pearl-lined arched arms (Ref 6)',
    emitterKind: 'band',
    defaults: { enabled: true, style: 'tube', profile: 'beadedArms', count: 8, length: 58, weight: 1.05 },
  },
  {
    id: 'filaments',
    name: 'Hair Filaments',
    subtitle: 'Sweeping fine marginal strands (Ref 2/3/7)',
    emitterKind: 'band',
    defaults: { enabled: true, style: 'curtain', profile: 'filaments', count: 22, length: 88, weight: 1.1 },
  },
  {
    id: 'curtainVeil',
    name: 'Silk Ribbons',
    subtitle: 'Independent flowing cloth ribbons',
    emitterKind: 'band',
    defaults: { enabled: true, style: 'curtain', profile: 'curtain', count: 14, length: 76, weight: 1.0 },
  },
  {
    id: 'articulatedTubes',
    name: 'Soft-Body Tubes',
    subtitle: 'Flowing sculpted 3D arms',
    emitterKind: 'band',
    defaults: { enabled: true, style: 'tube', profile: 'tubes', count: 10, length: 62, weight: 0.95 },
  },
  {
    id: 'none',
    name: 'None',
    subtitle: 'Pure bell & oral arms',
    emitterKind: 'band',
    defaults: { enabled: false, style: 'curtain', profile: 'curtain', count: 0, length: 60, weight: 1.0 },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 5. COMPOSABLE SURFACE LIBRARY: 6 Optical Bases × 8 Patterns × 10 Colorways
// ─────────────────────────────────────────────────────────────────────────────
export const OPTICAL_BASES: OpticalBasePreset[] = [
  {
    id: 0,
    key: 'prismaticCrystal',
    name: 'Prismatic Crystal',
    subtitle: 'RGB dispersion glass + caustics',
    defaultRefraction: 26,
    defaultOpacity: 0.72,
    defaultRimGlow: 1.35,
  },
  {
    id: 1,
    key: 'abyssalBiolume',
    name: 'Abyssal Biolume',
    subtitle: 'Deep velvet gel + gold rim dust',
    defaultRefraction: 0,
    defaultOpacity: 0.84,
    defaultRimGlow: 1.3,
  },
  {
    id: 2,
    key: 'botanicalGlass',
    name: 'Botanical Glass',
    subtitle: 'Water-clear dome + chlorophyll glow',
    defaultRefraction: 18,
    defaultOpacity: 0.66,
    defaultRimGlow: 1.25,
  },
  {
    id: 3,
    key: 'phosphorFlora',
    name: 'Phosphor Flora',
    subtitle: 'Radiant hearth + emissive margins',
    defaultRefraction: 0,
    defaultOpacity: 0.82,
    defaultRimGlow: 1.4,
  },
  {
    id: 4,
    key: 'frostedCosmic',
    name: 'Frosted Cosmic',
    subtitle: 'Icy crystal + subsurface blush',
    defaultRefraction: 12,
    defaultOpacity: 0.8,
    defaultRimGlow: 1.38,
  },
  {
    id: 5,
    key: 'opalIridescence',
    name: 'Opal Iridescence',
    subtitle: 'Thin-film pearl rainbow sheen',
    defaultRefraction: 14,
    defaultOpacity: 0.84,
    defaultRimGlow: 1.42,
  },
];

export const SURFACE_PATTERNS: SurfacePatternPreset[] = [
  { id: 0, key: 'biolumeWaves', name: 'Biolume Waves', subtitle: '7-layer harmonic interference', defaultScale: 1.0, defaultSparkle: 0.2 },
  { id: 1, key: 'hexVoronoi', name: 'Hex Voronoi', subtitle: 'Crystal honeycomb facets', defaultScale: 1.05, defaultSparkle: 0.25 },
  { id: 2, key: 'turingMaze', name: 'Turing Labyrinth', subtitle: 'Reaction-diffusion maze', defaultScale: 1.0, defaultSparkle: 0.35 },
  { id: 3, key: 'leafVeins', name: 'Veins & Pearls', subtitle: 'Botanical veins + starlight dots', defaultScale: 1.0, defaultSparkle: 0.5 },
  { id: 4, key: 'cosmicStarfield', name: 'Cosmic Starfield', subtitle: 'Twinkling crystal micro-glitter', defaultScale: 1.1, defaultSparkle: 1.15 },
  { id: 5, key: 'chromatophore', name: 'Chromatophore', subtitle: 'Pulsing opal pigment clouds', defaultScale: 1.0, defaultSparkle: 0.3 },
  { id: 6, key: 'exumbrellaSpots', name: 'Lagoon Spots', subtitle: 'Organic exumbrella polka-dots', defaultScale: 1.05, defaultSparkle: 0.2 },
  { id: 7, key: 'radialFlutes', name: 'Glass Flutes', subtitle: 'Sculpted radial ribs & comb pulse', defaultScale: 1.0, defaultSparkle: 0.25 },
];

export const COLORWAY_PRESETS: ColorwayPreset[] = [
  {
    id: 'prismaticCyanAmber',
    name: 'Prismatic Cyan',
    subtitle: 'Gold core · cyan · amber rim',
    coreColor: '#FFE58F',
    bellColor: '#22E8FF',
    accentColor: '#1254FF',
    tipColor: '#FF7A1A',
    background: '#03060E',
  },
  {
    id: 'indigoChartreuse',
    name: 'Abyssal Maze',
    subtitle: 'Chartreuse · cobalt · gold edge',
    coreColor: '#C8FF4D',
    bellColor: '#29E3FF',
    accentColor: '#3B28FF',
    tipColor: '#FFD25A',
    background: '#030510',
  },
  {
    id: 'jadeCoralSilver',
    name: 'Emerald Kelp',
    subtitle: 'Coral heart · emerald · silver',
    coreColor: '#FF8E7A',
    bellColor: '#9AF2E2',
    accentColor: '#0E9E75',
    tipColor: '#F0FAFF',
    background: '#020B12',
  },
  {
    id: 'phosphorMint',
    name: 'Phosphor Mint',
    subtitle: 'Lime hearth · jade · starlight',
    coreColor: '#C8FF9B',
    bellColor: '#35CC7D',
    accentColor: '#157A52',
    tipColor: '#F6FFF2',
    background: '#020906',
  },
  {
    id: 'sapphireOrchid',
    name: 'Celestial Orchid',
    subtitle: 'Peach throat · ice blue · ember',
    coreColor: '#FFB4A8',
    bellColor: '#4BCBFF',
    accentColor: '#B866FF',
    tipColor: '#FF521B',
    background: '#040510',
  },
  {
    id: 'opalUltraviolet',
    name: 'Opal Mantle',
    subtitle: 'Pearl mint · sapphire · magenta',
    coreColor: '#E8FFF8',
    bellColor: '#3B82FF',
    accentColor: '#DF46FF',
    tipColor: '#F7BA26',
    background: '#03060F',
  },
  {
    id: 'sunsetAbyss',
    name: 'Sunset Nettle',
    subtitle: 'Molten orange · indigo · cyan',
    coreColor: '#FF981A',
    bellColor: '#1E2A78',
    accentColor: '#22E8FF',
    tipColor: '#D044FF',
    background: '#03040B',
  },
  {
    id: 'spottedLagoon',
    name: 'Spotted Lagoon',
    subtitle: 'Golden core · turquoise · cobalt',
    coreColor: '#FFBC42',
    bellColor: '#4CC6FF',
    accentColor: '#284BFF',
    tipColor: '#FFF0C2',
    background: '#030710',
  },
  {
    id: 'crimsonCrystal',
    name: 'Crimson Crown',
    subtitle: 'Milky glass · blood crimson',
    coreColor: '#FF3B30',
    bellColor: '#D6ECFF',
    accentColor: '#B8142C',
    tipColor: '#FF7043',
    background: '#05050A',
  },
  {
    id: 'roseSakura',
    name: 'Rose Saucer',
    subtitle: 'Sakura pink · orchid · violet',
    coreColor: '#FFD1E8',
    bellColor: '#FF7EB6',
    accentColor: '#7D3CFF',
    tipColor: '#FF4F93',
    background: '#06040D',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 6. THE 7 REFERENCE HERO SPECIMENS (1-Click Museum Gallery + Mix-and-Match)
// ─────────────────────────────────────────────────────────────────────────────
export const HERO_SPECIMENS: NamedSpecimen[] = [
  {
    id: 'prismatic-voronoi',
    name: 'Prismatic Crown',
    subtitle: 'Ref 1 · Hex Voronoi crystal dome & golden core',
    recipe: {
      bell: { variantId: 'scallopedCrystal', shapeMode: 'scallopedCrystal', crossSection: 'circle', relief: 'plain', size: 34, flare: 18, twist: 0, apexStamens: false },
      skirt: { variantId: 'innerBell', enabled: true, skirtStyle: 'innerBell', length: 12, flare: 15, ribCount: 9 },
      oralArms: { variantId: 'frilledLace', enabled: true, shape: 'frilledLace', armCount: 6, length: 24, ribbonWidth: 1.25, curl: 1.2 },
      tentacles: { variantId: 'crystalTendrils', enabled: true, style: 'tube', profile: 'crystalTendrils', count: 12, length: 68, weight: 0.9 },
      surface: {
        opticalBase: 0,
        patternType: 1,
        colorwayId: 'prismaticCyanAmber',
        coreColor: '#FFE58F',
        bellColor: '#22E8FF',
        accentColor: '#1254FF',
        tipColor: '#FF7A1A',
        background: '#03060E',
        opacity: 0.72,
        rimGlow: 1.4,
        refractionStrength: 28,
        patternScale: 1.05,
        sparkleIntensity: 0.25,
        coreGlow: 1.25,
        ribOpacity: 0.06,
      },
    },
  },
  {
    id: 'abyssal-labyrinth',
    name: 'Turing Labyrinth',
    subtitle: 'Ref 2 · Reaction-diffusion maze ribbons & gold rims',
    recipe: {
      bell: { variantId: 'parasol', shapeMode: 'dome', crossSection: 'circle', relief: 'plain', size: 30, flare: 19, twist: 0, apexStamens: false },
      skirt: { variantId: 'concentricFrill', enabled: true, skirtStyle: 'concentricFrill', length: 16, flare: 18, ribCount: 10 },
      oralArms: { variantId: 'turingRibbons', enabled: true, shape: 'turingRibbons', armCount: 5, length: 62, ribbonWidth: 1.65, curl: 1.35 },
      tentacles: { variantId: 'filaments', enabled: true, style: 'curtain', profile: 'filaments', count: 20, length: 84, weight: 1.05 },
      surface: {
        opticalBase: 1,
        patternType: 2,
        colorwayId: 'indigoChartreuse',
        coreColor: '#C8FF4D',
        bellColor: '#29E3FF',
        accentColor: '#3B28FF',
        tipColor: '#FFD25A',
        background: '#030510',
        opacity: 0.84,
        rimGlow: 1.35,
        refractionStrength: 0,
        patternScale: 1.0,
        sparkleIntensity: 0.4,
        coreGlow: 1.15,
        ribOpacity: 0.07,
      },
    },
  },
  {
    id: 'emerald-kelp',
    name: 'Emerald Kelp',
    subtitle: 'Ref 3 · Clear botanical dome & spatulate leaf fronds',
    recipe: {
      bell: { variantId: 'medusa', shapeMode: 'dome', crossSection: 'circle', relief: 'plain', size: 36, flare: 17, twist: 0, apexStamens: false },
      skirt: { variantId: 'gastricFlower', enabled: true, skirtStyle: 'gastricFlower', length: 11, flare: 14, ribCount: 8 },
      oralArms: { variantId: 'kelpFronds', enabled: true, shape: 'kelpFronds', armCount: 6, length: 56, ribbonWidth: 1.55, curl: 1.05 },
      tentacles: { variantId: 'filaments', enabled: true, style: 'curtain', profile: 'filaments', count: 20, length: 86, weight: 1.05 },
      surface: {
        opticalBase: 2,
        patternType: 3,
        colorwayId: 'jadeCoralSilver',
        coreColor: '#FF8E7A',
        bellColor: '#9AF2E2',
        accentColor: '#0E9E75',
        tipColor: '#F0FAFF',
        background: '#020B12',
        opacity: 0.68,
        rimGlow: 1.25,
        refractionStrength: 18,
        patternScale: 1.05,
        sparkleIntensity: 0.45,
        coreGlow: 1.1,
        ribOpacity: 0.06,
      },
    },
  },
  {
    id: 'starlight-lotus',
    name: 'Starlight Lotus',
    subtitle: 'Ref 4 · Upturned floral calyx, stamens & stipple veil',
    recipe: {
      bell: { variantId: 'lotusCalyx', shapeMode: 'lotusCalyx', crossSection: 'circle', relief: 'plain', size: 30, flare: 19, twist: 0, apexStamens: true },
      skirt: { variantId: 'emeraldVeils', enabled: true, skirtStyle: 'emeraldVeils', length: 24, flare: 14, ribCount: 10 },
      oralArms: { variantId: 'ribbons', enabled: true, shape: 'ribbons', armCount: 4, length: 38, ribbonWidth: 0.85, curl: 0.85 },
      tentacles: { variantId: 'stippledCurtain', enabled: true, style: 'curtain', profile: 'stippledCurtain', count: 26, length: 94, weight: 1.15 },
      surface: {
        opticalBase: 3,
        patternType: 3,
        colorwayId: 'phosphorMint',
        coreColor: '#C8FF9B',
        bellColor: '#35CC7D',
        accentColor: '#157A52',
        tipColor: '#F6FFF2',
        background: '#020906',
        opacity: 0.76,
        rimGlow: 1.15,
        refractionStrength: 0,
        patternScale: 1.0,
        sparkleIntensity: 0.55,
        coreGlow: 1.05,
        ribOpacity: 0.05,
      },
    },
  },
  {
    id: 'celestial-orchid',
    name: 'Celestial Orchid',
    subtitle: 'Ref 5 · 5-petal starfield crown & ember-bulb filaments',
    recipe: {
      bell: { variantId: 'orchidCrown', shapeMode: 'orchidCrown', crossSection: 'circle', relief: 'plain', size: 34, flare: 18, twist: 0, apexStamens: false },
      skirt: { variantId: 'velvetCollar', enabled: true, skirtStyle: 'velvetCollar', length: 12, flare: 12, ribCount: 8 },
      oralArms: { variantId: 'none', enabled: false, shape: 'ribbons', armCount: 0, length: 20, ribbonWidth: 1.0, curl: 1.0 },
      tentacles: { variantId: 'bulbFilaments', enabled: true, style: 'tube', profile: 'bulbFilaments', count: 9, length: 64, weight: 0.85 },
      surface: {
        opticalBase: 4,
        patternType: 4,
        colorwayId: 'sapphireOrchid',
        coreColor: '#FFB4A8',
        bellColor: '#4BCBFF',
        accentColor: '#B866FF',
        tipColor: '#FF521B',
        background: '#040510',
        opacity: 0.82,
        rimGlow: 1.42,
        refractionStrength: 14,
        patternScale: 1.1,
        sparkleIntensity: 1.25,
        coreGlow: 1.05,
        ribOpacity: 0.05,
      },
    },
  },
  {
    id: 'opal-chromatophore',
    name: 'Opal Mantle',
    subtitle: 'Ref 6 · Iridescent chromatophore & pearl-beaded arms',
    recipe: {
      bell: { variantId: 'opalMantle', shapeMode: 'opalMantle', crossSection: 'circle', relief: 'plain', size: 54, flare: 15, twist: 0, apexStamens: false },
      skirt: { variantId: 'none', enabled: false, skirtStyle: 'innerBell', length: 0, flare: 10, ribCount: 0 },
      oralArms: { variantId: 'ribbons', enabled: true, shape: 'ribbons', armCount: 4, length: 42, ribbonWidth: 0.72, curl: 0.65 },
      tentacles: { variantId: 'beadedArms', enabled: true, style: 'tube', profile: 'beadedArms', count: 8, length: 58, weight: 1.05 },
      surface: {
        opticalBase: 5,
        patternType: 5,
        colorwayId: 'opalUltraviolet',
        coreColor: '#E8FFF8',
        bellColor: '#3B82FF',
        accentColor: '#DF46FF',
        tipColor: '#F7BA26',
        background: '#03060F',
        opacity: 0.86,
        rimGlow: 1.45,
        refractionStrength: 14,
        patternScale: 1.0,
        sparkleIntensity: 0.35,
        coreGlow: 0.9,
        ribOpacity: 0.05,
      },
    },
  },
  {
    id: 'sunset-nettle',
    name: 'Sunset Nettle',
    subtitle: 'Ref 7 · Fluted obsidian-amber dome & neon ribbons',
    recipe: {
      bell: { variantId: 'flutedUmbrella', shapeMode: 'flutedUmbrella', crossSection: 'circle', relief: 'plain', size: 32, flare: 19, twist: 0, apexStamens: false },
      skirt: { variantId: 'gastricFlower', enabled: true, skirtStyle: 'gastricFlower', length: 12, flare: 15, ribCount: 9 },
      oralArms: { variantId: 'flowingMane', enabled: true, shape: 'flowingMane', armCount: 6, length: 68, ribbonWidth: 1.5, curl: 1.25 },
      tentacles: { variantId: 'filaments', enabled: true, style: 'curtain', profile: 'filaments', count: 22, length: 92, weight: 1.12 },
      surface: {
        opticalBase: 1,
        patternType: 7,
        colorwayId: 'sunsetAbyss',
        coreColor: '#FF981A',
        bellColor: '#1E2A78',
        accentColor: '#22E8FF',
        tipColor: '#D044FF',
        background: '#03040B',
        opacity: 0.82,
        rimGlow: 1.4,
        refractionStrength: 0,
        patternScale: 1.0,
        sparkleIntensity: 0.3,
        coreGlow: 1.4,
        ribOpacity: 0.06,
      },
    },
  },
];

// Alias kept for existing stability tests & legacy imports
export const STARTER_SPECIMENS: NamedSpecimen[] = HERO_SPECIMENS;

export const DEFAULT_MOTION_STATE: StudioMotionState = {
  playing: true,
  pulseSpeed: 0.55,
  pulseAmplitude: 0.14,
  autoRotate: true,
  showRibLines: false,
};

export function cloneRecipe(recipe: ModularJellyfishRecipe): ModularJellyfishRecipe {
  return {
    bell: { ...recipe.bell },
    skirt: { ...recipe.skirt },
    oralArms: { ...recipe.oralArms },
    tentacles: { ...recipe.tentacles },
    surface: { ...recipe.surface },
  };
}

export function getStructuralSignature(recipe: ModularJellyfishRecipe): string {
  return JSON.stringify({
    bell: recipe.bell,
    skirt: recipe.skirt,
    oralArms: recipe.oralArms,
    tentacles: recipe.tentacles,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Compilers: Modular Recipe -> JellyfishSpec + LookConfig
// ─────────────────────────────────────────────────────────────────────────────
export function compileModularRecipe(recipe: ModularJellyfishRecipe): JellyfishSpec {
  const bellVariant = BELL_VARIANTS.find((v) => v.id === recipe.bell.variantId) ?? BELL_VARIANTS[0];
  const skirtVariant = SKIRT_VARIANTS.find((v) => v.id === recipe.skirt.variantId) ?? SKIRT_VARIANTS[0];
  const tentVariant = TENTACLES_VARIANTS.find((v) => v.id === recipe.tentacles.variantId) ?? TENTACLES_VARIANTS[0];

  let crossSection: JellyfishSpec['crossSection'] = { kind: 'circle', twist: recipe.bell.twist };
  if (recipe.bell.crossSection === 'ellipse') {
    crossSection = { kind: 'ellipse', xScale: 1.24, zScale: 0.84, twist: recipe.bell.twist };
  } else if (recipe.bell.crossSection === 'superformula') {
    crossSection = {
      kind: 'superformula',
      twist: recipe.bell.twist,
      superformula: { m: bellVariant.superformulaM ?? 5, n1: 0.42, n2: 0.45, n3: 0.45 },
    };
  }

  let surface: JellyfishSpec['surface'] | undefined;
  let lobes: JellyfishSpec['lobes'] | undefined;
  if (recipe.bell.relief === 'ridges') {
    surface = { ridges: { count: 8, amplitude: 0.14, tRange: [0.12, 0.94] } };
  } else if (recipe.bell.relief === 'frill') {
    surface = { frill: { amplitude: 0.12, frequency: 12, tRange: [0.66, 1.0] } };
  } else if (recipe.bell.relief === 'lobes') {
    lobes = { count: 8, amplitude: 0.2, radiusScale: 0.9, tRange: [0.22, 0.92] };
  }

  const tentSegLength = 1.6;
  const tentSegments = recipe.tentacles.enabled
    ? Math.max(12, Math.round(recipe.tentacles.length / tentSegLength))
    : 0;

  const armSegLength = 1.35;
  const armSegments = recipe.oralArms.enabled
    ? Math.max(12, Math.round(recipe.oralArms.length / armSegLength))
    : 0;

  const emitters: JellyfishSpec['emitters'] = recipe.tentacles.enabled
    ? {
        tentacles:
          tentVariant.emitterKind === 'spiral'
            ? { kind: 'spiral', groupCount: Math.max(1, recipe.tentacles.count), ribRange: [13, 18], pitch: 1.5 }
            : tentVariant.emitterKind === 'phyllotaxis'
              ? { kind: 'phyllotaxis', groupCount: Math.max(1, recipe.tentacles.count), ribRange: [13, 18] }
              : { kind: 'band', groupCount: Math.max(1, recipe.tentacles.count), ribRange: [14, 19] },
      }
    : undefined;

  return {
    id: `modular-${recipe.bell.variantId}-${recipe.surface.colorwayId}`,
    archetypeId: 'jellyfish',
    bodyPlan: BodyPlan.Medusa,
    features: {
      tail: recipe.skirt.enabled && recipe.skirt.ribCount > 0,
      mouth: recipe.oralArms.enabled && recipe.oralArms.armCount > 0,
      tentacles: recipe.tentacles.enabled && recipe.tentacles.count > 0,
    },
    profiles: {
      bulb: bellVariant.profile,
      tail: skirtVariant.profile,
    },
    crossSection,
    surface,
    lobes,
    tentacleStyle: recipe.tentacles.style,
    emitters,
    geometry: {
      size: recipe.bell.size,
      yOffset: 22,
      ribsCount: 24,
      totalSegments: 48,
      ribRadius: recipe.bell.flare,
      bellShapeMode: recipe.bell.shapeMode,
      apexStamens: recipe.bell.apexStamens,
      gastricCoreIntensity: recipe.surface.coreGlow,
      tailRibsCount: recipe.skirt.enabled ? recipe.skirt.ribCount : 0,
      tailRibRadiusFactor: recipe.skirt.flare,
      skirtStyle: recipe.skirt.skirtStyle,
      tailArmSegments: armSegments,
      tailArmSegmentLength: armSegLength,
      tailArmWeight: 0.52,
      oralArmCount: recipe.oralArms.enabled ? recipe.oralArms.armCount : 0,
      oralArmWidth: recipe.oralArms.ribbonWidth,
      oralArmCurl: recipe.oralArms.curl,
      oralArmShape: recipe.oralArms.shape,
      tentacleSegments: tentSegments,
      tentacleSegmentLength: tentSegLength,
      tentacleWeightFactor: recipe.tentacles.weight,
      tentacleProfile: recipe.tentacles.profile,
    },
  };
}

export function compileLookConfig(
  recipe: ModularJellyfishRecipe,
  _motion: StudioMotionState,
): LookConfig {
  const s = recipe.surface;
  return {
    ...DEFAULT_LOOK_PRESET,
    scene: {
      background: s.background || '#03060E',
    },
    bulb: {
      colorA: s.bellColor,
      colorB: s.accentColor,
      opacity: s.opacity,
      patternScale0: s.patternScale,
      patternScale1: s.patternScale,
      rimBoost: s.rimGlow,
    },
    gel: {
      color: s.bellColor,
      opacity: Math.min(0.16, s.opacity * 0.18),
    },
    tail: {
      colorA: s.coreColor,
      colorB: s.accentColor,
      opacity: Math.min(0.68, s.opacity * 0.72),
      scale: 12,
    },
    mouth: {
      colorA: s.bellColor,
      colorB: s.tipColor,
      opacity: Math.min(0.82, s.opacity * 0.92),
      scale: 9,
    },
    tentacle: {
      color: s.bellColor,
      opacity: recipe.tentacles.style === 'tube' ? Math.min(0.9, s.opacity + 0.12) : Math.min(0.82, s.opacity * 0.94),
      area: 2000,
    },
    dust: {
      ...DEFAULT_LOOK_PRESET.dust,
      color: s.coreColor,
      opacity: 0.34,
    },
    post: {
      ...DEFAULT_LOOK_PRESET.post,
      // Restrained selective glass-and-vein HDR bloom: zero whiteout wash across the bell dome
      bloomStrength: 0.2 + Math.min(0.1, s.rimGlow * 0.06),
      bloomRadius: 0.36,
      bloomThreshold: 0.88,
      vignetteDarkness: 0.55,
      vignetteOffset: 0.92,
      vignetteColor: s.background || '#03060E',
    },
  };
}

export function getStructureKey(recipe: ModularJellyfishRecipe): string {
  return getStructuralSignature(recipe);
}

export function randomizePart(recipe: ModularJellyfishRecipe, part: PartCategory): ModularJellyfishRecipe {
  const pickDifferent = <T,>(items: T[], isCurrent: (item: T) => boolean): T => {
    const others = items.filter((item) => !isCurrent(item));
    const pool = others.length > 0 ? others : items;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const next = cloneRecipe(recipe);
  if (part === 'bell') {
    const v = pickDifferent(BELL_VARIANTS, (item) => item.id === recipe.bell.variantId);
    next.bell = { variantId: v.id, ...v.defaults };
  } else if (part === 'skirt') {
    const v = pickDifferent(SKIRT_VARIANTS, (item) => item.id === recipe.skirt.variantId);
    next.skirt = { variantId: v.id, ...v.defaults };
  } else if (part === 'oralArms') {
    const v = pickDifferent(ORAL_ARMS_VARIANTS, (item) => item.id === recipe.oralArms.variantId);
    next.oralArms = { variantId: v.id, ...v.defaults };
  } else if (part === 'tentacles') {
    const v = pickDifferent(TENTACLES_VARIANTS, (item) => item.id === recipe.tentacles.variantId);
    next.tentacles = { variantId: v.id, ...v.defaults };
  } else if (part === 'surface') {
    const opt = pickDifferent(OPTICAL_BASES, (item) => item.id === recipe.surface.opticalBase);
    const pat = pickDifferent(SURFACE_PATTERNS, (item) => item.id === recipe.surface.patternType);
    const col = pickDifferent(COLORWAY_PRESETS, (item) => item.id === recipe.surface.colorwayId);
    next.surface = {
      ...next.surface,
      opticalBase: opt.id,
      patternType: pat.id,
      colorwayId: col.id,
      coreColor: col.coreColor,
      bellColor: col.bellColor,
      accentColor: col.accentColor,
      tipColor: col.tipColor,
      background: col.background,
      opacity: opt.defaultOpacity,
      rimGlow: opt.defaultRimGlow,
      refractionStrength: opt.defaultRefraction,
      patternScale: pat.defaultScale,
      sparkleIntensity: pat.defaultSparkle,
    };
  }
  return next;
}

export function randomizeAllParts(current: ModularJellyfishRecipe): ModularJellyfishRecipe {
  return randomizeModularRecipe(current);
}

const STORAGE_KEY = 'medusa_studio_saved_specimens_v2';

export function loadSavedSpecimens(): NamedSpecimen[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is NamedSpecimen =>
        Boolean(item && typeof item.id === 'string' && typeof item.name === 'string' && item.recipe?.surface?.coreColor),
    );
  } catch {
    return [];
  }
}

export function saveSpecimenToStorage(name: string, recipe: ModularJellyfishRecipe): NamedSpecimen[] {
  const existing = loadSavedSpecimens();
  const entry: NamedSpecimen = {
    id: `saved-${Date.now()}`,
    name: name.trim() || 'Untitled Specimen',
    subtitle: `${BELL_VARIANTS.find((b) => b.id === recipe.bell.variantId)?.name ?? 'Custom'} · ${
      OPTICAL_BASES.find((o) => o.id === recipe.surface.opticalBase)?.name ?? 'Custom'
    }`,
    recipe: cloneRecipe(recipe),
    savedAt: Date.now(),
  };
  const next = [entry, ...existing].slice(0, 24);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
  return next;
}

export function deleteSpecimenFromStorage(id: string): NamedSpecimen[] {
  const next = loadSavedSpecimens().filter((item) => item.id !== id);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage errors
  }
  return next;
}

export function randomizeModularRecipe(current: ModularJellyfishRecipe): ModularJellyfishRecipe {
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const bellVar = pick(BELL_VARIANTS);
  const skirtVar = pick(SKIRT_VARIANTS);
  const armsVar = pick(ORAL_ARMS_VARIANTS.filter((v) => v.id !== 'none'));
  const tentVar = pick(TENTACLES_VARIANTS.filter((v) => v.id !== 'none'));
  const optical = pick(OPTICAL_BASES);
  const pattern = pick(SURFACE_PATTERNS);
  const colorway = pick(COLORWAY_PRESETS);

  return {
    bell: { variantId: bellVar.id, ...bellVar.defaults },
    skirt: { variantId: skirtVar.id, ...skirtVar.defaults },
    oralArms: { variantId: armsVar.id, ...armsVar.defaults },
    tentacles: { variantId: tentVar.id, ...tentVar.defaults },
    surface: {
      ...current.surface,
      opticalBase: optical.id,
      patternType: pattern.id,
      colorwayId: colorway.id,
      coreColor: colorway.coreColor,
      bellColor: colorway.bellColor,
      accentColor: colorway.accentColor,
      tipColor: colorway.tipColor,
      background: colorway.background,
      opacity: optical.defaultOpacity,
      rimGlow: optical.defaultRimGlow,
      refractionStrength: optical.defaultRefraction,
      patternScale: pattern.defaultScale,
      sparkleIntensity: pattern.defaultSparkle,
      coreGlow: 1.15,
    },
  };
}
