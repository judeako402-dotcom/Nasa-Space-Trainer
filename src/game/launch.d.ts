import Phaser from 'phaser';
import type { DestinationId } from '../model';
interface LaunchCallbacks {
    destination: DestinationId;
    onComplete: () => void;
}
export declare function createLaunchSequence(parent: HTMLElement, callbacks: LaunchCallbacks): Phaser.Game;
export {};
