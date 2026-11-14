import Phaser from 'phaser';
import { AssetKeys, MapKeys } from '../assets/AssetKeys';
import { DEPTH_FLOOR, DEPTH_OVERHEAD, DEPTH_WALL } from '../constants';
import { SpawnPoint } from '../entities/SpawnPoint';
import type { Room } from './Room';
import {
  FIGMA_CONTACT_SHADOWS,
  FIGMA_DEPTH_SLICES,
  FIGMA_DESIGN_SIZE,
  FIGMA_FLAT_DECALS,
  FIGMA_HYDROPONICS_PLATFORM,
  FIGMA_LAYER_TEXTURES,
  FIGMA_OUTER_VOID_CLEANUP,
  FIGMA_STATUS_LIGHTS,
  FIGMA_TO_WORLD,
  WORLD_MAP_SIZE,
  type FigmaLayerSource,
} from './figmaMapLayers';

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
  spawn: { x: number; y: number };
}

export interface LoadedMap {
  map: Phaser.Tilemaps.Tilemap;
  floorLayer: Phaser.Tilemaps.TilemapLayer;
  wallLayer: Phaser.Tilemaps.TilemapLayer;
  overheadLayer: Phaser.Tilemaps.TilemapLayer;
  artImage: Phaser.GameObjects.Image;
  depthArtwork: (Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle)[];
  spawn: SpawnPoint;
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
 * extracts Room regions, SpawnPoint, and BFS collision data.
 */
export class MapLoader {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly mapKey: string = MapKeys.station,
  ) {}

  load(options?: { artTint?: number }): LoadedMap {
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

    const useFigmaMaster =
      this.scene.textures.exists(AssetKeys.figmaFloorPlan) &&
      this.scene.textures.exists(AssetKeys.figmaObjectsSheet);

    const artImage = this.scene.add
      .image(0, 0, useFigmaMaster ? AssetKeys.figmaFloorPlan : AssetKeys.mapFloorImage)
      .setOrigin(0)
      .setDepth(DEPTH_FLOOR);
    if (useFigmaMaster) {
      artImage.setDisplaySize(WORLD_MAP_SIZE, WORLD_MAP_SIZE);
    }
    if (typeof options?.artTint === 'number') {
      artImage.setTint(options.artTint);
    }
    const depthArtwork = useFigmaMaster
      ? this.createFigmaLayeredWorld(options?.artTint)
      : this.createDepthArtwork(map, options?.artTint);

    floorLayer.setVisible(false);
    wallLayer.setVisible(false);
    overheadLayer.setVisible(false);

    const parsed = this.spawnEntities(map);
    const collisionMask = this.applyCollisionMask(map, wallLayer);
    wallLayer.setCollisionByExclusion([-1]);

    const bounds = {
      x: 0,
      y: 0,
      width: map.widthInPixels,
      height: map.heightInPixels,
    };

    const minimap = this.buildMinimap(parsed.rooms, parsed.spawn, collisionMask);

    return {
      map,
      floorLayer,
      wallLayer,
      overheadLayer,
      artImage,
      depthArtwork,
      spawn: parsed.spawn,
      rooms: parsed.rooms,
      bounds,
      minimap,
    };
  }

  private resolveFigmaTexture(
    source: FigmaLayerSource,
  ): { key: string; tex: Phaser.Textures.Texture; scale: number } | null {
    const textures = this.scene.textures;
    let key: string;
    if (source === 'floor') {
      key = AssetKeys.figmaFloorPlan;
    } else if (source === 'objects') {
      key = AssetKeys.figmaObjectsSheet;
    } else {
      const layerEntry = FIGMA_LAYER_TEXTURES[source];
      if (layerEntry && textures.exists(layerEntry.key)) {
        key = layerEntry.key;
      } else {
        key = source === 'walls' ? AssetKeys.figmaFloorPlan : AssetKeys.figmaObjectsSheet;
      }
    }
    if (!textures.exists(key)) return null;
    const tex = textures.get(key);
    const img = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement | undefined;
    if (!img?.width) return null;
    return { key, tex, scale: img.width / FIGMA_DESIGN_SIZE };
  }

