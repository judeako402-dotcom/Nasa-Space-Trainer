import Phaser from 'phaser';

/**
 * Phaser 3 Live Orbital Vista Engine (Native ES6 JavaScript)
 * Powers the interactive background canvas across the Main Menu and Universal Duelyst screens.
 * Features:
 *  - Multi-layer twinkling starfield & shooting star meteors
 *  - Earth-to-Moon rocket thruster plasma particle emitter & Mach shock rings
 *  - Lunar base antenna comms waves & pressurized dome light glints
 *  - Rotating Duelyst orbital telemetry HUD rings
 *  - Interactive pointer constellation trail & click hex-bursts
 *  - Hyperspace star-streak warp transition when launching a trial
 */

const COMMS_TOWERS = [
  { rx: 0.312, ry: 0.455, color: 0x7ad7ff, period: 2600, phase: 0 },
  { rx: 0.664, ry: 0.432, color: 0x9beeff, period: 2100, phase: 900 },
  { rx: 0.868, ry: 0.405, color: 0xc8baff, period: 2900, phase: 1600 },
];

const DOME_WINDOWS = [
  { rx: 0.395, ry: 0.555, radius: 26, color: 0xffd27d, phase: 0.0 },
  { rx: 0.468, ry: 0.618, radius: 30, color: 0xffc86b, phase: 1.2 },
  { rx: 0.612, ry: 0.535, radius: 34, color: 0xffe09e, phase: 2.4 },
  { rx: 0.745, ry: 0.605, radius: 28, color: 0xffcf78, phase: 3.6 },
  { rx: 0.635, ry: 0.665, radius: 24, color: 0x8ff5c8, phase: 4.8 },
];

export class OrbitalVistaScene extends Phaser.Scene {
  constructor() {
    super({ key: 'orbital-vista' });
    this.stars = [];
    this.meteors = [];
    this.thrusterParticles = [];
    this.machRings = [];
    this.pointerNodes = [];
    this.clickBursts = [];
    this.regolithMotes = [];
    this.reducedMotion = false;
    this.warping = false;
    this.warpProgress = 0;
    this.orbitalAngle = 0;
    this.pointerX = -1000;
    this.pointerY = -1000;
    this.lastNodeSpawn = 0;
    this.lastThrusterSpawn = 0;
    this.lastMeteorSpawn = 0;
  }

  create() {
    this.starGraphics = this.add.graphics().setDepth(1);
    this.hudGraphics = this.add.graphics().setDepth(2);
    this.fxGraphics = this.add.graphics().setDepth(3);
    this.trailGraphics = this.add.graphics().setDepth(4);

    this.rebuildField(this.scale.width, this.scale.height);

    this.scale.on('resize', (gameSize) => {
      if (!gameSize) return;
      this.rebuildField(gameSize.width, gameSize.height);
    });

    this.input.on('pointermove', (pointer) => {
      this.pointerX = pointer.x;
      this.pointerY = pointer.y;
      if (this.reducedMotion) return;
      const now = this.time.now;
      if (now - this.lastNodeSpawn > 36) {
        this.lastNodeSpawn = now;
        this.spawnPointerNode(pointer.x, pointer.y);
      }
    });

    this.input.on('pointerdown', (pointer) => {
      if (this.reducedMotion) return;
      this.spawnClickBurst(pointer.x, pointer.y);
    });
  }

