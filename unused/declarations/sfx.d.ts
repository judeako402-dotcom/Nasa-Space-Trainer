export declare function configureSfx(next: {
    enabled: boolean;
    volume: number;
}): void;
export declare const sfx: {
    click(): void;
    correct(): void;
    wrong(): void;
    complete(): void;
    launch(): void;
    win(): void;
    lose(): void;
};
