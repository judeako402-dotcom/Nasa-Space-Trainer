/* Static narrative beats. Each beat carries a cutscene hook so a future cutscene
   layer can replace the still panel without changing the screen flow. */

export interface StoryBeat {
  id: string;
  kicker: string;
  title: string;
  body: string;
  note: string;
  art: string;
  cutscene: string;
}

export const STORY_BEATS: StoryBeat[] = [
  {
    id: 'crisis',
    kicker: 'YEAR 3042 · EARTH',
    title: 'The planet is drowning in potatoes.',
    body: "Earth's soil has given its last harvest. Overfarming has left the planet buried under mountains of potatoes, and the Spudnaut Space Agency has one desperate plan: find a new home before the last field turns to dust.",
    note: 'The Great Starch Migration has begun.',
    art: '/assets/hexabyte-splash.jpg',
    cutscene: 'earth-tuber-crisis',
  },
  {
    id: 'agency',
    kicker: 'SPUDNAUT SPACE AGENCY · ORBITAL HUB',
    title: 'Ten elite tubers. One impossible mission.',
    body: 'A small crew will travel to the Moon or Mars to test whether a potato habitat can survive. Power, life support, farming, and shielding must all hold at once. You are the newest recruit, and every day of the trial counts.',
    note: 'Your work will keep the whole crew alive.',
    art: '/assets/characters.jpg',
    cutscene: 'agency-crew-briefing',
  },
  {
    id: 'training',
    kicker: 'ORBITAL HUB · TRAINING DECK',
    title: 'Report to Commander Russet.',
    body: 'The Training Deck is an Earth simulator and a working ship interior. Walk the deck, inspect all four survival systems, and learn how the crew interacts before you ever leave orbit.',
    note: 'Four systems. One habitat. No solo heroes.',
    art: '/assets/potato-repairman.png',
    cutscene: 'training-deck-arrival',
  },
  {
    id: 'exam',
    kicker: 'EARTH TRAINING FACILITY · CERTIFICATION',
    title: 'Pass the Spud Exam.',
    body: 'Pressure, vacuum, life support, hydroponics, shielding, and crew safety. S.P.U.D.I.E. will grade your answers. A passing score earns a seat on the mission; a failure sends you back to the classroom.',
    note: 'Study the lessons. The vacuum does not grade on a curve.',
    art: '/assets/potato-researcher.png',
    cutscene: 'spud-exam-montage',
  },
  {
    id: 'roles',
    kicker: 'CREW ROLES · TRADEOFFS',
    title: 'Every specialist leaves something behind.',
    body: 'Repairmen keep the air inside. Farmers protect the starch supply. Travellers move faster and scout farther. Researchers turn samples into evidence. Choose the tradeoff you can live with.',
    note: 'Your role changes which assignments reach you first.',
    art: '/assets/characters.jpg',
    cutscene: 'role-tradeoff-table',
  },
  {
    id: 'destination',
    kicker: 'MISSION SELECT · MOON OR MARS',
    title: 'Pick a horizon.',
    body: 'The Moon offers low gravity and brutal dust. Mars offers thin air and long dust seasons. Both are hostile. Both need a crew that works together. Earth is watching the gauges, not the speeches.',
    note: 'Thirty days. One crew. One report home.',
    art: '/assets/potato-traveller.png',
    cutscene: 'destination-reveal',
  },
];
