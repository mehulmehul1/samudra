declare module 'particulate' {
  export interface Vec3 extends Float32Array {
    // Vec3 operations
  }

  export namespace Vec3 {
    function distance(buffer: number[] | Float32Array, indexA: number, indexB: number): number;
    function set(buffer: number[] | Float32Array, index: number, x: number, y: number, z: number): void;
  }

  export class Constraint {
    indices: number[];
  }

  export class DistanceConstraint extends Constraint {
    static create(distance: number | number[], indices: number[]): DistanceConstraint;
    setDistance(min: number, max?: number): void;
  }

  export class PointConstraint extends Constraint {
    static create(position: number[], index: number): PointConstraint;
    setPosition(x: number, y: number, z: number): void;
  }

  export class AxisConstraint extends Constraint {
    static create(pinA: number, pinB: number, indices: number | number[]): AxisConstraint;
    setAxis(a: number, b: number): void;
  }

  export class AngleConstraint extends Constraint {
    static create(angle: number | number[], indices: number[]): AngleConstraint;
    setAngle(min: number, max?: number): void;
  }

  export class Force {
    static ATTRACTOR: number;
    static REPULSOR: number;
    static ATTRACTOR_REPULSOR: number;
    vector: Float32Array;
    type: number;
    set(x: number, y: number, z: number): void;
    applyForce(ix: number, f0: Float32Array, p0: Float32Array, p1: Float32Array): void;
  }

  export class DirectionalForce extends Force {
    static create(vector: number[]): DirectionalForce;
  }

  export class PointForce extends Force {
    intensity: number;
    static create(
      position: number[],
      opts?: { type?: number; radius?: number; intensity?: number },
    ): PointForce;
    setRadius(r: number): void;
  }

  export class ParticleSystem {
    positions: Float32Array;
    positionsPrev: Float32Array;
    accumulatedForces: Float32Array;
    weights: Float32Array;

    static create(vertices: number[] | Float32Array, iterations?: number): ParticleSystem;

    setPosition(index: number, x: number, y: number, z: number): void;
    addConstraint(constraint: Constraint): void;
    removeConstraint(constraint: Constraint): void;
    addPinConstraint(constraint: PointConstraint): void;
    removePinConstraint(constraint: PointConstraint): void;
    addForce(force: Force): void;
    removeForce(force: Force): void;
    setWeight(index: number, weight: number): void;
    setWeights(weight: number): void;
    tick(dt: number): void;
  }
}
