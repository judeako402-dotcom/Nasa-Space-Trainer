import Phaser from 'phaser';
interface IntroCallbacks {
    onComplete: () => void;
    reducedMotion?: boolean;
}
export declare function createOpeningCinematic(parent: HTMLElement, callbacks: IntroCallbacks): Phaser.Game;
export {};
