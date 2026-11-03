import Phaser from 'phaser';
import type { DestinationId } from '../model';

interface LaunchCallbacks {
  destination: DestinationId;
  onComplete: () => void;
}

class LaunchScene extends Phaser.Scene {
  private readonly destination: DestinationId;
  private readonly onComplete: () => void;
  private earth?: Phaser.GameObjects.Image;
  private target?: Phaser.GameObjects.Image;
  private ship?: Phaser.GameObjects.Image;
  private habitat?: Phaser.GameObjects.Image;
  private caption?: Phaser.GameObjects.Text;
  private subcaption?: Phaser.GameObjects.Text;
  private complete = false;

  constructor({ destination, onComplete }: LaunchCallbacks) {
    super({ key: 'spudnaut-launch' });
    this.destination = destination;
    this.onComplete = onComplete;
  }

  preload(): void {
    this.load.image('mission-earth', '/assets/placeholders/kenney/planets/planet00.png');
    this.load.image('mission-moon', '/assets/placeholders/kenney/planets/planet05.png');
    this.load.image('mission-mars', '/assets/placeholders/kenney/planets/planet08.png');
    this.load.image('mission-ship', '/assets/placeholders/kenney/simple-space/ship_A.png');
    this.load.image('landing-habitat', '/assets/placeholders/kenney/sci-fi-rts/scifiStructure_07.png');
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#030711');
    const stars = this.add.graphics().setDepth(0);
    for (let index = 0; index < 180; index += 1) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, height);
      stars.fillStyle(0xdceaff, Phaser.Math.FloatBetween(0.15, 0.75));
      stars.fillCircle(x, y, index % 14 === 0 ? 1.8 : 0.8);
    }

    const earthSize = Math.min(height * 0.62, width * 0.38);
    this.earth = this.add.image(width * 0.16, height * 0.78, 'mission-earth')
      .setDisplaySize(earthSize, earthSize).setDepth(1);
    const destinationKey = this.destination === 'mars' ? 'mission-mars' : 'mission-moon';
    const targetSize = Math.min(height * 0.48, width * 0.3);
    this.target = this.add.image(width * 0.82, height * 0.36, destinationKey)
      .setDisplaySize(targetSize, targetSize).setDepth(1).setAlpha(0.18);
    this.habitat = this.add.image(width * 0.82, height * 0.79, 'landing-habitat')
      .setDisplaySize(Math.min(width * 0.16, 176), Math.min(height * 0.19, 148)).setDepth(2).setAlpha(0);
    this.ship = this.add.image(width * 0.16, height * 0.68, 'mission-ship')
      .setDisplaySize(70, 70).setDepth(3).setAngle(0);

    const titleSize = Math.max(20, Math.min(34, width * 0.033));
    this.caption = this.add.text(width / 2, height * 0.13, '', {
      color: '#fff2ce', fontFamily: 'Arial, sans-serif', fontSize: `${titleSize}px`,
      fontStyle: 'bold', align: 'center', letterSpacing: 3, stroke: '#09111b', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(5);
    this.subcaption = this.add.text(width / 2, height * 0.13 + 38, '', {
      color: '#d3dfed', fontFamily: 'Arial, sans-serif', fontSize: '14px',
      align: 'center', letterSpacing: 1, stroke: '#09111b', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(5);

    const line = this.add.graphics().setDepth(2);
    line.lineStyle(2, 0xffb85a, 0.55);
    line.lineBetween(width * 0.20, height * 0.71, width * 0.8, height * 0.32);
    line.setAlpha(0);

    this.showCaption('IGNITION · FLIGHT SYSTEMS GREEN', 'Spudnaut transport departing Earth orbit.');
    this.tweens.add({ targets: this.earth, x: -earthSize * 0.45, y: height * 0.96, duration: 6500, ease: 'Sine.easeIn' });
    this.tweens.add({ targets: this.ship, x: width * 0.72, y: height * 0.38, angle: -38, duration: 5200, ease: 'Sine.easeInOut' });
    this.time.delayedCall(1900, () => {
      this.showCaption('TRANSLUNAR COAST', 'Crew systems checked. Habitat approach is on course.');
      this.tweens.add({ targets: [this.target, line], alpha: 1, duration: 1000, ease: 'Sine.easeOut' });
    });
    this.time.delayedCall(4400, () => {
      const name = this.destination === 'mars' ? 'MARS COLONY' : 'LUNAR HABITAT';
      this.showCaption(`APPROACHING ${name}`, 'Descent burn confirmed. Surface team standing by.');
      if (this.target) this.tweens.add({ targets: this.target, scale: this.target.scale * 1.26, duration: 2200, ease: 'Sine.easeIn' });
      if (this.ship) this.tweens.add({ targets: this.ship, alpha: 0.18, duration: 900, ease: 'Sine.easeIn' });
      if (this.habitat) this.tweens.add({ targets: this.habitat, alpha: 1, y: height * 0.73, duration: 1300, delay: 750, ease: 'Back.easeOut' });
    });
    this.time.delayedCall(6700, () => this.showCaption('TOUCHDOWN', 'Day 01 begins. The habitat is yours to protect.'));
    this.time.delayedCall(8300, this.finish);
    this.input.once('pointerdown', this.finish);
    this.input.keyboard?.once('keydown-SPACE', this.finish);
    this.input.keyboard?.once('keydown-ENTER', this.finish);
  }

  private showCaption(title: string, subtitle: string): void {
    this.caption?.setText(title);
    this.subcaption?.setText(subtitle);
  }

  private finish = (): void => {
    if (this.complete) return;
    this.complete = true;
    this.onComplete();
  };
}

export function createLaunchSequence(parent: HTMLElement, callbacks: LaunchCallbacks): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#030711',
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, powerPreference: 'high-performance' },
    scene: [new LaunchScene(callbacks)],
  });
}
