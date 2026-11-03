import Phaser from 'phaser';

interface IntroCallbacks {
  onComplete: () => void;
  reducedMotion?: boolean;
}

class OpeningCinematic extends Phaser.Scene {
  private readonly onComplete: () => void;
  private readonly reducedMotion: boolean;
  private backdrop?: Phaser.GameObjects.Image;
  private starfield?: Phaser.GameObjects.Graphics;
  private shade?: Phaser.GameObjects.Rectangle;
  private caption?: Phaser.GameObjects.Text;
  private subcaption?: Phaser.GameObjects.Text;
  private captionTween?: Phaser.Tweens.Tween;

  constructor(callbacks: IntroCallbacks) {
    super({ key: 'opening-cinematic' });
    this.onComplete = callbacks.onComplete;
    this.reducedMotion = callbacks.reducedMotion ?? false;
  }

  preload(): void {
    this.load.image('opening-art', '/assets/loading.jpg');
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#030511');
    this.backdrop = this.add.image(width / 2, height / 2, 'opening-art').setDepth(0);
    this.fitBackdrop();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitBackdrop, this);

    const stars = this.add.graphics().setDepth(1);
    this.starfield = stars;
    let seed = 1776;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const count = this.reducedMotion ? 32 : 90;
    for (let index = 0; index < count; index += 1) {
      const x = random() * width;
      const y = random() * height;
      const radius = random() > 0.93 ? 1.7 : 0.7;
      stars.fillStyle(0xffffff, 0.22 + random() * 0.55);
      stars.fillCircle(x, y, radius);
    }
    stars.setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.68);

    const shade = this.add.rectangle(width / 2, height / 2, width, height, 0x02030b, 0.26).setDepth(2);
    this.shade = shade;
    shade.setOrigin(0.5);
    const captionY = height * 0.77;
    this.caption = this.add.text(width / 2, captionY, '', {
      color: '#fff4d6', fontFamily: 'Arial, sans-serif', fontSize: `${Math.max(19, Math.min(34, width * 0.03))}px`,
      fontStyle: 'bold', align: 'center', letterSpacing: 3, stroke: '#17101b', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(3).setAlpha(0);
    this.subcaption = this.add.text(width / 2, captionY + 36, '', {
      color: '#d2d9e5', fontFamily: 'Arial, sans-serif', fontSize: `${Math.max(12, Math.min(17, width * 0.016))}px`,
      align: 'center', letterSpacing: 1, stroke: '#10131d', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(3).setAlpha(0);

    if (!this.reducedMotion && this.backdrop) {
      this.tweens.add({ targets: this.backdrop, scale: this.backdrop.scale * 1.13, duration: 8500, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: stars, alpha: 0.28, duration: 1800, yoyo: true, repeat: 3, ease: 'Sine.easeInOut' });
    }

    const beats = [
      { at: 350, title: 'YEAR 3042 · EARTH', line: 'The last harvest has failed.' },
      { at: 2550, title: 'TEN ELITE TUBERS. TWO HOSTILE WORLDS.', line: 'One mission to find a future.' },
      { at: 4900, title: 'THE GREAT STARCH MIGRATION', line: 'Your crew’s story begins now.' },
    ];
    for (const beat of beats) this.time.delayedCall(beat.at, () => this.showBeat(beat.title, beat.line));
    this.time.delayedCall(this.reducedMotion ? 2200 : 7600, this.onComplete);
    this.input.once('pointerdown', this.onComplete);
    this.input.keyboard?.once('keydown-SPACE', this.onComplete);
    this.input.keyboard?.once('keydown-ENTER', this.onComplete);
  }

  private fitBackdrop(): void {
    if (!this.backdrop) return;
    const { width, height } = this.scale;
    const scale = Math.max(width / this.backdrop.width, height / this.backdrop.height) * 1.035;
    this.backdrop.setPosition(width / 2, height / 2).setScale(scale);
    this.shade?.setPosition(width / 2, height / 2).setSize(width, height);
    this.caption?.setPosition(width / 2, height * 0.77);
    this.subcaption?.setPosition(width / 2, height * 0.77 + 36);
    if (this.starfield) {
      let seed = Math.floor(width * 17 + height * 31) || 1776;
      const random = (): number => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
      this.starfield.clear();
      const count = this.reducedMotion ? 32 : 90;
      for (let index = 0; index < count; index += 1) {
        this.starfield.fillStyle(0xffffff, 0.22 + random() * 0.55);
        this.starfield.fillCircle(random() * width, random() * height, random() > 0.93 ? 1.7 : 0.7);
      }
    }
  }

  private showBeat(title: string, line: string): void {
    if (!this.caption || !this.subcaption) return;
    this.captionTween?.stop();
    this.caption.setText(title).setAlpha(0).setY(this.scale.height * 0.77);
    this.subcaption.setText(line).setAlpha(0);
    this.captionTween = this.tweens.add({
      targets: [this.caption, this.subcaption], alpha: 1, duration: this.reducedMotion ? 180 : 520, ease: 'Sine.easeOut',
    });
    this.tweens.add({ targets: [this.caption, this.subcaption], y: '-=14', duration: this.reducedMotion ? 180 : 700, ease: 'Sine.easeOut' });
  }
}

export function createOpeningCinematic(
  parent: HTMLElement,
  callbacks: IntroCallbacks,
): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#030511',
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, powerPreference: 'high-performance' },
    scene: [new OpeningCinematic(callbacks)],
  });
}
