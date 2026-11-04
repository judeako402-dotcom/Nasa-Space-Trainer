import Phaser from 'phaser';

/**
 * Phaser 3 Interactive Maintenance Telemetry & Arcade Visualizer (Native ES6 JavaScript)
 * Mounts an embedded Phaser.Game canvas inside every station maintenance task modal,
 * rendering real-time WebGL/Canvas waveforms, radar sweeps, plasma conduits, and bio-scanners.
 */
export class MinigameVisualizerScene extends Phaser.Scene {
  /**
   * @param {string} kind
   * @param {string} title
   */
  constructor(kind, title) {
    super({ key: 'minigame-visualizer' });
    this.kind = kind || 'calibrate';
    this.title = title || 'SYSTEM CONSOLE';
    this.phase = 0;
    this.radarAngle = 0;
    this.scannerX = 0;
    this.scannerDir = 1;
    this.completed = false;
    this.sparks = [];
    this.meteors = [];
    this.conduitPackets = [];
    this.bioCells = [];
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0c1222');

    this.bgGraphics = this.add.graphics().setDepth(0);
    this.mainGraphics = this.add.graphics().setDepth(2);
    this.fxGraphics = this.add.graphics().setDepth(4);

    this.statusText = this.add.text(14, 10, `PHASER TELEMETRY · ${this.kind.toUpperCase()}`, {
      fontFamily: 'Consolas, monospace',
      fontSize: '10px',
      fontStyle: 'bold',
      color: '#9beeff',
    }).setDepth(5);

    this.metricText = this.add.text(width - 14, 10, 'INTERACTIVE ENGINE ONLINE', {
      fontFamily: 'Consolas, monospace',
      fontSize: '10px',
      color: '#c8baff',
    }).setOrigin(1, 0).setDepth(5);

    this.initSimulationNodes(width, height);

    this.input.on('pointerdown', (pointer) => {
      this.spawnSparkBurst(pointer.x, pointer.y, 0x9beeff, 14);
      if (this.kind === 'shield') {
        this.interceptNearestMeteor(pointer.x, pointer.y);
      }
    });
  }

  initSimulationNodes(width, height) {
    this.meteors = [];
    for (let i = 0; i < 5; i += 1) {
      this.meteors.push(this.createMeteor(width, height));
    }

    this.conduitPackets = [];
    for (let i = 0; i < 12; i += 1) {
      this.conduitPackets.push({
        lane: i % 3,
        progress: (i / 12) % 1,
        speed: 0.28 + (i % 3) * 0.12,
        color: i % 3 === 0 ? 0xff7b7b : i % 3 === 1 ? 0x7ad7ff : 0xf4d38b,
      });
    }

    this.bioCells = [];
    for (let i = 0; i < 7; i += 1) {
      this.bioCells.push({
        x: 65 + i * ((width - 130) / 6),
        y: height * 0.56 + Math.sin(i * 1.3) * 16,
        radius: 9 + (i % 3) * 3,
        phase: i * 0.8,
        scanned: 0,
      });
    }
  }

  createMeteor(width, height) {
    const cx = width * 0.5;
    const cy = height * 0.56;
    const angle = Math.random() * Math.PI * 2;
    const dist = 62 + Math.random() * 48;
    return {
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * (dist * 0.52),
      angle,
      dist,
      speed: 14 + Math.random() * 16,
      laserLife: 0,
    };
  }

  interceptNearestMeteor(px, py) {
    let best = null;
    let bestDist = 999;
    for (let i = 0; i < this.meteors.length; i += 1) {
      const m = this.meteors[i];
      const d = Math.hypot(m.x - px, m.y - py);
      if (d < bestDist) {
        bestDist = d;
        best = m;
      }
    }
    if (best) {
      best.laserLife = 1.0;
      this.spawnSparkBurst(best.x, best.y, 0xffd27d, 16);
      best.dist = 75 + Math.random() * 30;
      best.angle = Math.random() * Math.PI * 2;
    }
  }

