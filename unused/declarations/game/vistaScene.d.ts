import type Phaser from 'phaser';

export class OrbitalVistaScene extends Phaser.Scene {
  setReducedMotion(enabled: boolean): void;
  triggerWarp(): void;
  resetWarp(): void;
}

export function mountVistaPhaser(hostContainer: HTMLElement | null, reducedMotion?: boolean): Phaser.Game | null;
export function sleepVistaPhaser(): void;
export function triggerVistaWarp(): void;

