import Phaser from 'phaser';
import { AssetKeys, MapKeys } from '../assets/AssetKeys';
import { DEPTH_FLOOR, DEPTH_OVERHEAD, DEPTH_WALL } from '../constants';
import { SpawnPoint } from '../entities/SpawnPoint';
import { Vent } from '../entities/Vent';
import type { Room } from './Room';

/** Lightweight tile grid backing Tiled BFS pathfinding and minimap layout. */
export interface MinimapModel {
  cols: number;
  rows: number;
  tileSize: number;
  /** cols * rows, 1 = solid wall tile. */
  walls: Uint8Array;
  /** cols * rows, 1 = walkable floor tile. */
  floors: Uint8Array;
  rooms: Room[];
  vents: { id: string; x: number; y: number }[];
  spawn: { x: number; y: number };
}

export interface LoadedMap {
  map: Phaser.Tilemaps.Tilemap;
  floorLayer: Phaser.Tilemaps.TilemapLayer;
  wallLayer: Phaser.Tilemaps.TilemapLayer;
  overheadLayer: Phaser.Tilemaps.TilemapLayer;
  artImage: Phaser.GameObjects.Image;
  depthArtwork: Phaser.GameObjects.Image[];
  spawn: SpawnPoint;
  vents: Vent[];
  rooms: Room[];
  bounds: { x: number; y: number; width: number; height: number };
  minimap: MinimapModel;
}

interface TiledObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  point?: boolean;
  polygon?: { x: number; y: number }[];
  properties?: { name: string; type: string; value: string | number | boolean }[];
}

interface TiledMapJson {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: {
    name: string;
    type: string;
    data?: number[];
  }[];
}

/**
 * Loads spudnaut-station.tmj in Phaser 3.90, renders the illustrated station
 * artwork on DEPTH_FLOOR, configures invisible Arcade Physics wall tiles, and
 * extracts Room regions, SpawnPoint, Vents, and BFS collision data.
 */