  spawnSparkBurst(x, y, color = 0x9beeff, count = 12) {
    for (let i = 0; i < count; i += 1) {
      const a = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
      const spd = 28 + Math.random() * 72;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: 1.0,
        decay: 1.5 + Math.random() * 0.7,
        size: 1.8 + Math.random() * 1.8,
        color,
      });
    }
  }

  markComplete() {
    if (this.completed) return;
    this.completed = true;
    const { width, height } = this.scale;
    this.statusText?.setText(`PHASER TELEMETRY · ${this.kind.toUpperCase()} LOCKED ✓`);
    this.statusText?.setColor('#8fe6a8');
    this.metricText?.setText('STABILIZED 100%');
    this.metricText?.setColor('#8fe6a8');
    this.spawnSparkBurst(width * 0.5, height * 0.55, 0x8fe6a8, 28);
  }

  update(time, delta) {
    const dt = Math.min(0.05, delta / 1000);
    const { width, height } = this.scale;
    this.phase += dt * 3.4;

    this.bgGraphics.clear();
    this.mainGraphics.clear();
    this.fxGraphics.clear();

    // Draw subtle sci-fi oscilloscope grid
    this.bgGraphics.lineStyle(1, 0x263354, 0.55);
    for (let x = 0; x < width; x += 32) {
      this.bgGraphics.lineBetween(x, 26, x, height);
    }
    for (let y = 26; y < height; y += 22) {
      this.bgGraphics.lineBetween(0, y, width, y);
    }
    this.bgGraphics.lineStyle(1.5, this.completed ? 0x8fe6a8 : 0x5b4fcf, 0.85);
    this.bgGraphics.strokeRoundedRect(1, 1, width - 2, height - 2, 10);

    switch (this.kind) {
      case 'calibrate':
        this.renderOscilloscope(width, height);
        break;
      case 'wiring':
        this.renderConduits(width, height, dt);
        break;
      case 'shield':
        this.renderShieldRadar(width, height, dt);
        break;
      case 'inspect':
        this.renderBioScanner(width, height, dt, time);
        break;
      default:
        this.renderTelemetrySpectrum(width, height, time);
        break;
    }

    // Update & render interactive sparks
    for (let i = this.sparks.length - 1; i >= 0; i -= 1) {
      const sp = this.sparks[i];
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.life -= sp.decay * dt;
      if (sp.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      this.fxGraphics.fillStyle(sp.color, sp.life * 0.9);
      this.fxGraphics.fillCircle(sp.x, sp.y, sp.size * sp.life);
    }
  }

  renderOscilloscope(width, height) {
    const midY = height * 0.6;
    // Target reference wave
    this.mainGraphics.lineStyle(1.6, 0xc8baff, 0.45);
    this.mainGraphics.beginPath();
    for (let x = 16; x <= width - 16; x += 6) {
      const y = midY + Math.sin(x * 0.035 + this.phase * 0.8) * 22;
      if (x === 16) this.mainGraphics.moveTo(x, y);
      else this.mainGraphics.lineTo(x, y);
    }
    this.mainGraphics.strokePath();

    // Active harmonic wave
    const activeColor = this.completed ? 0x8fe6a8 : 0x7ad7ff;
    this.mainGraphics.lineStyle(2.4, activeColor, 0.95);
    this.mainGraphics.beginPath();
    for (let x = 16; x <= width - 16; x += 5) {
      const mod = this.completed ? 0.8 : 1.15;
      const y = midY + Math.sin(x * 0.035 + this.phase * mod) * 22 + Math.cos(x * 0.09 - this.phase) * (this.completed ? 1.5 : 6);
      if (x === 16) this.mainGraphics.moveTo(x, y);
      else this.mainGraphics.lineTo(x, y);
    }
    this.mainGraphics.strokePath();
  }

  renderConduits(width, height, dt) {
    const lanes = [height * 0.4, height * 0.6, height * 0.8];
    const colors = [0xff7b7b, 0x7ad7ff, 0xf4d38b];
    for (let l = 0; l < lanes.length; l += 1) {
      const y = lanes[l];
      this.mainGraphics.lineStyle(2, colors[l], 0.32);
      this.mainGraphics.lineBetween(28, y, width - 28, y);
      this.mainGraphics.fillStyle(colors[l], 0.85);
      this.mainGraphics.fillCircle(28, y, 5);
      this.mainGraphics.fillCircle(width - 28, y, 5);
    }

    for (let i = 0; i < this.conduitPackets.length; i += 1) {
      const pkt = this.conduitPackets[i];
      pkt.progress = (pkt.progress + pkt.speed * dt) % 1;
      const x = Phaser.Math.Linear(28, width - 28, pkt.progress);
      const y = lanes[pkt.lane];
      this.fxGraphics.fillStyle(this.completed ? 0x8fe6a8 : pkt.color, 0.95);
      this.fxGraphics.fillCircle(x, y, 4.2);
    }
  }

  renderShieldRadar(width, height, dt) {
    const cx = width * 0.5;
    const cy = height * 0.58;
    this.radarAngle = (this.radarAngle + dt * 2.4) % (Math.PI * 2);

    this.mainGraphics.lineStyle(1.4, 0x7ad7ff, 0.35);
    this.mainGraphics.strokeEllipse(cx, cy, 180, 74);
    this.mainGraphics.strokeEllipse(cx, cy, 110, 46);
    this.mainGraphics.fillStyle(0x9beeff, 0.85);
    this.mainGraphics.fillCircle(cx, cy, 4);

    // Sweep line
    const sx = cx + Math.cos(this.radarAngle) * 90;
    const sy = cy + Math.sin(this.radarAngle) * 37;
    this.mainGraphics.lineStyle(2, 0x8fe6a8, 0.78);
    this.mainGraphics.lineBetween(cx, cy, sx, sy);

    for (let i = 0; i < this.meteors.length; i += 1) {
      const m = this.meteors[i];
      m.dist -= m.speed * dt;
      if (m.dist < 16) {
        m.laserLife = 1.0;
        this.spawnSparkBurst(m.x, m.y, 0x8fe6a8, 8);
        m.dist = 82 + Math.random() * 28;
        m.angle = Math.random() * Math.PI * 2;
      }
      m.x = cx + Math.cos(m.angle) * m.dist;
      m.y = cy + Math.sin(m.angle) * (m.dist * 0.42);

      this.fxGraphics.fillStyle(0xffcf78, 0.92);
      this.fxGraphics.fillCircle(m.x, m.y, 3.2);

      if (m.laserLife > 0) {
        m.laserLife -= dt * 3.5;
        this.fxGraphics.lineStyle(1.8, 0x9beeff, Math.max(0, m.laserLife));
        this.fxGraphics.lineBetween(cx, cy, m.x, m.y);
      }
    }
  }

  renderBioScanner(width, height, dt, time) {
    this.scannerX += this.scannerDir * dt * 135;
    if (this.scannerX > width - 36) {
      this.scannerX = width - 36;
      this.scannerDir = -1;
    } else if (this.scannerX < 36) {
      this.scannerX = 36;
      this.scannerDir = 1;
    }

    for (let i = 0; i < this.bioCells.length; i += 1) {
      const cell = this.bioCells[i];
      if (Math.abs(cell.x - this.scannerX) < 18) {
        cell.scanned = 1.0;
      } else {
        cell.scanned = Math.max(0.25, cell.scanned - dt * 0.45);
      }
      const r = cell.radius + Math.sin(time * 0.004 + cell.phase) * 1.5;
      const color = this.completed || cell.scanned > 0.6 ? 0x8fe6a8 : 0xc8baff;
      this.mainGraphics.lineStyle(1.8, color, 0.85);
      this.mainGraphics.strokeCircle(cell.x, cell.y, r);
      this.mainGraphics.fillStyle(color, 0.28);
      this.mainGraphics.fillCircle(cell.x, cell.y, r * 0.55);
    }

    // Laser scan bar
    this.fxGraphics.lineStyle(2.2, 0x9beeff, 0.9);
    this.fxGraphics.lineBetween(this.scannerX, 28, this.scannerX, height - 6);
  }

  renderTelemetrySpectrum(width, height, time) {
    const barCount = 24;
    const startX = 24;
    const availW = width - 48;
    const step = availW / barCount;
    for (let i = 0; i < barCount; i += 1) {
      const ratio = 0.25 + 0.65 * Math.abs(Math.sin(time * 0.003 + i * 0.45));
      const bh = ratio * (height - 42);
      const bx = startX + i * step;
      const by = height - 8 - bh;
      const col = this.completed ? 0x8fe6a8 : i % 2 === 0 ? 0x7ad7ff : 0xc8baff;
      this.mainGraphics.fillStyle(col, 0.72);
      this.mainGraphics.fillRoundedRect(bx, by, Math.max(6, step - 5), bh, 3);
    }
  }
}

