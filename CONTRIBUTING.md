# Contributing to Agent Lobby

Want to add new visual effects, themes, or soundpacks to Agent Lobby? This guide covers the current asset model and how authors can test locally.

## 🎨 Themes and soundpacks

Agent Lobby ships with a sample theme called `mint-cream`, and there is now a local `themes` folder in your application data for testing custom theme files.

- `themes` is the local drop-in folder for custom `.css` theme files
- `soundpacks` is the local drop-in folder for custom soundpacks
- Open Settings and click the folder icon next to Themes or Soundpacks to jump directly to the current app data directory

If you want to try a custom theme locally, copy one of the existing presets or use `mint-cream` as a starting point. You do not need to edit app source just to test a new theme locally.

## 🎛️ DM effects for creators

Agent Lobby uses a DM effects engine that mounts a Vue single-file component for each direct-message animation. The effect engine is implemented in `src/composables/useMessageAnimations.ts`.

### How the engine uses a DM effect

- The effect component is mounted into a DOM container when a DM message is displayed
- The component receives a prop: `text`
- The component must emit `done` when the animation has finished
- When `done` fires, the engine removes the effect component and continues

### What to build

A DM effect author should create a Vue SFC.

- For a CSS/JS text animation:
  - Use a root element like `<span ref="container" class="effect-root" />`
  - In `onMounted`, generate DOM nodes, text spans, and animations for the text
  - Use CSS keyframes or JavaScript timers to animate letters, words, or reveal effects
  - When the effect completes, emit `done`
  - Clean up timers in `onBeforeUnmount`

- For a Three.js effect:
  - Create a renderer inside the root element and add a `canvas` to the DOM
  - Build a `Scene`, `Camera`, and `WebGLRenderer`
  - Render text either via a canvas texture or 3D geometry
  - Animate with `requestAnimationFrame`
  - Dispose of Three.js resources when the effect ends

### Example patterns

- CSS/JS text animation example:
  - `CodexEffect.vue` uses DOM spans, falling glyph animation, and text settle transitions
  - `GlitchEffect.vue` uses CSS classes and animated character replacements
  - `RustEffect.vue` uses per-character animation classes and a `rust-decay` keyframe

- Three.js example:
  - `BubbleEffect.vue` renders text to a `CanvasTexture`, then spawns 3D bubble meshes with `MeshStandardMaterial`
  - The component creates a `PerspectiveCamera`, adds lights, and animates frames until the effect completes

### How to submit a new effect

1. Create the Vue SFC and test it locally in your own copy of the app.
2. Add your effect component to `src/components/dm-effects/`.
3. Register it in `src/composables/useMessageAnimations.ts` and add its option to `src/composables/messageEffectHelpers.ts`.
4. Submit a pull request with the component and a short description of the visual effect.

> Note: DM effects are not currently loaded from the local `themes` or `soundpacks` folders. They must be added to the app source and submitted as Vue components.

## 🔊 Creating Soundpacks

A soundpack is a collection of audio files that give Agent Lobby a unique sonic personality. It's easier than you think!

### Step 1: Create Your Soundpack Directory

Create a folder: `my-soundpack-name`

### Step 2: Add Audio Files

Inside your folder, place these 7 MP3 files:

| File | When It Plays | Tips |
| ------ | --------------- | ------ |
| `startup-sound.mp3` | When you connect to the lobby | Keep it welcoming! (< 2 seconds) |
| `shutdown-sound.mp3` | When you disconnect | Farewell vibe (< 2 seconds) |
| `join-sound.mp3` | When someone joins the lobby | Subtle notification |
| `part-sound.mp3` | When someone leaves | Gentle goodbye |
| `message-sound.mp3` | When a new message arrives | Attention-grabbing but not jarring |
| `system-sound.mp3` | For system alerts/warnings | Make it feel important |
| `signal-station.mp3` | Background loop on the login screen | Can be longer, loops continuously |

### Step 3: Submit Your Soundpack

Ready to share? Here's how:

1. **Zip your soundpack folder**: Create a `.zip` file containing your entire `my-soundpack-name/` folder with all 7 audio files
2. **Add a description**: Include a text file in the zip with:
   - Soundpack name (as it should appear in the dropdown)
   - Brief description of the audio style/vibe
   - Who created the sounds (you, or credits/sources if you used existing audio)
3. **Submit**: Open an issue on the GitHub repo with your zip attachment and description

The maintainers will review it and add it to the app. Your sounds will play for everyone! 🔊

### 🎵 Audio Tips

- **Format**: MP3 works best (WAV, OGG also supported)
- **Quality**: 128-192 kbps bitrate is perfect
- **Sample Rate**: 44.1 kHz or 48 kHz
- **Keep it Short**: Startup/shutdown/alert sounds should be under 2 seconds
- **Signal Station**: This one loops on the login screen, so make it atmospheric and not annoying!

### 💎 Soundpack Ideas

- **Retro Sci-Fi** - 1980s computer beeps and synthesizers
- **Nature** - Forest ambience with chimes and bird sounds
- **Cyberpunk** - Glitchy synths and neon aesthetic
- **Cozy** - Warm, inviting chimes and bells
- **Minimal** - Simple, clean tones that don't distract
