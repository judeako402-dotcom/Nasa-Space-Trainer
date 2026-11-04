export const EVENT_CARDS = [
    {
        id: 'oxygen-alarm', name: 'First Scenario: Oxygen Levels Down', kind: 'hazard',
        description: 'The habitat oxygen loop drops below its safe band during the first shift. The training deck taught you where to look.',
        effect: 'Oxygen and morale fall while the crew isolates the scrubber fault. The repair data is logged for Earth.',
        deltas: { oxygen: -9, morale: -2, research: 3 },
    },
    {
        id: 'solar-flare', name: 'Solar Flare Watch', kind: 'hazard',
        description: 'A coronal mass ejection will graze the habitat during the shift.',
        effect: 'Shielding drains while the crew shelters. Research continues through the storm.',
        deltas: { hull: -7, power: -4, research: 4 },
        responses: [
            { id: 'shelter', label: 'SHELTER & SECURE THE ARRAY', description: 'Reduce exposure and lose some generation time.', deltas: { hull: -2, power: -7, morale: -1 } },
            { id: 'continue', label: 'CONTINUE THE SURVEY', description: 'Keep the field study moving, accepting higher exposure.', deltas: { hull: -8, power: -3, research: 5 } },
        ],
    },
    {
        id: 'lunar-dust-intrusion', name: 'Lunar Dust at the Airlock', kind: 'hazard', destinations: ['moon'],
        description: 'A suited crew member returns with clingy regolith around the suit service area.',
        effect: 'Dust-control work protects seals and filters. Lunar dust has sharp grains; it is not weather blown by lunar winds.',
        deltas: { power: -9, hull: -2 },
    },
    {
        id: 'mars-dust-storm', name: 'Mars Dust Storm Watch', kind: 'hazard', destinations: ['mars'],
        description: 'Orbital weather reports rising dust over the outpost region.',
        effect: 'Reduce outdoor work and inspect solar generation. Local storms can grow much larger.',
        deltas: { power: -8, morale: -2 },
        responses: [
            { id: 'shelter', label: 'PAUSE EVA & SECURE PANELS', description: 'Protect the crew and inspect generation from inside.', deltas: { power: -5, morale: -1 } },
            { id: 'continue', label: 'SEND THE ROVER', description: 'Collect weather data while accepting reduced power output.', deltas: { power: -10, research: 4 } },
        ],
    },
    {
        id: 'water-reclaimer', name: 'Reclaimer Fault', kind: 'hazard',
        description: 'The water reclaimer is cycling dirty. Every litre is being counted twice.',
        effect: 'Water reserves drop, but the repair data is valuable.',
        deltas: { water: -10, research: 3 },
    },
    {
        id: 'sprout-anxiety', name: 'Sprouting Anxiety', kind: 'crew',
        description: 'The crew is dreaming of Earth soil and waking up with sprouts.',
        effect: 'Morale falls unless someone spends time in the cafeteria.',
        deltas: { morale: -8 },
    },
    {
        id: 'good-harvest', name: 'Good Harvest', kind: 'opportunity',
        description: 'The hydroponics bay produces a batch better than the projections.',
        effect: 'Starch and morale rise across the habitat.',
        deltas: { starch: 8, morale: 4 },
    },
    {
        id: 'clear-skies', name: 'Clear Skies', kind: 'opportunity',
        description: 'The sky is quiet. The panels run at full rated output.',
        effect: 'Power reserves recover and the crew gets a clean working day.',
        deltas: { power: 7, morale: 2 },
    },
    {
        id: 'sample-cache', name: 'Ancient Sample', kind: 'science',
        description: 'A drill core turns up layered ice and unfamiliar mineral grains.',
        effect: 'Research jumps, but the analysis consumes power and water.',
        deltas: { research: 9, power: -3, water: -3 },
    },
    {
        id: 'commander-visit', name: 'Commander Russet Calls', kind: 'crew',
        description: 'A gruff voice from Earth reminds the crew why the trial matters.',
        effect: 'Morale and research improve after the briefing.',
        deltas: { morale: 5, research: 2 },
    },
];
