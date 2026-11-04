import Phaser from 'phaser';
import { type PlayerColorId } from '../model';
export type MapId = 'training' | 'surface';
export interface SceneGameState {
    mapId: MapId;
    destination?: 'moon' | 'mars';
    playerName: string;
    colorId: PlayerColorId;
    playerArt: string;
    x: number;
    y: number;
    speed: number;
    frozen: boolean;
    visionEnabled: boolean;
    activeInteractions: string[];
    completedInteractions: string[];
    objective: string;
}
export type GameEvent = {
    type: 'ready';
} | {
    type: 'move';
    x: number;
    y: number;
    room: string;
} | {
    type: 'prompt';
    interactionId: string | null;
    name: string;
    kind: string;
    room: string;
} | {
    type: 'interact';
    interactionId: string;
    kind: string;
} | {
    type: 'crew';
    crewId: string;
    name: string;
    lines: string[];
} | {
    type: 'debug';
    fps: number;
    x: number;
    y: number;
    room: string;
    waypoints: number;
    vision: boolean;
};
export declare class StationScene extends Phaser.Scene {
    private readonly onEvent;
    private state;
    private map;
    private geometry;
    private sim;
    private playerRoot?;
    private playerBody?;
    private playerLabel?;
    private mapLayer?;
    private markerLayer?;
    private crewLayer?;
    private darkLayer?;
    private visionGraphics?;
    private visionMask?;
    private debugText?;
    private stationFx?;
    private keys;
    private accumulator;
    private lastVisionAt;
    private lastVisionX;
    private lastVisionY;
    private camTargetX;
    private camTargetY;
    private camSnap;
    private promptKey;
    private lastMoveEvent;
    private debugVisible;
    private reducedMotion;
    private ready;
    private pendingState;
    private pendingMap;
    constructor(onEvent: (event: GameEvent) => void, initial: SceneGameState);
    preload(): void;
    create(): void;
    configure(next: SceneGameState, options?: {
        respawn?: boolean;
    }): void;
    setReducedMotion(reduced: boolean): void;
    navigateTo(x: number, y: number): void;
    private applyState;
    update(time: number, deltaMs: number): void;
    private canStand;
    private readInput;
    private handlePointer;
    private updateCamera;
    private updateVision;
    private updateCrew;
    private nearestInteraction;
    private updatePrompt;
    private tryInteract;
    private buildMap;
    private drawStars;
    private drawProp;
    private createMarkers;
    private createCrew;
    private createPlayerIfNeeded;
    private createPlayer;
    private createVision;
    private createOverlay;
    private updateMarkers;
}
export declare function createStationGame(parent: HTMLElement, onEvent: (event: GameEvent) => void): Phaser.Game;
export declare function configureStationGame(game: Phaser.Game, state: SceneGameState, options?: {
    respawn?: boolean;
}): void;
export declare function setSceneReducedMotion(game: Phaser.Game, reduced: boolean): void;
export declare function navigateStationTo(game: Phaser.Game, x: number, y: number): void;