  /** Registers a cropped frame from a Figma layer texture and places its scaled world image. */
  private addFigmaSliceImage(
    slice: { name: string; x: number; y: number; w: number; h: number; source: FigmaLayerSource },
    depth: number,
    tint?: number,
  ): Phaser.GameObjects.Image | null {
    const resolved = this.resolveFigmaTexture(slice.source);
    if (!resolved) return null;
    const frame = `figma-slice-${slice.source}-${slice.x}-${slice.y}-${slice.w}-${slice.h}`;
    if (!resolved.tex.has(frame)) {
      resolved.tex.add(
        frame,
        0,
        Math.round(slice.x * resolved.scale),
        Math.round(slice.y * resolved.scale),
        Math.round(slice.w * resolved.scale),
        Math.round(slice.h * resolved.scale),
      );
    }
    const img = this.scene.add
      .image(slice.x * FIGMA_TO_WORLD, slice.y * FIGMA_TO_WORLD, resolved.key, frame)
      .setOrigin(0)
      .setDisplaySize(slice.w * FIGMA_TO_WORLD, slice.h * FIGMA_TO_WORLD)
      .setDepth(depth)
      .setName(slice.name);
    if (tint !== undefined) img.setTint(tint);
    return img;
  }

  private createFigmaLayeredWorld(tint?: number): (Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle)[] {
    const textures = this.scene.textures;
    const floorTex = textures.get(AssetKeys.figmaFloorPlan);
    const floorImg = floorTex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    if (!floorImg?.width) return [];

    const items: (Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle)[] = [];

    // 01 · Outer void cleanup
    const voidRect = this.scene.add
      .rectangle(
        FIGMA_OUTER_VOID_CLEANUP.x * FIGMA_TO_WORLD,
        FIGMA_OUTER_VOID_CLEANUP.y * FIGMA_TO_WORLD,
        FIGMA_OUTER_VOID_CLEANUP.w * FIGMA_TO_WORLD,
        FIGMA_OUTER_VOID_CLEANUP.h * FIGMA_TO_WORLD,
        0x222222,
        1,
      )
      .setOrigin(0)
      .setDepth(DEPTH_FLOOR + 1);
    items.push(voidRect);

    // 01 · Recessed wall status lights — below actors
    for (const light of FIGMA_STATUS_LIGHTS) {
      const glow = this.scene.add
        .rectangle(
          (light.x - 2) * FIGMA_TO_WORLD,
          (light.y - 2) * FIGMA_TO_WORLD,
          (light.w + 4) * FIGMA_TO_WORLD,
          (light.h + 4) * FIGMA_TO_WORLD,
          0x7de4e9,
          0.18,
        )
        .setOrigin(0)
        .setDepth(DEPTH_FLOOR + 1);
      const bar = this.scene.add
        .rectangle(
          light.x * FIGMA_TO_WORLD,
          light.y * FIGMA_TO_WORLD,
          light.w * FIGMA_TO_WORLD,
          light.h * FIGMA_TO_WORLD,
          0x82dfe4,
          0.6,
        )
        .setOrigin(0)
        .setDepth(DEPTH_FLOOR + 1);
      items.push(glow, bar);
    }

    // 01 · 20 SVG floor contact shadows — below actors
    for (const shadow of FIGMA_CONTACT_SHADOWS) {
      if (!textures.exists(shadow.key)) continue;
      const img = this.scene.add
        .image(shadow.x * FIGMA_TO_WORLD, shadow.y * FIGMA_TO_WORLD, shadow.key)
        .setOrigin(0)
        .setDisplaySize(shadow.w * FIGMA_TO_WORLD, shadow.h * FIGMA_TO_WORLD)
        .setDepth(DEPTH_FLOOR + 1);
      if (tint !== undefined) img.setTint(tint);
      items.push(img);
    }

    // 01 · Flat floor decals — always below actors
    for (const decal of FIGMA_FLAT_DECALS) {
      const img = this.addFigmaSliceImage(decal, DEPTH_FLOOR + 1, tint);
      if (img) items.push(img);
    }

    // 02 · Built-in hydroponics raised platform occluder (foot Y=754)
    const p = FIGMA_HYDROPONICS_PLATFORM;
    const hydroImg = textures.exists(AssetKeys.figmaLayerLiferoomTop)
      ? this.addFigmaSliceImage(p, Math.round(p.footY * FIGMA_TO_WORLD), tint)
      : null;
    if (hydroImg) {
      items.push(hydroImg);
    } else if (textures.exists(AssetKeys.figmaHydroponicsPlatform)) {
      const fallback = this.scene.add
        .image(p.x * FIGMA_TO_WORLD, p.y * FIGMA_TO_WORLD, AssetKeys.figmaHydroponicsPlatform)
        .setOrigin(0)
        .setDisplaySize(p.w * FIGMA_TO_WORLD, p.h * FIGMA_TO_WORLD)
        .setDepth(Math.round(p.footY * FIGMA_TO_WORLD))
        .setName(p.name);
      if (tint !== undefined) fallback.setTint(tint);
      items.push(fallback);
    }

    // 02 · Depth-sorted wall/edge occluders & 3D props sorted by feet Y
    for (const slice of FIGMA_DEPTH_SLICES) {
      const img = this.addFigmaSliceImage(slice, Math.round(slice.footY * FIGMA_TO_WORLD), tint);
      if (img) items.push(img);
    }

    return items;
  }