export class MapLoader {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly mapKey: string = MapKeys.station,
  ) {}

  load(options?: {
    onVentTrigger?: (ventId: string, position: { x: number; y: number }) => void;
    artTint?: number;
  }): LoadedMap {
    const map = this.scene.make.tilemap({ key: this.mapKey });
    const tileset = map.addTilesetImage(AssetKeys.tileset, AssetKeys.tileset);
    if (!tileset) {
      throw new Error(`Tileset "${AssetKeys.tileset}" not found in map "${this.mapKey}"`);
    }

    const floorLayer = this.asLayer(map.createLayer('floor', tileset, 0, 0), 'floor');
    const wallLayer = this.asLayer(map.createLayer('walls', tileset, 0, 0), 'walls');
    const overheadLayer = this.asLayer(map.createLayer('overhead', tileset, 0, 0), 'overhead');

    floorLayer.setDepth(DEPTH_FLOOR);
    wallLayer.setDepth(DEPTH_WALL);
    overheadLayer.setDepth(DEPTH_OVERHEAD);

    const artImage = this.scene.add
      .image(0, 0, AssetKeys.mapImage)
      .setOrigin(0)
      .setDepth(DEPTH_FLOOR);
    if (typeof options?.artTint === 'number') {
      artImage.setTint(options.artTint);
    }
    const depthArtwork = this.createDepthArtwork(map, options?.artTint);

    floorLayer.setVisible(false);
    wallLayer.setVisible(false);
    overheadLayer.setVisible(false);

    wallLayer.setCollisionByExclusion([-1]);

    const parsed = this.spawnEntities(map, options?.onVentTrigger);

    const bounds = {
      x: 0,
      y: 0,
      width: map.widthInPixels,
      height: map.heightInPixels,
    };

    const minimap = this.buildMinimap(parsed.vents, parsed.rooms, parsed.spawn);

    return {
      map,
      floorLayer,
      wallLayer,
      overheadLayer,
      artImage,
      depthArtwork,
      spawn: parsed.spawn,
      vents: parsed.vents,
      rooms: parsed.rooms,
      bounds,
      minimap,
    };
  }

  private createDepthArtwork(map: Phaser.Tilemaps.Tilemap, tint?: number): Phaser.GameObjects.Image[] {
    const layer = map.getObjectLayer('depth-artwork');
    if (!layer) return [];
    const textures = this.scene.textures;
    const art = textures.get(AssetKeys.mapImage);
    const source = art.getSourceImage();
    if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) return [];
    const images: Phaser.GameObjects.Image[] = [];

    for (const object of layer.objects as unknown as TiledObject[]) {
      const outline = object.polygon;
      if (object.type !== 'DepthArtwork' || !outline || outline.length < 3) continue;
      const depth = object.properties?.find(property => property.name === 'depth')?.value;
      if (typeof depth !== 'number') continue;

      const width = Math.max(...outline.map(point => point.x));
      const height = Math.max(...outline.map(point => point.y));
      const frame = `station-art-${object.id}`;
      const rectangle = outline.length === 4 && outline.every(({ x, y }) => (x === 0 || x === width) && (y === 0 || y === height));
      let image: Phaser.GameObjects.Image;
      if (rectangle) {
        if (!art.has(frame)) art.add(frame, 0, object.x, object.y, width, height);
        image = this.scene.add.image(object.x, object.y, AssetKeys.mapImage, frame);
      } else {
        if (!textures.exists(frame)) {
          const texture = textures.createCanvas(frame, width, height);
          if (!texture) continue;
          const context = texture.getContext();
          context.save();
          context.beginPath();
          for (const [index, point] of outline.entries()) {
            if (index === 0) context.moveTo(point.x, point.y);
            else context.lineTo(point.x, point.y);
          }
          context.closePath();
          context.clip();
          context.drawImage(source, -object.x, -object.y);
          context.restore();
          texture.refresh();
        }
        image = this.scene.add.image(object.x, object.y, frame);
      }
      image.setOrigin(0).setDepth(depth).setName(object.name);
      if (tint !== undefined) image.setTint(tint);
      images.push(image);
    }
    return images;
  }

  private buildMinimap(
    vents: Vent[],
    rooms: Room[],
    spawn: SpawnPoint,
  ): MinimapModel {
    const cached = this.scene.cache.tilemap.get(this.mapKey) as unknown as
      | { data: TiledMapJson }
      | undefined;
    const json = cached?.data;
    if (!json) {
      throw new Error(`Tiled map JSON "${this.mapKey}" not found in cache`);
    }

    const cols = json.width;
    const rows = json.height;
    const walls = new Uint8Array(cols * rows);
    const floors = new Uint8Array(cols * rows);

    for (const layer of json.layers) {
      if (layer.type !== 'tilelayer' || !layer.data) continue;
      for (let i = 0; i < layer.data.length && i < walls.length; i++) {
        if (layer.data[i] === 0) continue;
        if (layer.name === 'walls') walls[i] = 1;
        if (layer.name === 'floor') floors[i] = 1;
      }
    }

    return {
      cols,
      rows,
      tileSize: json.tilewidth,
      walls,
      floors,
      rooms,
      vents: vents.map((v) => ({ id: v.id, x: v.position.x, y: v.position.y })),
      spawn: { x: spawn.x, y: spawn.y },
    };
  }

  private spawnEntities(
    map: Phaser.Tilemaps.Tilemap,
    onVentTrigger?: (ventId: string, position: { x: number; y: number }) => void,
  ): {
    spawn: SpawnPoint;
    vents: Vent[];
    rooms: Room[];
  } {
    const objectLayer = map.getObjectLayer('objects');
    const vents: Vent[] = [];
    const rooms: Room[] = [];
    let spawn: SpawnPoint | null = null;

    if (objectLayer) {
      for (const obj of objectLayer.objects as unknown as TiledObject[]) {
        switch (obj.type) {
          case 'SpawnPoint':
            spawn = new SpawnPoint(this.scene, obj.x, obj.y, false);
            break;
          case 'Vent':
            vents.push(
              new Vent(
                this.scene,
                obj.name || `vent-${obj.id}`,
                obj.x,
                obj.y,
                obj.width,
                obj.height,
                onVentTrigger,
              ),
            );
            break;
          case 'Room':
            rooms.push({
              name: this.prop(obj, 'name') ?? obj.name ?? 'Room',
              bounds: { x: obj.x, y: obj.y, width: obj.width, height: obj.height },
            });
            break;
          default:
            break;
        }
      }
    }

    if (!spawn) {
      spawn = new SpawnPoint(this.scene, map.widthInPixels / 2, map.heightInPixels / 2, false);
    }

    return { spawn, vents, rooms };
  }

  private asLayer(
    layer: Phaser.Tilemaps.TilemapLayer | null,
    name: string,
  ): Phaser.Tilemaps.TilemapLayer {
    if (!layer) {
      throw new Error(`Expected tilemap layer "${name}" in map "${this.mapKey}"`);
    }
    return layer;
  }

  private prop(obj: TiledObject, name: string): string | undefined {
    return obj.properties?.find((p) => p.name === name)?.value as string | undefined;
  }
}

