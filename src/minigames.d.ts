import type { TaskKind } from './model';
type Complete = () => void;
type Cleanups = (() => void)[];
export declare function renderTaskGame(kind: TaskKind, host: HTMLElement, complete: Complete, cleanups: Cleanups, taskName?: string): void;
export {};
