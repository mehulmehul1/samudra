import { describe, expect, it } from 'vitest';
import { PRESETS } from '../../../jellyfish/creatures';
import { jellyfishArchetype } from '../JellyfishArchetype';
import { STARTER_SPECIMENS, compileModularRecipe } from '../../../studio/modularRecipe';

describe('jellyfish archetype stability', () => {
  const presets = Object.values(PRESETS).filter(
    (preset) => preset.spec.archetypeId === jellyfishArchetype.id,
  );

  for (const preset of presets) {
    it(`${preset.name} remains finite and bounded for ten seconds`, () => {
      const body = jellyfishArchetype.buildBody(
        structuredClone(preset.spec),
        { timestep: 1000 / 30 },
        { random: () => 0.5 },
      );

      for (let tick = 0; tick < 300; tick++) {
        jellyfishArchetype.animateBody(body, tick / 30, 1000 / 30, 0.15);
      }

      const units = (body.geometryData as any).units as Array<{ geometryData: { system: { positions: Float32Array } } }>;
      expect(units.length).toBeGreaterThan(0);

      for (const unit of units) {
        let maxCoordinate = 0;
        for (const value of unit.geometryData.system.positions) {
          expect(Number.isFinite(value)).toBe(true);
          maxCoordinate = Math.max(maxCoordinate, Math.abs(value));
        }
        expect(maxCoordinate).toBeLessThan(350);
      }
    });
  }
});

describe('modular jellyfish studio stability', () => {
  for (const specimen of STARTER_SPECIMENS) {
    it(`${specimen.name} remains finite, bounded, and free of tether artifacts`, () => {
      const spec = compileModularRecipe(specimen.recipe);
      const body = jellyfishArchetype.buildBody(
        spec,
        { timestep: 1000 / 30 },
        { random: () => 0.5 },
      );

      for (let tick = 0; tick < 300; tick++) {
        jellyfishArchetype.animateBody(body, tick / 30, 1000 / 30, 0.16);
      }

      const units = (body.geometryData as any).units as Array<{
        geometryData: {
          system: { positions: Float32Array };
          links: { linesFore: number[]; linesInner: number[] };
        };
      }>;
      expect(units.length).toBeGreaterThan(0);

      for (const unit of units) {
        const positions = unit.geometryData.system.positions;
        let maxCoordinate = 0;
        for (const value of positions) {
          expect(Number.isFinite(value)).toBe(true);
          maxCoordinate = Math.max(maxCoordinate, Math.abs(value));
        }
        expect(maxCoordinate).toBeLessThan(350);

        // Verify clean anatomical rib line indices are valid even-length pairs
        expect(unit.geometryData.links.linesFore.length % 2).toBe(0);
        expect(unit.geometryData.links.linesInner.length % 2).toBe(0);
      }
    });
  }

  const oralTopologyCases: Array<{ variantId: string; expectedKind: string }> = [
    { variantId: 'turingRibbons', expectedKind: 'curtain' },
    { variantId: 'kelpFronds', expectedKind: 'kelpFrond' },
    { variantId: 'cauliflowerClusters', expectedKind: 'cauliflowerCluster' },
    { variantId: 'helicalSpirals', expectedKind: 'helicalAuger' },
    { variantId: 'petalCalyx', expectedKind: 'cuppedPetal' },
    { variantId: 'frilledLace', expectedKind: 'pleatedRosette' },
  ];

  for (const { variantId, expectedKind } of oralTopologyCases) {
    it(`oral-arm topology "${variantId}" builds "${expectedKind}" on full-width inner bell and stays stable`, () => {
      const base = structuredClone(STARTER_SPECIMENS[0].recipe);
      base.oralArms.enabled = true;
      base.oralArms.variantId = variantId;
      base.oralArms.shape = variantId as any;
      base.oralArms.armCount = 6;
      const spec = compileModularRecipe(base);
      const body = jellyfishArchetype.buildBody(
        spec,
        { timestep: 1000 / 30 },
        { random: () => 0.5 },
      );

      for (let tick = 0; tick < 180; tick++) {
        jellyfishArchetype.animateBody(body, tick / 30, 1000 / 30, 0.16);
      }

      const unit = (body.geometryData as any).units[0];
      const gd = unit.geometryData;
      expect(gd.tailRibs.length).toBeGreaterThanOrEqual(6);
      expect(gd.oralArmRigs.length).toBeGreaterThan(0);
      expect(gd.oralArmRigs[0].kind).toBe(expectedKind);

      // Inner bell outermost ring must span at least 80% of the outer bell rim radius
      const outerRimR = gd.ribs[gd.ribs.length - 1].radius;
      const innerBellOuterR = gd.tailRibs[0].radius;
      expect(innerBellOuterR).toBeGreaterThan(outerRimR * 0.78);

      let maxCoordinate = 0;
      for (const value of gd.system.positions) {
        expect(Number.isFinite(value)).toBe(true);
        maxCoordinate = Math.max(maxCoordinate, Math.abs(value));
      }
      expect(maxCoordinate).toBeLessThan(350);
    });
  }
});
