export type PropKind =
  | 'console'
  | 'table'
  | 'crate'
  | 'pipe'
  | 'vent'
  | 'bunk'
  | 'tank'
  | 'planter'
  | 'reactor'
  | 'window'
  | 'rock'
  | 'solar-panel'
  | 'antenna'
  | 'airlock';

export interface PropDef {
  id: string;
  kind: PropKind;
  x: number;
  y: number;
  w: number;
  h: number;
  solid: boolean;
  tint?: number;
}

export interface MapRoom {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tint: number;
  accent: string;
  icon: string;
}

export interface MapCorridor {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type InteractionKind = 'system' | 'task' | 'npc' | 'terminal' | 'exit';

export interface InteractionDef {
  id: string;
  name: string;
  kind: InteractionKind;
  x: number;
  y: number;
  roomId: string;
  icon: string;
  system?: 'power' | 'life' | 'farming' | 'shielding';
  taskKind?: string;
  dialogue?: string[];
  accent?: string;
}

export interface CrewDef {
  id: string;
  name: string;
  role: string;
  art: string;
  x: number;
  y: number;
  facing: 1 | -1;
  accent: string;
  lines: string[];
}

export interface MapDefinition {
  id: 'training' | 'surface';
  title: string;
  subtitle: string;
  width: number;
  height: number;
  spawn: { x: number; y: number };
  rooms: MapRoom[];
  corridors: MapCorridor[];
  props: PropDef[];
  interactions: InteractionDef[];
  crew: CrewDef[];
  palette: {
    void: number;
    floor: number;
    floorAlt: number;
    wall: number;
    line: number;
    glow: number;
  };
}
