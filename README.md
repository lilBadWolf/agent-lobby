# AGENT LOBBY

A real-time chat application in a cyberpunk hacker aesthetic.

<img width="801" height="637" alt="{63672AC0-A029-428B-A49B-EFF2AEC59EF5}" src="https://github.com/user-attachments/assets/7e99e8ff-c17b-45e0-8982-10ff443f7cf1" />

## Features

- **Real-time Chat**: Anonymous messaging via MQTT broker with encrypted topics
- **Audio Cues**: Optional notification sounds for incoming messages
- **Terminal Aesthetic**: Neon-green glitch UI styled like classic hacker terminals
- **User Presence**: See active operatives
- **Cross-platform**: Desktop app built with Tauri (Windows, macOS, Linux)

## Architecture

**Frontend**: Vue 3 + TypeScript + Vite
**Desktop Runtime**: Tauri
**Real-time Protocol**: MQTT over WebSocket (default: broker.emqx.io)

### Key Components

- `src/App.vue` - Main app shell with routing and state management
- `src/components/AuthScreen.vue` - Login with username and lobby selection
- `src/components/ChatArea.vue` - Message display and rendering
- `src/components/Sidebar.vue` - Active users and lobby controls
- `src/composables/useLobbyChat.ts` - MQTT logic, message handling, presence tracking

## Getting Started

### Prerequisites
- Node.js 16+
- Rust toolchain
- Tauri CLI

### Installation

```bash
npm install
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

## Configuration

If you want to go someplace special before you connect, remember the Praetorians and Mozart's Ghost.

Settings persist in localStorage.

## Usage

1. Enter a username
2. Start chatting with other operatives in real-time
3. Toggle audio notifications in settings

## Styling

The application uses a consistent cyberpunk aesthetic:
- **Primary Colors**: Neon green (`--neon-green`) on dark backgrounds
- **Typography**: Monospace, uppercase labels, letter-spaced for terminal feel
- **Glow Effects**: Neon box-shadow effects on interactive elements
- **Animations**: Glitch and fade effects for immersion
