/**
 * Station gameplay constants.
 *
 * Walk speed = 4.5 world units/s (64px per tile = 288 px/s).
 * Ghost speed = 3.0 world units/s (192 px/s).
 */

/** World units to pixels conversion. One tile is 64px = 1 unit. */
export const PIXELS_PER_UNIT = 64;

/** Walk speed in world units per second. */
export const WALK_SPEED_UNITS = 4.5;

/** Ghost speed in world units per second. */
export const GHOST_SPEED_UNITS = 3.0;

/** Walk speed in px/s. */
export const WALK_SPEED = WALK_SPEED_UNITS * PIXELS_PER_UNIT; // 288

/** Ghost speed in px/s. */
export const GHOST_SPEED = GHOST_SPEED_UNITS * PIXELS_PER_UNIT; // 192

/** Global speed multiplier baseline. */
export const GAME_SPEED_MULTIPLIER = 1.0;

/** FollowerCamera exponential follow smoothing rate. */
export const CAMERA_FOLLOW_SPEED = 8;

/** FollowerCamera maximum lerp step per frame. */
export const CAMERA_MAX_STEP = 0.9;

/** Default interaction proximity radius in pixels. */
export const INTERACTION_RADIUS = 96;

/** Depth of the floor artwork / tile layer. */
export const DEPTH_FLOOR = 0;

/** Depth of the wall collision layer. */
export const DEPTH_WALL = 1000;

/** Depth of the overhead layer (always renders above sprites). */
export const DEPTH_OVERHEAD = 100000;

/** Fixed physics step frequency in Hz. */
export const PHYSICS_HZ = 60;

/** Free-camera pan speed in px/s (Shift + movement keys). */
export const DEBUG_PAN_SPEED = 700;

/** Duration of smooth pan-to-center animation in ms. */
export const DEMO_PAN_DURATION = 1000;

