import type { DestinationId, DifficultyId, DonkiReport } from '../model';

export interface EventCard {
  id: string;
  name: string;
  kind: 'hazard' | 'opportunity' | 'crew' | 'science';
  destinations?: DestinationId[];
  responses?: { id: string; label: string; description: string; deltas: EventCard['deltas'] }[];
  description: string;
  effect: string;
  deltas: Partial<Record<'life' | 'power' | 'research' | 'farm', number>>;
  source?: DonkiReport;
  majorEvent?: { difficulty: DifficultyId; severity: 'low' | 'moderate' | 'high'; type: DonkiReport['type'] };
}

export const EVENT_CARDS: EventCard[] = [
  {
    id: 'oxygen-alarm', name: 'First Scenario: Life Loop Drop', kind: 'hazard',
    description: 'Cabin air scrubbers dip below target band during the first shift. The training deck showed you where to patch the loop.',
    effect: 'Life drops while the crew isolates the fault, but the repair telemetry boosts Research.',
    deltas: { life: -9, research: 3 },
  },
  {
    id: 'solar-flare', name: 'Solar Flare Watch', kind: 'hazard',
    description: 'A coronal mass ejection will graze the habitat during the shift.',
    effect: 'Life seals and Power array buses strain during peak radiation while Research records storm particles.',
    deltas: { life: -6, power: -5, research: 4 },
    responses: [
      { id: 'shelter', label: 'SHELTER & SECURE THE ARRAY', description: 'Protect Life systems by throttling station Power output.', deltas: { life: -2, power: -7, research: 1 } },
      { id: 'continue', label: 'CONTINUE THE SURVEY', description: 'Keep instruments powered for higher Research, accepting higher Life strain.', deltas: { life: -8, power: -3, research: 6 } },
    ],
  },
  {
    id: 'lunar-dust-intrusion', name: 'Lunar Dust at the Airlock', kind: 'hazard', destinations: ['moon'],
    description: 'A suited crew member returns with clingy regolith around the suit service area.',
    effect: 'Abrasive regolith strains Power seals and Life filters. Lunar dust is static-charged silica, not windblown dust.',
    deltas: { power: -8, life: -4 },
  },
  {
    id: 'water-reclaimer', name: 'Reclaimer Fault', kind: 'hazard',
    description: 'The Life Support water loop is cycling dirty and stressing the Farm feed.',
    effect: 'Life and Farm output dip slightly, while diagnostics add Research telemetry.',
    deltas: { life: -8, farm: -3, research: 3 },
  },
  {
    id: 'sprout-anxiety', name: 'Growth Tray Stall', kind: 'crew',
    description: 'Cold soil modules slow tuber rooting before morning inspection.',
    effect: 'Farm and Life output dip unless hydroponics receives attention.',
    deltas: { farm: -7, life: -2 },
  },
  {
    id: 'good-harvest', name: 'Good Harvest', kind: 'opportunity',
    description: 'The hydroponics bay produces a clean tuber batch ahead of schedule.',
    effect: 'Farm reserves and crew Life readiness climb across the habitat.',
    deltas: { farm: 8, life: 3 },
  },
  {
    id: 'clear-skies', name: 'Peak Solar Window', kind: 'opportunity',
    description: 'Direct orbital insolation hits every array panel without thermal clipping.',
    effect: 'Power reserves surge and Farm grow lights run at peak efficiency.',
    deltas: { power: 7, farm: 3 },
  },
  {
    id: 'sample-cache', name: 'Ancient Core Sample', kind: 'science',
    description: 'A subsurface drill core turns up layered ice and unfamiliar mineral grains.',
    effect: 'Research jumps, while lab centrifuges draw Power and Life Support coolant.',
    deltas: { research: 9, power: -3, life: -3 },
  },
  {
    id: 'commander-visit', name: 'Commander Russet Briefs', kind: 'crew',
    description: 'A direct Earth relay briefing tightens team coordination for the shift.',
    effect: 'Life and Research climb after reviewing priority checklists.',
    deltas: { life: 4, research: 3 },
  },
];
