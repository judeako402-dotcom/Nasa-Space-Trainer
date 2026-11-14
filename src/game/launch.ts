import Phaser from 'phaser';
import { getColor, type PlayerColorId } from '../model';
import { getCharacterSpritePreview } from './assets/characterSprites';

interface LaunchCallbacks {
  playerArt: string;
  colorId: PlayerColorId;
  reducedMotion: boolean;
  onComplete: () => void;
}

class LaunchScene extends Phaser.Scene {
  private readonly onComplete: () => void;
  private earth?: Phaser.GameObjects.Image;
  private target?: Phaser.GameObjects.Image;
  private ship?: Phaser.GameObjects.Image;
  private habitat?: Phaser.GameObjects.Image;
  private caption?: Phaser.GameObjects.Text;
  private subcaption?: Phaser.GameObjects.Text;
  private complete = false;

  constructor(private readonly callbacks: LaunchCallbacks) {
    super({ key: 'spudnaut-launch' });
    this.onComplete = callbacks.onComplete;
  }

  preload(): void {
    const preview = getCharacterSpritePreview(this.callbacks.playerArt, this.callbacks.colorId);
    if (preview) {
      this.load.spritesheet('flight-spud', preview.path, { frameWidth: preview.frameWidth, frameHeight: preview.frameHeight });
    } else {
      this.load.image('flight-spud', this.callbacks.playerArt);
    }
    this.load.image('mission-earth', '/assets/placeholders/kenney/planets/planet00.png');
    this.load.image('mission-moon', '/assets/ui/spudnaut/design/moon.webp');
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
    const targetSize = Math.min(height * 0.48, width * 0.3);
    this.target = this.add.image(width * 0.82, height * 0.36, 'mission-moon')
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

    const portrait = this.add.image(width / 2, height * 0.43, 'flight-spud').setDepth(4);
    const portraitScale = Math.min(190 / portrait.width, height * 0.38 / portrait.height);
    portrait.setScale(portraitScale);
    const suit = Phaser.Display.Color.IntegerToColor(getColor(this.callbacks.colorId).hex);
    const stamp = this.add.text(width / 2, height * 0.64, 'CLEARED FOR MOON', {
      fontFamily: 'Arial, sans-serif', fontSize: '20px', color: '#ffffff',
      backgroundColor: suit.rgba, padding: { x: 12, y: 9 }, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(5);
    this.showCaption('FLIGHT CHECK PASSED', 'Your suit is ready. Great job, Spudnaut!');
    const flightDelay = this.callbacks.reducedMotion ? 600 : 1300;
    if (this.callbacks.reducedMotion) {
      this.time.delayedCall(flightDelay, () => {
        portrait.destroy();
        stamp.destroy();
        this.target?.setAlpha(1);
        this.habitat?.setAlpha(1);
        this.ship?.setPosition(width * 0.82, height * 0.66);
        this.showCaption('TOUCHDOWN', 'Welcome to the Moon!');
      });
      this.time.delayedCall(1700, this.finish);
    } else {
      this.time.delayedCall(flightDelay, () => {
        portrait.destroy();
        stamp.destroy();
        this.startFlight(width, height, earthSize, line);
      });
    }
    this.input.once('pointerdown', this.finish);
    this.input.keyboard?.once('keydown-SPACE', this.finish);
    this.input.keyboard?.once('keydown-ENTER', this.finish);
  }

  private startFlight(width: number, height: number, earthSize: number, line: Phaser.GameObjects.Graphics): void {
    this.showCaption('LIFTOFF!', 'Next stop: the Moon.');
    this.tweens.add({ targets: this.earth, x: -earthSize * 0.45, y: height * 0.96, duration: 5000, ease: 'Sine.easeIn' });
    this.tweens.add({ targets: this.ship, x: width * 0.72, y: height * 0.38, angle: -38, duration: 4200, ease: 'Sine.easeInOut' });
    this.time.delayedCall(1300, () => {
      this.showCaption('ACROSS SPACE', 'There’s the Moon!');
      this.tweens.add({ targets: [this.target, line], alpha: 1, duration: 1000, ease: 'Sine.easeOut' });
    });
    this.time.delayedCall(3000, () => {
      this.showCaption('MOON BASE AHEAD', 'Time to land, Spudnaut!');
      if (this.target) this.tweens.add({ targets: this.target, scale: this.target.scale * 1.26, duration: 2200, ease: 'Sine.easeIn' });
      if (this.ship) this.tweens.add({ targets: this.ship, alpha: 0.18, duration: 900, ease: 'Sine.easeIn' });
      if (this.habitat) this.tweens.add({ targets: this.habitat, alpha: 1, y: height * 0.73, duration: 1300, delay: 750, ease: 'Back.easeOut' });
    });
    this.time.delayedCall(4300, () => this.showCaption('TOUCHDOWN', 'Welcome to the Moon!'));
    this.time.delayedCall(5300, this.finish);
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