  rebuildField(width, height) {
    const w = Math.max(320, width || window.innerWidth);
    const h = Math.max(240, height || window.innerHeight);

    this.stars = [];
    const starCount = Math.min(140, Math.floor((w * h) / 11000));
    for (let i = 0; i < starCount; i += 1) {
      const inUpperSky = i < starCount * 0.82;
      this.stars.push({
        x: Math.random() * w,
        y: inUpperSky ? Math.random() * (h * 0.46) : Math.random() * h,
        radius: i % 9 === 0 ? 1.9 : i % 4 === 0 ? 1.35 : 0.85,
        baseAlpha: 0.22 + Math.random() * 0.62,
        speed: 0.0015 + Math.random() * 0.0035,
        phase: Math.random() * Math.PI * 2,
        color: i % 7 === 0 ? 0xc8baff : i % 5 === 0 ? 0x9beeff : 0xfff5de,
      });
    }

    this.regolithMotes = [];
    const moteCount = 32;
    for (let i = 0; i < moteCount; i += 1) {
      this.regolithMotes.push({
        x: Math.random() * w,
        y: h * 0.45 + Math.random() * (h * 0.55),
        vx: -8 - Math.random() * 14,
        vy: -2 + Math.random() * 4,
        size: 1 + Math.random() * 1.6,
        alpha: 0.12 + Math.random() * 0.28,
        color: i % 2 === 0 ? 0x9beeff : 0xc8baff,
      });
    }
  }

  setReducedMotion(enabled) {
    this.reducedMotion = Boolean(enabled);
    if (this.reducedMotion) {
      this.meteors = [];
      this.thrusterParticles = [];
      this.machRings = [];
      this.pointerNodes = [];
      this.clickBursts = [];
    }
  }

  triggerWarp() {
    this.warping = true;
    this.warpProgress = 0;
    const w = this.scale.width;
    const h = this.scale.height;
    this.spawnClickBurst(w * 0.54, h * 0.58, true);
  }

  resetWarp() {
    this.warping = false;
    this.warpProgress = 0;
  }

