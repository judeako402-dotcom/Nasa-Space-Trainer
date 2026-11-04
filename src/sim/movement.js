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
/*============================================================================*
 * Player State Factory                                                        *
 *============================================================================*/
/**
 * Create a new PlayerState at the given world position.
 * Initial state: stopped at spawn, facing right, no route.
 *
 * @param x Starting X position
 * @param y Starting Y position
 * @returns Fresh PlayerState ready for the simulation
 */
export function createPlayerState(x, y) {
    return {
        x,
        y,
        prevX: x,
        prevY: y,
        facing: 1,
        moving: false,
        route: [],
        routeIndex: 0,
        speedModifier: 1.0,
        specialist: 'repairman', // default
    };
}
/*============================================================================*
 * Input Normalization                                                         *
 *============================================================================*/
/**
 * Normalize raw axis input so diagonal movement speed matches cardinal speed.
 * W+D moves at same speed as W alone (no sqrt(2) speed boost).
 * Returns zero vector when no input is detected.
 *
 * @param axisX Horizontal input (-1 to 1)
 * @param axisY Vertical input (-1 to 1)
 * @returns Normalized Vec2, or {x:0, y:0} if no significant input
 */
export function normalizeInput(axisX, axisY) {
    const length = Math.hypot(axisX, axisY);
    if (length <= 0.0001)
        return { x: 0, y: 0 };
    return { x: axisX / length, y: axisY / length };
}
/*============================================================================*
 * Waypoint Navigation                                                         *
 *============================================================================*/
/**
 * Consume the current waypoint if the player is close enough.
 * Useful for routefollowing where you want to snap to waypoints gracefully.
 *
 * @param state Player state being updated
 * @param epsilon Distance threshold (pixels) to count as "arrived"
 * @returns true if waypoint was consumed/advanced past
 */
export function consumeWaypoint(state, epsilon = 0.5) {
    if (state.routeIndex >= state.route.length)
        return false;
    const wx = state.route[state.routeIndex].x;
    const wy = state.route[state.routeIndex].y;
    const dist = Math.hypot(wx - state.x, wy - state.y);
    if (dist <= epsilon) {
        state.routeIndex += 1;
        return true;
    }
    return false;
}
/**
 * Advance to the next waypoint in the route if applicable.
 * Updates targetX/targetY for smooth following movement.
 *
 * @param state Player state
 * @returns true if waypoint was consumed
 */
export function advanceWaypoint(state) {
    if (consumeWaypoint(state)) {
        /* Update smooth targets to current position if at waypoint */
        if (state.routeIndex >= state.route.length) {
            state.targetX = state.x;
            state.targetY = state.y;
        }
        return true;
    }
    return false;
}
/*============================================================================*
 * Specialist Speed Modifiers                                                  *
 *============================================================================*/
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
export function applySpecialistSpeed(state, specialistId) {
    const specialists = {
        repairman: 1.0,
        farmer: 1.0,
        traveller: 1.18,
        researcher: 1.0,
        shield: 1.0,
        // Add new specialists here as the game grows
    };
    if (specialistId in specialists) {
        state.speedModifier = specialists[specialistId];
        state.specialist = specialistId;
    }
    else {
        // Fallback to default if unknown specialist
        state.speedModifier = 1.0;
        state.specialist = 'repairman';
    }
}
/*============================================================================*
 * Core Movement Functions                                                     *
 *============================================================================*/
/**
 * Move a player state toward a target at a consistent, frame-rate-independent speed.
 *
 * @param state Player state to update
 * @param targetX Target X position
 * @param targetY Target Y position
 * @param speed Pixels per second at maximum speed
 * @param dt Delta time in seconds (fixed-step: typically 1/60)
 */
