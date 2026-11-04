import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const publicDir = join(root, 'public');
const assets = join(root, 'unused/ui-packs');

const copies = [];

function copy(from, to) {
  const source = join(root, from);
  if (!existsSync(source)) {
    console.warn(`missing: ${from}`);
    return;
  }
  const target = join(publicDir, to);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  copies.push(to);
}

/* Kenney sci-fi UI: HUD, task frames and meters. CC0. */
const kenney = 'unused/ui-packs/kenney_ui-pack-scifi/PNG';
const kenneyFiles = [
  'bar_round_gloss_large.png',
  'bar_round_gloss_large_l.png',
  'bar_round_gloss_large_m.png',
  'bar_round_gloss_large_r.png',
  'bar_round_small.png',
  'bar_round_small_l.png',
  'bar_round_small_m.png',
  'bar_round_small_r.png',
  'bar_square_large.png',
  'bar_square_large_l.png',
  'bar_square_large_m.png',
  'bar_square_large_r.png',
  'bar_square_gloss_large.png',
  'bar_square_gloss_large_l.png',
  'bar_square_gloss_large_m.png',
  'bar_square_gloss_large_r.png',
  'button_square_header_large_rectangle.png',
  'button_square_header_large_rectangle_screws.png',
  'button_square_header_small_rectangle.png',
  'button_square_header_small_rectangle_screws.png',
  'button_square_header_notch_rectangle.png',
  'button_square_header_notch_rectangle_screws.png',
  'crosshair_color_a.png',
  'crosshair_color_b.png',
  'crosshair_color_c.png',
];
for (const tint of ['Blue', 'Yellow', 'Green', 'Red']) {
  for (const file of kenneyFiles) {
    copy(`${kenney}/${tint}/Default/${file}`, `assets/ui/kenney/${tint.toLowerCase()}/${file}`);
  }
}
copy('unused/ui-packs/kenney_ui-pack-scifi/Font/Kenney Future.ttf', 'assets/fonts/Kenney Future.ttf');
copy('unused/ui-packs/kenney_ui-pack-scifi/Font/Kenney Future Narrow.ttf', 'assets/fonts/Kenney Future Narrow.ttf');
copy('unused/ui-packs/kenney_ui-pack-scifi/License.txt', 'assets/ui/kenney/LICENSE.txt');

const extra = 'unused/ui-packs/kenney_ui-pack-scifi/PNG/Extra/Default';
for (const file of [
  'panel_rectangle.png',
  'panel_rectangle_screws.png',
  'panel_square.png',
  'panel_glass.png',
  'panel_glass_screws.png',
  'button_rectangle.png',
  'button_rectangle_depth.png',
  'button_square.png',
  'button_square_depth.png',
  'crosshair_a.png',
  'cursor_a.png',
]) {
  copy(`${extra}/${file}`, `assets/ui/kenney/${file}`);
}

/* Wenrexa Free Hologram: start-screen options and credits. */
const holo = 'unused/ui-packs/1. Free Hologram Interface Wenrexa/1. Free Hologram Interface Wenrexa';
copy(`${holo}/Button 1/Button Normal.png`, 'assets/ui/hologram/button-normal.png');
copy(`${holo}/Button 1/Button Hover.png`, 'assets/ui/hologram/button-hover.png');
copy(`${holo}/Button 1/Button Active.png`, 'assets/ui/hologram/button-active.png');
copy(`${holo}/Button 1/Button Disable.png`, 'assets/ui/hologram/button-disabled.png');
copy(`${holo}/Card X1/Panel Empty.png`, 'assets/ui/hologram/panel-small.png');
copy(`${holo}/Card X1/Panel Empty Green.png`, 'assets/ui/hologram/panel-green.png');
copy(`${holo}/Card X1/Panel Red.png`, 'assets/ui/hologram/panel-red.png');
copy(`${holo}/Card X1/Card X1.png`, 'assets/ui/hologram/card-tall.png');
copy(`${holo}/Card X2/Card X2.png`, 'assets/ui/hologram/card-wide.png');
copy(`${holo}/Card X2/Card X3.png`, 'assets/ui/hologram/card-wide-alt.png');
copy(`${holo}/Card X3/Card X5.png`, 'assets/ui/hologram/card-long.png');
copy(`${holo}/Card X3/Card X6.png`, 'assets/ui/hologram/card-long-alt.png');
for (let i = 1; i <= 35; i += 1) {
  const name = String(i).padStart(2, '0');
  copy(`${holo}/Icons/${name}.png`, `assets/ui/hologram/icons/${name}.png`);
}