  spawnPointerNode(x, y) {
    this.pointerNodes.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 18,
      vy: (Math.random() - 0.5) * 18,
      life: 1.0,
      decay: 1.35 + Math.random() * 0.45,
      radius: 2.1 + Math.random() * 1.4,
      color: Math.random() > 0.45 ? 0x9beeff : 0xc8baff,
    });
    if (this.pointerNodes.length > 26) {
      this.pointerNodes.shift();
    }
  }

  spawnClickBurst(x, y, large = false) {
    this.clickBursts.push({
      x,
      y,
      radius: large ? 18 : 8,
      maxRadius: large ? 280 : 88,
      life: 1.0,
      color: large ? 0xfff3d8 : 0x9beeff,
    });
    const count = large ? 24 : 10;
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.25;
      const speed = (large ? 90 : 38) + Math.random() * 65;
      this.pointerNodes.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: large ? 0.9 : 1.6,
        radius: large ? 2.8 : 2.0,
        color: i % 2 === 0 ? 0x9beeff : 0xffd27d,
      });
    }
  }

  spawnThrusterPlume(width, height) {
    // Matches the rocket exhaust position in the Lunar Base & Earth-Orbiting Rocket vista
    const nozzleX = width * 0.678;
    const nozzleY = height * 0.242;
    // Exhaust shoots down-left along the orbital curve (-142 deg)
    const baseAngle = Phaser.Math.DegToRad(144);
    for (let i = 0; i < 2; i += 1) {
      const spread = (Math.random() - 0.5) * 0.42;
      const angle = baseAngle + spread;
      const speed = 55 + Math.random() * 75;
      this.thrusterParticles.push({
        x: nozzleX + (Math.random() - 0.5) * 6,
        y: nozzleY + (Math.random() - 0.5) * 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3.2 + Math.random() * 3.8,
        life: 1.0,
        decay: 1.25 + Math.random() * 0.75,
        isCore: Math.random() > 0.45,
      });
    }

    if (Math.random() < 0.26) {
      this.machRings.push({
        x: nozzleX,
        y: nozzleY,
        vx: Math.cos(baseAngle) * 42,
        vy: Math.sin(baseAngle) * 42,
        radius: 4,
        maxRadius: 24,
        life: 1.0,
      });
    }
  }

  spawnMeteor(width, height) {
    const startX = width * (0.15 + Math.random() * 0.75);
    const startY = height * (0.04 + Math.random() * 0.2);
    const angle = Phaser.Math.DegToRad(148 + (Math.random() - 0.5) * 24);
    const speed = 380 + Math.random() * 240;
    this.meteors.push({
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      length: 55 + Math.random() * 45,
      life: 1.0,
      decay: 1.15 + Math.random() * 0.5,
    });
  }

  update(time, delta) {
    const dt = Math.min(0.05, delta / 1000);
    const width = this.scale.width;
    const height = this.scale.height;

    this.starGraphics.clear();
    this.hudGraphics.clear();
    this.fxGraphics.clear();
    this.trailGraphics.clear();

    if (this.warping) {
      this.warpProgress = Math.min(1, this.warpProgress + dt * 1.35);
    }

    // 1. Render Twinkling Starfield & Warp Streaks
    const centerX = width * 0.54;
    const centerY = height * 0.58;
    for (let i = 0; i < this.stars.length; i += 1) {
      const s = this.stars[i];
      const twinkle = this.reducedMotion
        ? s.baseAlpha
        : s.baseAlpha * (0.55 + 0.45 * Math.sin(time * s.speed + s.phase));

      if (this.warping && this.warpProgress > 0.02) {
        const dx = s.x - centerX;
        const dy = s.y - centerY;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const ux = dx / dist;
        const uy = dy / dist;
        const streakLen = 12 + this.warpProgress * 95;
        this.starGraphics.lineStyle(s.radius * 1.2, s.color, Math.min(1, twinkle + 0.3));
        this.starGraphics.beginPath();
        this.starGraphics.moveTo(s.x, s.y);
        this.starGraphics.lineTo(s.x + ux * streakLen, s.y + uy * streakLen);
        this.starGraphics.strokePath();
        s.x += ux * dt * (180 + this.warpProgress * 620);
        s.y += uy * dt * (180 + this.warpProgress * 620);
      } else {
        this.starGraphics.fillStyle(s.color, twinkle);
        this.starGraphics.fillCircle(s.x, s.y, s.radius);
      }
    }

    // 2. Render Rotating Orbital HUD Rings behind the Left Duelyst Stage
    if (!this.reducedMotion) {
      this.orbitalAngle += dt * 0.18;
    }
    const hudX = width * 0.16;
    const hudY = height * 0.52;
    this.hudGraphics.lineStyle(1, 0x9beeff, 0.11);
    this.hudGraphics.strokeCircle(hudX, hudY, 210);
    this.hudGraphics.lineStyle(1.2, 0xc8baff, 0.13);
    this.hudGraphics.strokeCircle(hudX, hudY, 152);

    // Orbital satellite ticks along the outer ring
    for (let i = 0; i < 6; i += 1) {
      const a = this.orbitalAngle + (Math.PI * 2 * i) / 6;
      const tx = hudX + Math.cos(a) * 210;
      const ty = hudY + Math.sin(a) * 210;
      this.hudGraphics.fillStyle(0x9beeff, 0.32);
      this.hudGraphics.fillCircle(tx, ty, 2.4);
    }

    // 3. Render Lunar Base Pressurized Dome Warm Breathing Glints
    for (let i = 0; i < DOME_WINDOWS.length; i += 1) {
      const dome = DOME_WINDOWS[i];
      const pulse = this.reducedMotion ? 0.14 : 0.1 + 0.08 * Math.sin(time * 0.0022 + dome.phase);
      const dx = width * dome.rx;
      const dy = height * dome.ry;
      this.fxGraphics.fillStyle(dome.color, pulse);
      this.fxGraphics.fillCircle(dx, dy, dome.radius);
      this.fxGraphics.fillStyle(0xfff5dc, pulse * 0.65);
      this.fxGraphics.fillCircle(dx, dy, dome.radius * 0.42);
    }

    if (this.reducedMotion) return;

    // 4. Render Antenna Comms Telemetry Waves
    for (let i = 0; i < COMMS_TOWERS.length; i += 1) {
      const tower = COMMS_TOWERS[i];
      const cycle = ((time + tower.phase) % tower.period) / tower.period;
      const tx = width * tower.rx;
      const ty = height * tower.ry;
      const radius = 4 + cycle * 38;
      const alpha = (1 - cycle) * 0.42;
      this.fxGraphics.lineStyle(1.4, tower.color, alpha);
      this.fxGraphics.strokeCircle(tx, ty, radius);
      this.fxGraphics.fillStyle(tower.color, 0.75);
      this.fxGraphics.fillCircle(tx, ty, 2.2);
    }

    // 5. Spawn & Update Rocket Thruster Exhaust Plume
    if (time - this.lastThrusterSpawn > 42) {
      this.lastThrusterSpawn = time;
      this.spawnThrusterPlume(width, height);
    }

    for (let i = this.thrusterParticles.length - 1; i >= 0; i -= 1) {
      const p = this.thrusterParticles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0) {
        this.thrusterParticles.splice(i, 1);
        continue;
      }
      const color = p.isCore
        ? (p.life > 0.6 ? 0xfff5d6 : 0xffb347)
        : (p.life > 0.5 ? 0xff8c3b : 0xc864ff);
      this.fxGraphics.fillStyle(color, p.life * 0.58);
      this.fxGraphics.fillCircle(p.x, p.y, p.size * (0.5 + p.life * 0.6));
    }

    for (let i = this.machRings.length - 1; i >= 0; i -= 1) {
      const ring = this.machRings[i];
      ring.x += ring.vx * dt;
      ring.y += ring.vy * dt;
      ring.life -= dt * 1.4;
      ring.radius = Phaser.Math.Linear(ring.maxRadius, 4, ring.life);
      if (ring.life <= 0) {
        this.machRings.splice(i, 1);
        continue;
      }
      this.fxGraphics.lineStyle(1.3, 0xffcf78, ring.life * 0.42);
      this.fxGraphics.strokeCircle(ring.x, ring.y, ring.radius);
    }

    // 6. Spawn & Update Shooting Star Meteors
    if (time - this.lastMeteorSpawn > 4400) {
      this.lastMeteorSpawn = time;
      if (Math.random() < 0.72) {
        this.spawnMeteor(width, height);
      }
    }

    for (let i = this.meteors.length - 1; i >= 0; i -= 1) {
      const m = this.meteors[i];
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.life -= m.decay * dt;
      if (m.life <= 0) {
        this.meteors.splice(i, 1);
        continue;
      }
      const speed = Math.hypot(m.vx, m.vy) || 1;
      const tailX = m.x - (m.vx / speed) * m.length;
      const tailY = m.y - (m.vy / speed) * m.length;
      this.fxGraphics.lineStyle(2, 0xfff3d8, m.life * 0.75);
      this.fxGraphics.beginPath();
      this.fxGraphics.moveTo(m.x, m.y);
      this.fxGraphics.lineTo(tailX, tailY);
      this.fxGraphics.strokePath();
      this.fxGraphics.fillStyle(0x9beeff, m.life * 0.9);
      this.fxGraphics.fillCircle(m.x, m.y, 2.2);
    }

    // 7. Update Drifting Lunar Regolith Motes
    for (let i = 0; i < this.regolithMotes.length; i += 1) {
      const mote = this.regolithMotes[i];
      mote.x += mote.vx * dt;
      mote.y += mote.vy * dt;
      if (mote.x < -10) mote.x = width + 10;
      if (mote.y < height * 0.4) mote.y = height * 0.95;
      if (mote.y > height + 10) mote.y = height * 0.45;
      this.fxGraphics.fillStyle(mote.color, mote.alpha);
      this.fxGraphics.fillCircle(mote.x, mote.y, mote.size);
    }

    // 8. Interactive Pointer Constellation Trail & Click Hex Bursts
    for (let i = this.pointerNodes.length - 1; i >= 0; i -= 1) {
      const node = this.pointerNodes[i];
      node.x += node.vx * dt;
      node.y += node.vy * dt;
      node.life -= node.decay * dt;
      if (node.life <= 0) {
        this.pointerNodes.splice(i, 1);
        continue;
      }
      this.trailGraphics.fillStyle(node.color, node.life * 0.65);
      this.trailGraphics.fillCircle(node.x, node.y, node.radius * node.life);

      if (i > 0) {
        const prev = this.pointerNodes[i - 1];
        const dist = Math.hypot(node.x - prev.x, node.y - prev.y);
        if (dist < 95) {
          this.trailGraphics.lineStyle(1, 0x9beeff, Math.min(node.life, prev.life) * 0.28);
          this.trailGraphics.beginPath();
          this.trailGraphics.moveTo(node.x, node.y);
          this.trailGraphics.lineTo(prev.x, prev.y);
          this.trailGraphics.strokePath();
        }
      }
    }

    for (let i = this.clickBursts.length - 1; i >= 0; i -= 1) {
      const b = this.clickBursts[i];
      b.life -= dt * 1.85;
      b.radius = Phaser.Math.Linear(b.maxRadius, 8, b.life);
      if (b.life <= 0) {
        this.clickBursts.splice(i, 1);
        continue;
      }
      this.trailGraphics.lineStyle(1.8, b.color, b.life * 0.65);
      this.drawHexagon(this.trailGraphics, b.x, b.y, b.radius);
    }
  }

  drawHexagon(graphics, cx, cy, radius) {
    graphics.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const vx = cx + Math.cos(angle) * radius;
      const vy = cy + Math.sin(angle) * radius;
      if (i === 0) graphics.moveTo(vx, vy);
      else graphics.lineTo(vx, vy);
    }
    graphics.closePath();
    graphics.strokePath();
  }
}

