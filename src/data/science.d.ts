import type { DestinationId } from '../model';
/** Public NASA reference facts used for educational labels, not mission design values. */
export interface ScienceBrief {
    gravityEarth: number;
    dayHours: number;
    atmosphere: string;
    mainHazards: string[];
    operationsNote: string;
    missionExample: string;
    fact: string;
}
export declare const SCIENCE_BRIEFS: Record<DestinationId, ScienceBrief>;
/** Mission gauge values and hazard magnitudes are fictional game balance, not NASA engineering limits. */
export declare const GAME_MODEL_NOTE = "Educational cartoon simulation. Planet facts are NASA references; habitat gauges, event odds, and effects are simplified game values, not real mission procedures or safety thresholds.";
export declare const NASA_REFERENCES: readonly [{
    readonly label: "NASA Moon Facts";
    readonly url: "https://science.nasa.gov/moon/facts/";
}, {
    readonly label: "NASA Lunar Regolith Hazards";
    readonly url: "https://science.nasa.gov/biological-physical/what-hazards-are-caused-by-lunar-regolith/";
}, {
    readonly label: "NASA Mars Facts";
    readonly url: "https://science.nasa.gov/mars/facts/";
}, {
    readonly label: "NASA Crew & Operations Training";
    readonly url: "https://www.nasa.gov/reference/jsc-crew-operations-training/";
}, {
    readonly label: "NASA Deep Space Habitation Overview";
    readonly url: "https://www.nasa.gov/humans-in-space/deep-space-habitation-overview/";
}, {
    readonly label: "NASA Artemis Program";
    readonly url: "https://www.nasa.gov/humans-in-space/artemis/";
}, {
    readonly label: "NASA History of Lunar Exploration";
    readonly url: "https://science.nasa.gov/solar-system/moon/history-of-lunar-exploration/";
}, {
    readonly label: "NASA Perseverance Rover";
    readonly url: "https://science.nasa.gov/mission/mars-2020-perseverance/";
}, {
    readonly label: "NASA ISS Life Support (ECLSS)";
    readonly url: "https://www.nasa.gov/reference/environmental-control-and-life-support-systems-eclss/";
}];
export declare function scienceBrief(destination: DestinationId): ScienceBrief;
