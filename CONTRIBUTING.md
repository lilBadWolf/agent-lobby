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
- **Lobby Real-time Transport**: MQTT over WebSocket (default: `broker.emqx.io:8084/mqtt`)
- **Direct Messaging + Calls**: WebRTC (data channels + media streams)
- **Desktop Integrations**: Tauri plugins for filesystem save/reveal flows

### Key Components

| File | Purpose |
|------|---------|
| `src/App.vue` | Main app shell, routing, state management |
| `src/components/AuthScreen.vue` | Login & lobby selection |
| `src/components/ChatArea.vue` | Message display & rendering |
| `src/components/Sidebar.vue` | Active users & lobby controls |
| `src/components/SettingsModal.vue` | Theme/soundpack/audio/device settings |
| `src/components/DMChatModal.vue` | Direct message tabs, requests, file transfer UI |
| `src/components/VideoWindow.vue` | In-app video call window and controls |
| `src/components/NetworkConfigModal.vue` | Network config editing modal |
| `src/composables/useLobbyChat.ts` | MQTT logic, messages, presence tracking |
| `src/composables/useDirectMessage.ts` | DM signaling, WebRTC sessions, calls, file transfers |
| `src/composables/useMediaDevices.ts` | Device enumeration and permission handling |
| `src/composables/useImageDetection.ts` | Safe inline image URL detection |
| `src/composables/useMessageAnimations.ts` | Animated DM message effects |
| `src/composables/useTheme.ts` | Theme loading & application |
| `src/themes/` | Theme definitions |
| `public/sounds/` | Soundpack audio files |

### Core Systems

#### Lobby Messaging & Presence

Lobby chat uses MQTT topics for:
- **Global chat events**: user messages in the active lobby
- **Presence state**: join/part lifecycle, DM availability, typing state

Presence is retained per-user and updated when availability/settings change.

#### Direct Messages, Calls, and Signaling

Direct messages are peer sessions layered on top of lobby presence/signaling. The DM stack supports:
- **Connection requests**: incoming/outgoing DM handshake flow
- **Typing indicators**: per-peer typing events in active tabs
- **Audio calls**: WebRTC media sessions with runtime duration tracking
- **Video calls**: WebRTC video sessions with local/remote track toggles

DM session state is maintained per peer in `DMChat` records (`activeChats` map), including stream references, pending display messages, and call status.

#### File Transfer System

File transfer is implemented over DM data channels with chunked payloads and transfer lifecycle states:
- `pending`
- `awaiting-accept`
- `in-progress`
- `completed`
- `rejected`
- `failed`

Completed incoming files can be written to disk through Tauri FS APIs and surfaced in the OS file explorer.

#### Message Rendering & Rich Content

Chat rendering includes:
- **Typewriter-style message reveal** in lobby/system feed
- **Emoji shortcode conversion** and suggestion popover in message input
- **Inline safe image preview** for allowed URL extensions
- **Inline YouTube embed support** for recognized links

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

Audio settings are persisted and applied globally (alerts + ambience volume).

#### Media Device System

Device configuration flows through browser media APIs:
- `getUserMedia` permission requests (scoped to requested tracks)
- `enumerateDevices` for input/output discovery
- persistent selection for audio input/output and video input

The settings modal includes no-device fallbacks for mic/camera-disabled operation.

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

- `agent_settings` - Audio/theme preferences, DM defaults, device IDs
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
