/**
 * Spudnaut: Cooperative Habitat Simulation
 * Movement System - Responsive, realistic 2D space movement
 *
 * Features:
 * - Consistent speed for keyboard and waypoint movement
 * - Specialist speed variations (traveller 18% faster, etc.)
 * - Waypoint-based navigation with smooth interpolation
 * - Wall sliding without physics engine
 * - Frame-rate independent movement
 * - Clean, documented API
 */
/**
 * 2D Vector representation for positions, directions, and velocities.
 */
export interface Vec2 {
    x: number;
    y: number;
}
/**
 * Snapshot of player input each simulation step.
 * axisX: -1 (left) to 1 (right), axisY: -1 (down) to 1 (up)
 * moveRequest: Target waypoint for click-to-move navigation
 */
export interface InputSnapshot {
    axisX: number;
    axisY: number;
    moveRequest: Vec2 | null;
}
/**
 * Complete player state maintained by the simulation layer.
 * All movement logic operates on this state; the renderer reads from it.
 */
export interface PlayerState {
    x: number;
    y: number;
    prevX: number;
    prevY: number;
    facing: 1 | -1;
    moving: boolean;
    route: Vec2[];
    routeIndex: number;
    targetX?: number;
    targetY?: number;
    speedModifier: number;
    specialist?: string;
}
/**
 * Type predicate: returns true if the player can stand at position (x, y).
 * Used by movement to prevent walking through walls/props.
 */
export type WalkTest = (x: number, y: number) => boolean;
/**
 * Create a new PlayerState at the given world position.
 * Initial state: stopped at spawn, facing right, no route.
 *
 * @param x Starting X position
 * @param y Starting Y position
 * @returns Fresh PlayerState ready for the simulation
 */
export declare function createPlayerState(x: number, y: number): PlayerState;
/**
 * Normalize raw axis input so diagonal movement speed matches cardinal speed.
 * W+D moves at same speed as W alone (no sqrt(2) speed boost).
 * Returns zero vector when no input is detected.
 *
 * @param axisX Horizontal input (-1 to 1)
 * @param axisY Vertical input (-1 to 1)
 * @returns Normalized Vec2, or {x:0, y:0} if no significant input
 */
export declare function normalizeInput(axisX: number, axisY: number): Vec2;
/**
 * Consume the current waypoint if the player is close enough.
 * Useful for routefollowing where you want to snap to waypoints gracefully.
 *
 * @param state Player state being updated
 * @param epsilon Distance threshold (pixels) to count as "arrived"
 * @returns true if waypoint was consumed/advanced past
 */
export declare function consumeWaypoint(state: PlayerState, epsilon?: number): boolean;
/**
 * Advance to the next waypoint in the route if applicable.
 * Updates targetX/targetY for smooth following movement.
 *
 * @param state Player state
 * @returns true if waypoint was consumed
 */
export declare function advanceWaypoint(state: PlayerState): boolean;
/**
 * Apply specialist-based speed modifications to player state.
 * Each specialist has a unique speed multiplier that affects all movement.
 *
 * @param state Player state to modify
 * @param specialistId ID of the assigned specialist
 *
 * Known specialists and their speed multipliers:
 * - repairman: 1.0 (baseline)
 * - farmer: 1.0
 * - traveller: 1.18 (18% faster - matches original design)
 * - researcher: 1.0
 * - shield: 1.0
 *
 * This can be expanded with perks that modify other aspects too.
 */
export declare function applySpecialistSpeed(state: PlayerState, specialistId: string): void;
/**
 * Move a player state toward a target at a consistent, frame-rate-independent speed.
 *
 * @param state Player state to update
 * @param targetX Target X position
 * @param targetY Target Y position
 * @param speed Pixels per second at maximum speed
 * @param dt Delta time in seconds (fixed-step: typically 1/60)
 */
export declare function stepTowardTarget(state: PlayerState, targetX: number, targetY: number, speed: number, dt: number): void;
/**
 * The core simulation step for player movement.
 *
 * This function owns all movement logic - NOT Phaser's renderer.
 * It should be called once per simulation tick (typically 1/60 seconds).
 *
 * Movement sequence each step:
 * 1. Store previous position (for animation interpolation)
 * 2. Handle moveRequest (click-to-move or AI waypoints)
 * 3. Normalize input and apply specialist speed modifiers
 * 4. Move directly if keys pressed, OR follow route waypoints
 * 5. Apply collision detection (axis-separated wall sliding)
 * 6. Update facing direction and moving flag
 * 7. Consume reached waypoints
 *
 * @param state Player state - modified in place
 * @param input Current input snapshot (keyboard/gamepad axes)
 * @param dt Delta time in seconds (fixed-step: 1/60 typically)
 * @param baseSpeed Base movement speed in pixels/second (e.g., 250 from balance.ts)
 * @param canStand Test function: can the player stand at (x, y)?
 *
 * Example usage in scene update loop:
 * ```
 * const dt = 1/60; // fixed step
 * stepPlayer(simState, inputSnapshot, dt, MOVEMENT.baseSpeed, canStand);
 * ```
 */
export declare function stepPlayer(state: PlayerState, input: InputSnapshot, dt: number, baseSpeed: number, canStand: WalkTest): void;
/**
 * Axis-separated movement gives wall sliding without a physics engine.
 *
 * Movement order matters: X first, then Y. This means:
 * - If player walks into a wall on X, they stop on X but can still move on Y
 * - If player walks into a corner, they'll slide along the wall
 * - This avoids the need for a full physics engine while feeling reasonable
 *
 * @param state Player state (modified in place)
 * @param dx Movement vector X component
 * @param dy Movement vector Y component
 * @param canStand Test function: can the player stand at (x, y)?
 *
 * Typical canStand implementation (from scene.ts):
 /*============================================================================*
 * Interpolation Utility                                                       *
 *============================================================================*/
/**
 * Linear interpolation between two values.
 * Used for smooth animation frames between simulation steps.
 *
 * @param from Starting value
 * @param to Ending value
 * @param alpha [0,1] Interpolation factor
 * @returns Interpolated value
 *
 * Example: player position lerp between prev and current each render frame
 * ```
 * const renderX = lerp(prevX, current.x, alpha);
 * playerSprite.x = renderX;
 * ```
 */
export declare function lerp(from: number, to: number, alpha: number): number;
/**
 * Set the player's speed modifier based on their assigned specialist.
 * Convenience wrapper that calls applySpecialistSpeed and updates state.
 *
 * @param state Player state
 * @param specialistId Specialist ID string
 */
export declare function setSpeedModifier(state: PlayerState, specialistId: string): void;
/**
 * Calculate the player's effective speed considering all modifiers.
 * Useful for UI display or debugging.
 *
 * @param state Player state
 * @param baseSpeed Base speed from balance/MOVEMENT config
 * @returns Effective pixels-per-second speed
 */
export declare function getEffectiveSpeed(state: PlayerState, baseSpeed: number): number;
/** Clear the player's planned route and reset waypoint index. */
export declare function clearRoute(state: PlayerState): void;
