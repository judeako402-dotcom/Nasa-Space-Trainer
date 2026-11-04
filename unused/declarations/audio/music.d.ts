export declare function configureMusic(next: {
    enabled: boolean;
    volume: number;
}): void;
export declare function startMusic(): void;
export declare function stopMusic(fadeMs?: number): void;
export declare function duckMusic(ducked: boolean): void;
export declare function musicState(): {
    started: boolean;
    enabled: boolean;
};