let vistaGameInstance = null;
let vistaHostElement = null;

/**
 * Mounts or re-parents the singleton Phaser 3 Orbital Vista canvas into the active screen's backdrop.
 * @param {HTMLElement | null} hostContainer
 * @param {boolean} [reducedMotion=false]
 */
export function mountVistaPhaser(hostContainer, reducedMotion = false) {
  if (!hostContainer) return null;

  if (!vistaGameInstance) {
    vistaHostElement = document.createElement('div');
    vistaHostElement.className = 'vista-phaser-canvas-wrap';
    vistaHostElement.style.cssText = 'position:absolute;inset:0;z-index:2;pointer-events:none;overflow:hidden;';
    hostContainer.appendChild(vistaHostElement);

    const scene = new OrbitalVistaScene();
    scene.setReducedMotion(reducedMotion);

    vistaGameInstance = new Phaser.Game({
      type: Phaser.AUTO,
      parent: vistaHostElement,
      width: window.innerWidth,
      height: window.innerHeight,
      transparent: true,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      render: {
        antialias: true,
        powerPreference: 'high-performance',
      },
      scene: [scene],
    });
  } else {
    if (vistaHostElement && vistaHostElement.parentElement !== hostContainer) {
      hostContainer.appendChild(vistaHostElement);
    }
    vistaGameInstance.loop.wake();
    const scene = vistaGameInstance.scene.getScene('orbital-vista');
    if (scene) {
      if (vistaGameInstance.scene.isPaused('orbital-vista')) {
        vistaGameInstance.scene.resume('orbital-vista');
      }
      scene.resetWarp();
      scene.setReducedMotion(reducedMotion);
    }
  }
  return vistaGameInstance;
}

/**
 * Pauses the Orbital Vista Phaser loop when the player enters the full-screen walk-around StationScene.
 */
export function sleepVistaPhaser() {
  if (!vistaGameInstance) return;
  if (vistaGameInstance.scene.isActive('orbital-vista') && !vistaGameInstance.scene.isPaused('orbital-vista')) {
    vistaGameInstance.scene.pause('orbital-vista');
  }
  vistaGameInstance.loop.sleep();
}

/**
 * Triggers the Phaser 3 hyperspace star-streak warp when launching from the Main Menu.
 */
export function triggerVistaWarp() {
  if (!vistaGameInstance) return;
  const scene = vistaGameInstance.scene.getScene('orbital-vista');
  if (scene && typeof scene.triggerWarp === 'function') {
    scene.triggerWarp();
  }
}

