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

export const SCIENCE_BRIEFS: Record<DestinationId, ScienceBrief> = {
  moon: {
    gravityEarth: 0.166,
    dayHours: 29.5 * 24,
    atmosphere: 'Near-vacuum exosphere; not breathable',
    mainHazards: ['vacuum', 'radiation', 'sharp clingy regolith', 'extreme lighting and temperature'],
    operationsNote: 'EVA requires a pressure suit, life support, dust control, and a planned return to the airlock.',
    missionExample: 'Apollo lunar field geology informs sample tasks; Artemis is NASA’s campaign for renewed lunar exploration.',
    fact: 'Moon gravity is about one-sixth of Earth gravity. Lunar dust is sharp, clingy, and easily kicked up.',
  },
};

/** Mission gauge values and hazard magnitudes are fictional game balance, not NASA engineering limits. */
export const GAME_MODEL_NOTE = 'Educational cartoon simulation. Planet facts are NASA references; habitat gauges, event odds, and effects are simplified game values, not real mission procedures or safety thresholds.';

export const NASA_REFERENCES = [
  { label: 'NASA Moon Facts', url: 'https://science.nasa.gov/moon/facts/' },
  { label: 'NASA Lunar Regolith Hazards', url: 'https://science.nasa.gov/biological-physical/what-hazards-are-caused-by-lunar-regolith/' },
  { label: 'NASA Crew & Operations Training', url: 'https://www.nasa.gov/reference/jsc-crew-operations-training/' },
  { label: 'NASA Deep Space Habitation Overview', url: 'https://www.nasa.gov/humans-in-space/deep-space-habitation-overview/' },
  { label: 'NASA Artemis Program', url: 'https://www.nasa.gov/humans-in-space/artemis/' },
  { label: 'NASA History of Lunar Exploration', url: 'https://science.nasa.gov/solar-system/moon/history-of-lunar-exploration/' },
  { label: 'NASA ISS Life Support (ECLSS)', url: 'https://www.nasa.gov/reference/environmental-control-and-life-support-systems-eclss/' },
] as const;

export function scienceBrief(destination: DestinationId): ScienceBrief {
  return SCIENCE_BRIEFS[destination];
}
