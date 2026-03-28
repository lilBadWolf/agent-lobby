# Contributing to Agent Lobby

Thanks for your interest in contributing! This guide covers development setup, project architecture, and how to create themes and soundpacks.

## Development Setup

### Prerequisites

- Node.js 16+
- Rust toolchain ([install](https://www.rust-lang.org/tools/install))
- Tauri CLI: `npm install -g @tauri-apps/cli`

### Getting Started

1. Clone and install dependencies:
```bash
npm install
```

2. Run in development mode:
```bash
npm run tauri dev
```

3. Build for production:
```bash
npm run tauri build
```

## Project Architecture

### Tech Stack

- **Frontend**: Vue 3 + TypeScript + Vite
- **Desktop Runtime**: Tauri
- **Real-time**: MQTT over WebSocket (default: `broker.emqx.io:8084/mqtt`)

### Key Components

| File | Purpose |
|------|---------|
| `src/App.vue` | Main app shell, routing, state management |
| `src/components/AuthScreen.vue` | Login & lobby selection |
| `src/components/ChatArea.vue` | Message display & rendering |
| `src/components/Sidebar.vue` | Active users & lobby controls |
| `src/components/SettingsModal.vue` | Theme/soundpack/audio settings |
| `src/composables/useLobbyChat.ts` | MQTT logic, messages, presence tracking |
| `src/composables/useTheme.ts` | Theme loading & application |
| `src/themes/` | Theme definitions |
| `public/sounds/` | Soundpack audio files |

### Core Systems

#### Theme System

Themes control colors across the entire UI. Each theme defines:
- **Primary colors**: neonGreen (main accent), darkBg, dimGreen, alertRed, textWhite, systemDim
- **User colors**: 15 colors for user-specific message highlighting

Themes are loaded from `src/themes/` and applied via CSS variables.

#### Soundpack System

Soundpacks are collections of audio files in `public/sounds/[pack-name]/`. The app loads soundpacks dynamically and triggers sounds on specific events:
- `startup-sound.mp3` - on connection
- `shutdown-sound.mp3` - on disconnection
- `join-sound.mp3` - when user joins lobby
- `part-sound.mp3` - when user leaves lobby
- `message-sound.mp3` - on incoming message
- `system-sound.mp3` - for system alerts
- `signal-station.mp3` - background ambience (looped on login screen)

## Creating Themes

### Theme Structure

Themes are TypeScript modules in `src/themes/`. Each exports a `Theme` object:

```typescript
import type { Theme } from './types';

export const myTheme: Theme = {
  name: 'My Theme',
  colors: {
    neonGreen: '#00ff00',      // primary accent color
    darkBg: '#0a0a0a',         // dark background
    dimGreen: 'rgba(0, 255, 0, 0.1)',  // semi-transparent accent
    alertRed: '#ff0000',        // error/alert color
    textWhite: '#ffffff',       // primary text color
    systemDim: 'rgba(0, 255, 0, 0.6)', // dimmed text
  },
  userColors: [
    '#00ff00', '#00cc00', '#00aa00', // ... (15 total colors)
  ],
};
```

### Steps to Add a Theme

1. **Create theme file**: `src/themes/my-theme.ts`

```typescript
import type { Theme } from './types';

export const myTheme: Theme = {
  name: 'My Theme',
  colors: {
    neonGreen: '#your-primary-color',
    darkBg: '#your-dark-background',
    dimGreen: 'rgba(your-primary, 0.1)',
    alertRed: '#your-alert-color',
    textWhite: '#your-text-color',
    systemDim: 'rgba(your-primary, 0.6)',
  },
  userColors: [
    // 15 distinct colors for user highlighting
    '#color1', '#color2', '#color3',
    // ... (add 12 more)
  ],
};
```

2. **Export from index**: Add to `src/themes/index.ts`:

```typescript
import { myTheme } from './my-theme';

export { myTheme };

export const THEMES = {
  'my-theme': myTheme,
  // ... existing themes
};
```

3. **Test**: Run the app and select your theme from the settings modal

### Design Tips

- **Contrast**: Ensure text is readable against backgrounds (especially for accessibility)
- **Accent Colors**: Keep the primary accent distinct from backgrounds
- **User Colors**: Use a variety of hues to distinguish different users in chat
- **Aesthetics**: Consider the cyberpunk terminal feel with bold, contrasting colors

## Creating Soundpacks

### Soundpack Structure

Create a directory in `public/sounds/[pack-name]/` with these required files:

```
public/sounds/my-pack/
├── startup-sound.mp3          (plays on connect)
├── shutdown-sound.mp3         (plays on disconnect)
├── join-sound.mp3             (user joins lobby)
├── part-sound.mp3             (user leaves lobby)
├── message-sound.mp3          (new message arrives)
├── system-sound.mp3           (system alerts)
└── signal-station.mp3         (background ambience - looped)
```

### Steps to Add a Soundpack

1. **Create directory**: `public/sounds/my-pack/`

2. **Add audio files**: Place MP3 files (or compatible format) with the names listed above. All files are required.

3. **Audio specifications**:
   - Format: MP3 (other browser-supported formats work)
   - Bit rate: 128-192 kbps recommended
   - Sample rate: 44.1 kHz or 48 kHz
   - Keep startup/shutdown/alert sounds <2 seconds
   - signal-station can be longer (it loops)

4. **Test**:
   - Restart the dev server
   - Open settings and select your soundpack from the dropdown
   - Test each sound (enable audio, perform actions that trigger sounds)

### Audio Guidelines

- **Startup**: welcoming/boot-up sound (e.g., system chime)
- **Shutdown**: departing/shutdown sound (e.g., power-down)
- **Join/Part**: subtle notification (e.g., beep or ding)
- **Message**: distinct alert sound (e.g., notification tone)
- **System**: warning/info alert (e.g., alarm)
- **Signal-station**: atmospheric, loopable background (e.g., radio static, retro synth)

## Configuration

### Network Settings

The app connects to an MQTT broker. Default: `wss://broker.emqx.io:8084/mqtt`

Users can configure (if they read this whole document or have a keen eye):
- **MQTT Broker**: WebSocket endpoint (`wss://` protocol required)
- **Default Lobby**: Topic/room name

Settings are persisted to localStorage and loaded on startup.

### localStorage Keys

- `agent_settings` - Audio/theme preferences
- `agent_theme` - Current theme selection
- `agent_network_config` - MQTT broker & lobby settings

## Code Style

- **Vue**: Vue 3 Composition API with `<script setup>`
- **TypeScript**: Strict mode enabled
- **CSS**: Scoped styles in components, global CSS in `src/styles/`
- **Naming**: camelCase for functions/variables, PascalCase for components
- **Colors**: Use CSS variables (`--neon-green`, `--dark-bg`, etc.) in styles

## Easter Eggs

The Network Settings is hidden with a π sign.  Remember the Praetorians and Mozart's Ghost. 🕵️
