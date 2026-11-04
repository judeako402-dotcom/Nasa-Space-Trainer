import type { DestinationId } from '../model';
export interface EventCard {
    id: string;
    name: string;
    kind: 'hazard' | 'opportunity' | 'crew' | 'science';
    destinations?: DestinationId[];
    responses?: {
        id: string;
        label: string;
        description: string;
        deltas: EventCard['deltas'];
    }[];
    description: string;
    effect: string;
    deltas: Partial<Record<'power' | 'oxygen' | 'water' | 'starch' | 'hull' | 'morale' | 'research', number>>;
}
export declare const EVENT_CARDS: EventCard[];