export function stepTowardTarget(state, targetX, targetY, speed, dt) {
    const dx = targetX - state.x;
    const dy = targetY - state.y;
    const distance = Math.hypot(dx, dy);
    /* Already at target - snap and stop */
    if (distance <= 0.01) {
        state.x = targetX;
        state.y = targetY;
        state.targetX = targetX;
        state.targetY = targetY;
        return;
    }
    const step = Math.min(speed * dt, distance);
    state.x += (dx / distance) * step;
    state.y += (dy / distance) * step;
    /* Keep targets updated for future interpolation */
    state.targetX = targetX;
    state.targetY = targetY;
}
/*============================================================================*
 * Fixed-Step Player Movement                                                  *
 *============================================================================*/
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
export function stepPlayer(state, input, dt, baseSpeed, canStand) {
    /*----------------------------------------------------------------*
     * 1. Store previous position for animation interpolation               *
     *----------------------------------------------------------------*/
    state.prevX = state.x;
    state.prevY = state.y;
    /*----------------------------------------------------------------*
     * 2. Handle explicit move request (click-to-move or AI path)         *
     *----------------------------------------------------------------*/
    if (input.moveRequest) {
        /* Set route to the clicked/targeted position */
        state.route = [input.moveRequest];
        state.routeIndex = 0;
        /* Also set smooth interpolation targets */
        state.targetX = input.moveRequest.x;
        state.targetY = input.moveRequest.y;
    }
    /*----------------------------------------------------------------*
     * 3. Normalize input and apply specialist speed modifier              *
     *----------------------------------------------------------------*/
    const manual = normalizeInput(input.axisX, input.axisY);
    /* Effective distance = base speed * specialist modifier * elapsed time */
    const effectiveSpeed = baseSpeed * state.speedModifier * dt;
    let dx = 0;
    let dy = 0;
    /*----------------------------------------------------------------*
     * 4. Movement logic: direct keys vs. waypoint following               *
     *----------------------------------------------------------------*/
    if (manual.x !== 0 || manual.y !== 0) {
        /* ---- DIRECT KEYBOARD/GAMEPAD MOVEMENT ---- */
        /* Clear any existing route when user provides direct input */
        clearRoute(state);
        /* Calculate movement vector */
        dx = manual.x * effectiveSpeed;
        dy = manual.y * effectiveSpeed;
        /* Update smooth interpolation targets for potential future waypoint mode */
        state.targetX = state.x + dx;
        state.targetY = state.y + dy;
    }
    else if (state.routeIndex < state.route.length) {
        /* ---- WAYPOINT FOLLOWING MODE ---- */
        /* Try to consume current waypoint if close enough */
        consumeWaypoint(state);
        /* If waypoints remain, move toward the next one at the same speed as keyboard input */
        if (state.routeIndex < state.route.length) {
            const nextWaypoint = state.route[state.routeIndex];
            const targetX = nextWaypoint.x;
            const targetY = nextWaypoint.y;
            const deltaX = targetX - state.x;
            const deltaY = targetY - state.y;
            const distance = Math.hypot(deltaX, deltaY);
            if (distance > 0) {
                const step = Math.min(effectiveSpeed, distance);
                dx = (deltaX / distance) * step;
                dy = (deltaY / distance) * step;
            }
        }
    }
    /* else: no input and no route -> player stops naturally below */
    /*----------------------------------------------------------------*
     * 5. Apply movement with collision detection (axis-separated)         *
     *----------------------------------------------------------------*/
    if (dx !== 0 || dy !== 0) {
        /* Move X first, then Y: produces wall sliding without physics engine */
        const beforeX = state.x;
        const beforeY = state.y;
        /* X-axis movement with standability check */
        const nextX = state.x + dx;
        if (canStand(nextX, state.y))
            state.x = nextX;
        /* Y-axis movement with standability check (allows sliding) */
        const nextY = state.y + dy;
        if (canStand(state.x, nextY))
            state.y = nextY;
        /* -----------------------------------------------------------*
         * 6. Post-movement state updates                               *
         * -----------------------------------------------------------*/
        const moved = Math.hypot(state.x - beforeX, state.y - beforeY);
        /* Consume waypoints that have been reached */
        while (state.routeIndex < state.route.length) {
            const target = state.route[state.routeIndex];
            if (Math.hypot(target.x - state.x, target.y - state.y) > 1.5)
                break;
            state.routeIndex += 1;
        }
        if (state.routeIndex >= state.route.length) {
            /* Route complete - clear it */
            state.route = [];
            state.routeIndex = 0;
            state.targetX = state.x;
            state.targetY = state.y;
        }
        /* Update facing direction based on movement vector */
        if (state.x - beforeX > 0.001)
            state.facing = 1; // moving right
        else if (state.x - beforeX < -0.001)
            state.facing = -1; // moving left
        /* Moving flag: true if player traversed more than a threshold */
        state.moving = moved > 0.01;
    }
    else {
        /* No movement input this frame */
        state.moving = false;
        /* If player had a route but isn't moving this frame,
           still consume waypoints we've arrived at */
        while (state.routeIndex < state.route.length) {
            const target = state.route[state.routeIndex];
            if (Math.hypot(target.x - state.x, target.y - state.y) > 1.5)
                break;
            state.routeIndex += 1;
        }
        if (state.routeIndex >= state.route.length) {
            state.route = [];
            state.routeIndex = 0;
            state.targetX = state.x;
            state.targetY = state.y;
        }
    }
}
/*============================================================================*
 * Collision / Standability                                                    *
 *============================================================================*/
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
export function lerp(from, to, alpha) {
    return from + (to - from) * alpha;
}
/*============================================================================*
 * Speed Management Helpers                                                    *
 *============================================================================*/
/**
 * Set the player's speed modifier based on their assigned specialist.
 * Convenience wrapper that calls applySpecialistSpeed and updates state.
 *
 * @param state Player state
 * @param specialistId Specialist ID string
 */
export function setSpeedModifier(state, specialistId) {
    applySpecialistSpeed(state, specialistId);
}
/**
 * Calculate the player's effective speed considering all modifiers.
 * Useful for UI display or debugging.
 *
 * @param state Player state
 * @param baseSpeed Base speed from balance/MOVEMENT config
 * @returns Effective pixels-per-second speed
 */
export function getEffectiveSpeed(state, baseSpeed) {
    return baseSpeed * state.speedModifier;
}
/*============================================================================*
 * Route Management                                                            *
 *============================================================================*/
/** Clear the player's planned route and reset waypoint index. */
export function clearRoute(state) {
    state.route = [];
    state.routeIndex = 0;
}
/*============================================================================*
 * Export Summary                                                              *
 *============================================================================*/
/* Public API exports (in order of importance for importers):
 *
 * Interfaces:
 *   - Vec2          {x, y}
 *   - InputSnapshot {axisX, axisY, moveRequest}
 *   - PlayerState   {x, y, prevX, prevY, facing, moving, route, routeIndex, ...}
 *   - WalkTest      (x: number, y: number) => boolean
 *
 * Functions (grouped by responsibility):
 *   Creation:    createPlayerState(x, y)
 *   Input:       normalizeInput(axisX, axisY)
 *   Navigation:  stepTowardTarget(state, tx, ty, speed, dt)
 *               consumeWaypoint(state, epsilon)
 *               advanceWaypoint(state)
 *   Specialists: applySpecialistSpeed(state, id)
 *              setSpeedModifier(state, id)
 *              getEffectiveSpeed(state, baseSpeed)
 *   Movement:    stepPlayer(state, input, dt, baseSpeed, canStand)
 *   Utility:     lerp(from, to, alpha)
 *
 * All functions are pure where possible (no side effects except on state),
 * documented with JSDoc, and type-safe using the defined interfaces.
 */ 