/* Wenrexa More UI: cards, buttons, bars, sliders, checkboxes. */
const more = 'unused/ui-packs/2. More UI Hologram Interface Wenrexa';
copy(`${more}/Button 2/Button Normal.png`, 'assets/ui/hologram2/button-normal.png');
copy(`${more}/Button 2/Button Hover.png`, 'assets/ui/hologram2/button-hover.png');
copy(`${more}/Button 2/Button Active.png`, 'assets/ui/hologram2/button-active.png');
copy(`${more}/Button 2/Button Disabled.png`, 'assets/ui/hologram2/button-disabled.png');
copy(`${more}/Button 3/Normal.png`, 'assets/ui/hologram2/ghost-normal.png');
copy(`${more}/Button 3/Hover.png`, 'assets/ui/hologram2/ghost-hover.png');
copy(`${more}/Button 3/Active.png`, 'assets/ui/hologram2/ghost-active.png');
copy(`${more}/Button 4/Button Normal 1.png`, 'assets/ui/hologram2/tab-normal.png');
copy(`${more}/Button 4/Button Hover 1.png`, 'assets/ui/hologram2/tab-hover.png');
copy(`${more}/Button 4/Button Active 1.png`, 'assets/ui/hologram2/tab-active.png');
copy(`${more}/Button Icon/Icon Button.png`, 'assets/ui/hologram2/icon-button.png');
copy(`${more}/Button Icon/Icon Button Hover.png`, 'assets/ui/hologram2/icon-button-hover.png');
copy(`${more}/Button Icon/Icon Button Close.png`, 'assets/ui/hologram2/icon-close.png');
copy(`${more}/Card X8/Panel.png`, 'assets/ui/hologram2/panel-row.png');
copy(`${more}/Card X8/Card X100.png`, 'assets/ui/hologram2/card-100.png');
copy(`${more}/Card X8/Card X101.png`, 'assets/ui/hologram2/card-101.png');
copy(`${more}/Card X8/Card X102.png`, 'assets/ui/hologram2/card-102.png');
copy(`${more}/ProgressBar/ProgressBar Background.png`, 'assets/ui/hologram2/bar-background.png');
copy(`${more}/ProgressBar/ProgressBarForeground.png`, 'assets/ui/hologram2/bar-foreground.png');
copy(`${more}/SliderBar 1/Slider 1.png`, 'assets/ui/hologram2/slider.png');
copy(`${more}/SliderBar 1/Bar 1.png`, 'assets/ui/hologram2/slider-bar.png');
for (const [file, target] of [
  ['CheckBox True.png', 'checkbox-true.png'],
  ['CheckBox False.png', 'checkbox-false.png'],
  ['CheckBox Disabled.png', 'checkbox-disabled.png'],
]) {
  copy(`${more}/CheckBox/${file}`, `assets/ui/hologram2/${target}`);
}

/* Wenrexa RPG & Military icons: task and system glyphs at 128px. */
const iconRoot = 'unused/ui-packs/4. Icons RPG & Military +102 Wenrexa/New Assets Icons & RPG & Military +102/RPG Icons & Tools & KIT[+58-2030]/PNG/128x128px/Blue';
const iconFiles = [
  'Wenrexa Hammer.png',
  'Wenrexa Lightning.png',
  'Wenrexa Water.png',
  'Wenrexa Helmet.png',
  'Wenrexa Notepad.png',
  'Wenrexa Cargo Bag.png',
  'Wenrexa Fire 1.png',
  'Wenrexa Arrow.png',
  'Wenrexa Shield.png',
  'Wenrexa Resources.png',
  'Wenrexa Sickle.png',
  'Wenrexa Plough.png',
];
for (const file of iconFiles) {
  copy(`${iconRoot}/${file}`, `assets/ui/icons/${file.replace('Wenrexa ', '').replaceAll(' ', '-').toLowerCase()}`);
}

/* Audio and splash art are generated separately with ffmpeg. */
console.log(`prepared ${copies.length} UI assets`);
