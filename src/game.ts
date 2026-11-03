/* Public game facade. The renderer lives in ./game/scene.ts; the old Arcade
   implementation has been retired so the simulation owns movement. */
export {
  configureStationGame,
  createStationGame,
  navigateStationTo,
  setSceneReducedMotion,
} from './game/scene';
export type { GameEvent, MapId, SceneGameState } from './game/scene';
