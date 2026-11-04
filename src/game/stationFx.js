import Phaser from 'phaser';

/**
 * Phaser 3 Station Ambient, Footstep, Beacon & Weather FX System (Native ES6 JavaScript)
 * Integrates directly into StationScene to provide real-time WebGL/Canvas particle
 * and geometric telemetry effects during Training Deck and Surface Habitat shifts.
 */
export class StationFxController {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.footsteps = [];
    this.sparks = [];
    this.shockwaves = [];
    this.weatherMotes = [];
    this.stepTimer = 0;
    this.lastCompletedSet = new Set();
    this.reducedMotion = false;

    this.floorGraphics = scene.add.graphics().setDepth(18);
    this.fxGraphics = scene.add.graphics().setDepth(95);
    this.weatherGraphics = scene.add.graphics().setDepth(180);

    this.initWeatherField();
  }

  initWeatherField() {
    this.weatherMotes = [];
    for (let i = 0; i < 42; i += 1) {
      this.weatherMotes.push({
        ox: Math.random() * 1920,
        oy: Math.random() * 1280,
        vx: -28 - Math.random() * 36,
        vy: 6 + Math.random() * 14,
        size: 1.2 + Math.random() * 2.0,
        alpha: 0.14 + Math.random() * 0.28,
      });
    }
  }

  setReducedMotion(enabled) {
    this.reducedMotion = Boolean(enabled);
    if (this.reducedMotion) {
      this.footsteps = [];
      this.sparks = [];
      this.shockwaves = [];
      this.floorGraphics.clear();
      this.fxGraphics.clear();
      this.weatherGraphics.clear();
    }
  }

  /**
   * Detects newly completed interactions and spawns a Phaser celebration burst at their station coordinates.
   * @param {Array<{id: string, name: string, x: number, y: number, accent?: string}>} interactions
   * @param {string[]} completedIds
   */
  syncCompletedInteractions(interactions, completedIds) {
    const incoming = new Set(completedIds || []);
    if (this.lastCompletedSet.size > 0) {
      for (const id of incoming) {
        if (!this.lastCompletedSet.has(id)) {
          const found = interactions.find((item) => item.id === id);
          if (found) {
            const hex = found.accent ? Number.parseInt(found.accent.replace('#', ''), 16) : 0x7ad7ff;
            this.spawnCompletionBurst(found.x, found.y, `${found.name.toUpperCase()} ✓`, Number.isFinite(hex) ? hex : 0x7ad7ff);
          }
        }
      }
    }
    this.lastCompletedSet = incoming;
  }

  /**
   * Spawns a radial spark burst, shockwave ring, and floating world-space hologram label.
   * @param {number} x
   * @param {number} y
   * @param {string} label
   * @param {number} colorHex
   */
  spawnCompletionBurst(x, y, label, colorHex = 0x7ad7ff) {
    if (this.reducedMotion) return;

    this.shockwaves.push({
      x,
      y,
      radius: 10,
      maxRadius: 96,
      life: 1.0,
      color: colorHex,
    });

    for (let i = 0; i < 24; i += 1) {
      const angle = (Math.PI * 2 * i) / 24 + (Math.random() - 0.5) * 0.22;
      const speed = 45 + Math.random() * 110;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 18,
        size: 2.2 + Math.random() * 2.4,
        life: 1.0,
        decay: 1.15 + Math.random() * 0.55,
        color: i % 3 === 0 ? 0xfff3d8 : i % 2 === 0 ? colorHex : 0x8fe6a8,
      });
    }

    const banner = this.scene.add.text(x, y - 34, label, {
      fontFamily: 'monospace',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#eafff5',
      backgroundColor: 'rgba(12, 24, 38, 0.85)',
      padding: { x: 8, y: 4 },
      stroke: '#06101e',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(190);

    this.scene.tweens.add({
      targets: banner,
      y: y - 78,
      alpha: 0,
      duration: 1350,
      ease: 'Cubic.easeOut',
      onComplete: () => banner.destroy(),
    });
  }

  /**
   * Per-frame update called from StationScene.update()
   * @param {object} params
   */
  update(params) {
    const {
      dt,
      time,
      playerX,
      playerY,
      moving,
      room,
      destination,
      mapId,
      colorHex,
      interactions,
      activeIds,
      completedIds,
    } = params;

    this.floorGraphics.clear();
    this.fxGraphics.clear();
    this.weatherGraphics.clear();

    if (this.reducedMotion) return;

    // 1. Footstep & EVA Regolith Puffs
    if (moving) {
      this.stepTimer += dt;
      if (this.stepTimer >= 0.14) {
        this.stepTimer = 0;
        const isExterior = room === 'exterior';
        const stepColor = isExterior
          ? (destination === 'mars' ? 0xe8946b : 0xc5d8f0)
          : colorHex;
        this.footsteps.push({
          x: playerX + (Math.random() - 0.5) * 12,
          y: playerY + 20 + (Math.random() - 0.5) * 6,
          radius: isExterior ? 5.5 : 3.8,
          maxRadius: isExterior ? 18 : 12,
          life: 1.0,
          decay: isExterior ? 1.15 : 1.55,
          color: stepColor,
        });
      }
    } else {
      this.stepTimer = 0.1;
    }

    for (let i = this.footsteps.length - 1; i >= 0; i -= 1) {
      const f = this.footsteps[i];
      f.life -= f.decay * dt;
      f.radius = Phaser.Math.Linear(f.maxRadius, 3.5, f.life);
      if (f.life <= 0) {
        this.footsteps.splice(i, 1);
        continue;
      }
      this.floorGraphics.lineStyle(1.4, f.color, f.life * 0.36);
      this.floorGraphics.strokeCircle(f.x, f.y, f.radius);
      this.floorGraphics.fillStyle(f.color, f.life * 0.16);
      this.floorGraphics.fillCircle(f.x, f.y, f.radius * 0.55);
    }

    // 2. Active Station Rotating Hex Beacons & Sonar Waves
    if (Array.isArray(interactions) && Array.isArray(activeIds)) {
      const completedSet = new Set(completedIds || []);
      for (let i = 0; i < interactions.length; i += 1) {
        const item = interactions[i];
        if (!activeIds.includes(item.id) || completedSet.has(item.id)) continue;
        const pulse = (time * 0.0012 + i * 0.35) % 1;
        const ringRadius = 22 + pulse * 26;
        const ringAlpha = (1 - pulse) * 0.42;
        this.floorGraphics.lineStyle(1.5, 0x7ad7ff, ringAlpha);
        this.floorGraphics.strokeCircle(item.x, item.y, ringRadius);

        // Rotating hex reticle
        const rot = time * 0.0015 + i;
        this.floorGraphics.lineStyle(1.2, 0xc8baff, 0.34);
        this.floorGraphics.beginPath();
        for (let v = 0; v < 6; v += 1) {
          const a = rot + (Math.PI / 3) * v;
          const vx = item.x + Math.cos(a) * 26;
          const vy = item.y + Math.sin(a) * 26;
          if (v === 0) this.floorGraphics.moveTo(vx, vy);
          else this.floorGraphics.lineTo(vx, vy);
        }
        this.floorGraphics.closePath();
        this.floorGraphics.strokePath();
      }
    }

    // 3. Completion Sparks & Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i -= 1) {
      const sw = this.shockwaves[i];
      sw.life -= dt * 1.65;
      sw.radius = Phaser.Math.Linear(sw.maxRadius, 10, sw.life);
      if (sw.life <= 0) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      this.fxGraphics.lineStyle(2.4, sw.color, sw.life * 0.78);
      this.fxGraphics.strokeCircle(sw.x, sw.y, sw.radius);
    }

    for (let i = this.sparks.length - 1; i >= 0; i -= 1) {
      const sp = this.sparks[i];
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vy += 45 * dt;
      sp.life -= sp.decay * dt;
      if (sp.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      this.fxGraphics.fillStyle(sp.color, sp.life * 0.9);
      this.fxGraphics.fillCircle(sp.x, sp.y, sp.size * sp.life);
    }

    // 4. Surface Habitat Atmospheric Drift (Moon vs. Mars)
    if (mapId === 'surface') {
      const cam = this.scene.cameras.main;
      const isMars = destination === 'mars';
      const weatherColor = isMars ? 0xf29f6b : 0x9beeff;
      const speedScale = isMars ? 1.65 : 0.75;

      for (let i = 0; i < this.weatherMotes.length; i += 1) {
        const m = this.weatherMotes[i];
        m.ox += m.vx * dt * speedScale;
        m.oy += m.vy * dt * speedScale;
        if (m.ox < 0) m.ox += 1920;
        if (m.oy > 1280) m.oy -= 1280;

        const worldX = cam.scrollX + (m.ox % Math.max(400, cam.width));
        const worldY = cam.scrollY + (m.oy % Math.max(300, cam.height));
        this.weatherGraphics.fillStyle(weatherColor, m.alpha * (isMars ? 0.85 : 0.55));
        this.weatherGraphics.fillCircle(worldX, worldY, m.size);
      }
    }
  }

  destroy() {
    this.floorGraphics?.destroy();
    this.fxGraphics?.destroy();
    this.weatherGraphics?.destroy();
  }
}