/**
 * Mounts an embedded Phaser 3 visualizer scene at the top of the maintenance minigame modal.
 * Returns a cleanup & control handle.
 * @param {HTMLElement} container
 * @param {string} kind
 * @param {string} title
 */
export function mountMinigamePhaserCanvas(container, kind, title) {
  const host = document.createElement('div');
  host.className = 'phaser-minigame-banner';
  host.style.cssText = 'width:100%;height:112px;margin-bottom:12px;border-radius:10px;overflow:hidden;border:1.5px solid rgba(200,186,255,0.45);background:#0c1222;box-shadow:inset 0 2px 10px rgba(0,0,0,0.65);';
  container.prepend(host);

  const scene = new MinigameVisualizerScene(kind, title);
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: host,
    width: Math.max(360, host.clientWidth || 520),
    height: 112,
    backgroundColor: '#0c1222',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [scene],
  });

  const pulseListener = () => {
    const w = game.scale.width || 480;
    scene.spawnSparkBurst(w * (0.25 + Math.random() * 0.5), 62, 0x9beeff, 10);
  };
  container.addEventListener('pointerdown', pulseListener);

  return {
    markComplete() {
      scene.markComplete();
    },
    destroy() {
      container.removeEventListener('pointerdown', pulseListener);
      game.destroy(true);
    },
  };
}