  private createDepthArtwork(map: Phaser.Tilemaps.Tilemap, tint?: number): Phaser.GameObjects.Image[] {
    const layer = map.getObjectLayer('depth-artwork');
    if (!layer) return [];
    const textures = this.scene.textures;
    const floorTex = textures.get(AssetKeys.mapFloorImage);
    const floorSrc = floorTex.getSourceImage();
    const objTex = textures.get(AssetKeys.mapObjectsImage);
    const objSrc = objTex.getSourceImage();
    if (
      !(floorSrc instanceof HTMLImageElement || floorSrc instanceof HTMLCanvasElement) ||
      !(objSrc instanceof HTMLImageElement || objSrc instanceof HTMLCanvasElement)
    ) {
      return [];
    }
    const images: Phaser.GameObjects.Image[] = [];

    // Preserve any un-sliced flat decals below characters
    const decalKey = 'station-floor-decals';
    if (!textures.exists(decalKey)) {
      const decalCanvas = textures.createCanvas(decalKey, map.widthInPixels, map.heightInPixels);
      if (decalCanvas) {
        const dctx = decalCanvas.getContext();
        dctx.drawImage(objSrc, 0, 0);
        dctx.save();
        dctx.globalCompositeOperation = 'destination-out';
        for (const object of layer.objects as unknown as TiledObject[]) {
          const outline = object.polygon;
          if (object.type !== 'DepthArtwork' || object.name.startsWith('Wall ') || !outline || outline.length < 3) {
            continue;
          }
          dctx.beginPath();
          for (const [index, point] of outline.entries()) {
            if (index === 0) dctx.moveTo(object.x + point.x, object.y + point.y);
            else dctx.lineTo(object.x + point.x, object.y + point.y);
          }
          dctx.closePath();
          dctx.fill();
        }
        dctx.restore();
        decalCanvas.refresh();
      }
    }
    if (textures.exists(decalKey)) {
      const decalImg = this.scene.add.image(0, 0, decalKey).setOrigin(0).setDepth(DEPTH_FLOOR + 1);
      if (tint !== undefined) decalImg.setTint(tint);
      images.push(decalImg);
    }

    for (const object of layer.objects as unknown as TiledObject[]) {
      const outline = object.polygon;
      if (object.type !== 'DepthArtwork' || !outline || outline.length < 3) continue;
      const depth = object.properties?.find(property => property.name === 'depth')?.value;
      if (typeof depth !== 'number') continue;

      const isWall = object.name.startsWith('Wall ');
      const sourceTexKey = isWall ? AssetKeys.mapFloorImage : AssetKeys.mapObjectsImage;
      const sourceTex = isWall ? floorTex : objTex;
      const sourceImg = isWall ? floorSrc : objSrc;

      const width = Math.max(...outline.map(point => point.x));
      const height = Math.max(...outline.map(point => point.y));
      const frame = `station-art-${object.id}`;
      const rectangle = outline.length === 4 && outline.every(({ x, y }) => (x === 0 || x === width) && (y === 0 || y === height));
      let image: Phaser.GameObjects.Image;
      if (rectangle) {
        if (!sourceTex.has(frame)) sourceTex.add(frame, 0, object.x, object.y, width, height);
        image = this.scene.add.image(object.x, object.y, sourceTexKey, frame);
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
          context.drawImage(sourceImg, -object.x, -object.y);
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
    rooms: Room[],
    spawn: SpawnPoint,
    collisionMask: Uint8Array,
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
    for (let i = 0; i < collisionMask.length; i += 1) {
      if (collisionMask[i]) walls[i] = 1;
    }

    return {
      cols,
      rows,
      tileSize: json.tilewidth,
      walls,
      floors,
      rooms,
      spawn: { x: spawn.x, y: spawn.y },
    };
  }

  private spawnEntities(map: Phaser.Tilemaps.Tilemap): {
    spawn: SpawnPoint;
    rooms: Room[];
  } {
    const objectLayer = map.getObjectLayer('objects');
    const rooms: Room[] = [];
    let spawn: SpawnPoint | null = null;

    if (objectLayer) {
      for (const obj of objectLayer.objects as unknown as TiledObject[]) {
        switch (obj.type) {
          case 'SpawnPoint':
            spawn = new SpawnPoint(this.scene, obj.x, obj.y, false);
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

    return { spawn, rooms };
  }

  private applyCollisionMask(
    map: Phaser.Tilemaps.Tilemap,
    wallLayer: Phaser.Tilemaps.TilemapLayer,
  ): Uint8Array {
    const collisionTileIndex = wallLayer
      .getTilesWithin(0, 0, map.width, map.height)
      .find((tile) => tile.index >= 0)?.index;
    if (collisionTileIndex === undefined) {
      throw new Error(`Wall layer in map "${this.mapKey}" has no tile to use for collision`);
    }

    const texture = this.scene.textures.get(AssetKeys.collisionMask);
    const source = texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    if (!source?.width || !source.height) {
      throw new Error(`Collision mask "${AssetKeys.collisionMask}" has no image data`);
    }

    const canvas = document.createElement('canvas');
    canvas.width = map.widthInPixels;
    canvas.height = map.heightInPixels;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('Unable to create a canvas context for the station collision mask');
    }
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const collisionMask = new Uint8Array(map.width * map.height);
    for (let row = 0; row < map.height; row += 1) {
      for (let col = 0; col < map.width; col += 1) {
        let wallSamples = 0;
        let samples = 0;
        for (let y = row * map.tileHeight; y < (row + 1) * map.tileHeight; y += 2) {
          for (let x = col * map.tileWidth; x < (col + 1) * map.tileWidth; x += 2) {
            const pixelIndex = (y * canvas.width + x) * 4;
            if (pixels[pixelIndex] >= 60) wallSamples += 1;
            samples += 1;
          }
        }
        const index = row * map.width + col;
        if (wallSamples / samples < 0.2) continue;

        collisionMask[index] = 1;
        const tile = wallLayer.getTileAt(col, row);
        if (!tile || tile.index < 0) {
          wallLayer.putTileAt(collisionTileIndex, col, row);
        }
      }
    }

    return collisionMask;
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

