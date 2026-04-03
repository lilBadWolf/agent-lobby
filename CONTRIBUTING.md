# Contributing to Agent Lobby

Want to create custom themes or soundpacks for Agent Lobby? This guide will help you get started! No coding experience needed—just creativity and your favorite text editor or audio editor.

## 🎨 Creating Themes

A theme is a collection of colors that changes the look and feel of Agent Lobby. Choose your vibe—neon cyberpunk, soft pastels, retro terminal, or anything in between!

### Step 1: Create Your Theme File

Create a new file: `my-awesome-theme.css`

Copy the contents below and customize the colors:

```css
:root[data-theme='my-awesome-theme'] {
  /* Base Colors */
  --color-accent: #00ff00;           /* Main accent color */
  --color-bg-base: #0a0a0a;          /* Dark background */
  --color-accent-muted: rgba(0, 255, 0, 0.1);
  --color-danger: #ff0000;            /* Alert/error color */
  --color-on-accent: #000000;
  --color-on-danger: #ffffff;
  --color-text-primary: #ffffff;      /* Main text color */
  --color-text-secondary: rgba(0, 255, 0, 0.6);
  
  /* Chat Colors */
  --color-chat-bg: #050505;
  --color-chat-surface: rgba(0, 0, 0, 0.45);
  --color-chat-surface-strong: rgba(0, 0, 0, 0.78);
  --color-chat-overlay: rgba(0, 0, 0, 0.7);
  --color-chat-text: #ffffff;
  --color-chat-text-muted: rgba(0, 255, 0, 0.6);
  --color-chat-border: rgba(0, 255, 0, 0.18);
  --color-chat-link: #8fd3ff;
  --color-chat-link-hover: #c9ebff;
  --color-chat-warning: #ffd36f;
  --color-chat-warning-contrast: #121212;
  
  /* Auth Screen Colors */
  --color-auth-surface: rgba(0, 20, 0, 0.8);
  --color-auth-surface-glow: rgba(0, 255, 0, 0.2);
  --color-auth-badge-bg: #020a02;
  --color-auth-glitch-primary: #ff0000;
  --color-auth-glitch-secondary: #0055ff;
  --color-auth-config-glow: rgba(0, 255, 0, 0.5);
  
  /* Settings Modal Colors */
  --color-settings-surface: #0a0a0a;
  --color-settings-overlay: rgba(0, 0, 0, 0.85);
  --color-settings-effect-overlay: rgba(0, 0, 0, 0.9);
  --color-settings-divider: rgba(0, 255, 0, 0.35);
  --color-settings-code-bg: rgba(0, 255, 0, 0.08);
  --color-settings-code-border: rgba(0, 255, 0, 0.35);
  --color-settings-accent-glow: rgba(0, 255, 0, 0.35);
  --color-settings-video-preview-bg: #000000;
  
  /* Sidebar Colors */
  --color-sidebar-bg: rgba(0, 20, 0, 0.3);
  --color-sidebar-status-dot: #00ff00;
  --color-sidebar-status-dot-glow: #00ff00;
  --color-sidebar-status-dot-glow-soft: rgba(0, 255, 0, 0.45);
  --color-sidebar-status-dot-glow-strong: rgba(0, 255, 0, 0.85);
  --color-sidebar-dm-active: #00ff00;
  --color-sidebar-dm-active-border: rgba(0, 255, 0, 0.55);
  --color-sidebar-dm-active-glow: rgba(0, 255, 0, 0.45);
  --color-sidebar-dm-pending: #ffff00;
  --color-sidebar-dm-pending-border: rgba(255, 255, 0, 0.55);
  --color-sidebar-dm-pending-glow: rgba(255, 255, 0, 0.35);
  --color-sidebar-dm-pending-glow-strong: rgba(255, 255, 0, 0.65);
  --color-sidebar-dm-denied-border: rgba(255, 0, 0, 0.65);
  --color-sidebar-dm-denied-glow: rgba(255, 0, 0, 0.42);
  
  /* Agent Amp Player Colors */
  --color-agentamp-bg: linear-gradient(180deg, rgba(0, 20, 0, 0.9), rgba(0, 0, 0, 0.95));
  --color-agentamp-border: rgba(0, 255, 0, 0.45);
  --color-agentamp-panel-bg: rgba(0, 0, 0, 0.45);
  --color-agentamp-panel-border: rgba(0, 255, 0, 0.14);
  --color-agentamp-button-border: rgba(0, 255, 0, 0.85);
  --color-agentamp-button-bg: linear-gradient(180deg, rgba(0, 60, 0, 0.55), rgba(0, 30, 0, 0.75));
  --color-agentamp-button-text: #00ff00;
  --color-agentamp-button-hover-bg: linear-gradient(180deg, rgba(0, 100, 0, 0.7), rgba(0, 50, 0, 0.85));
  --color-agentamp-button-hover-text: #00ff00;
  --color-agentamp-button-muted-border: rgba(100, 100, 100, 0.55);
  --color-agentamp-button-muted-bg: linear-gradient(180deg, rgba(50, 50, 50, 0.5), rgba(30, 30, 30, 0.72));
  --color-agentamp-button-muted-text: rgba(200, 200, 200, 0.9);
  --color-agentamp-button-muted-hover-bg: linear-gradient(180deg, rgba(60, 60, 60, 0.62), rgba(40, 40, 40, 0.82));
  --color-agentamp-button-muted-hover-text: rgba(230, 230, 230, 0.95);
  --color-agentamp-button-active-shadow: inset 0 2px 2px rgba(0, 0, 0, 0.5), inset 0 -1px 0 rgba(0, 255, 0, 0.12);
  --color-agentamp-playlist-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.13);
  --color-agentamp-track-row-border: rgba(0, 255, 0, 0.08);
  --color-agentamp-track-hover-bg: rgba(0, 255, 0, 0.12);
  --color-agentamp-track-active-glow: rgba(0, 255, 0, 0.45);
  --color-agentamp-drag-outline: rgba(0, 255, 0, 0.75);
  --color-agentamp-label-next: #0099ff;
  --color-agentamp-label-then: #ffff00;
  
  /* User Colors (15 total for user highlighting in chat) */
  --theme-user-colors: 
    #ff0000, #00ff00, #0000ff,     /* Red, Green, Blue */
    #ffff00, #ff00ff, #00ffff,     /* Yellow, Magenta, Cyan */
    #ff8800, #ff0088, #00ff88,     /* Orange, Pink, Mint */
    #8800ff, #88ff00, #0088ff,     /* Purple, Lime, Sky */
    #ff88ff, #88ffff;               /* Light Purple, Light Cyan */
}
```

### Step 2: Submit Your Theme

Ready to share? Here's how:

1. **Zip your theme file**: Create a `.zip` file containing just your `my-awesome-theme.css`
2. **Add a name & description**: Include a text file in the zip with:
   - Theme name (as it should appear in the dropdown)
   - Brief description of the vibe/inspiration
   - Any credits or inspiration
3. **Submit**: Open an issue on the GitHub repo with your zip attachment and description

That's it! The maintainers will test it and merge it into the app. Your theme will be available for everyone!

### 💡 Design Tips

- **Start Simple**: Copy an existing theme file (`retro-terminal.css`, `synthwave.css`, etc.) and just change the hex colors
- **--color-accent**: Your main highlight color—this is the most important one!
- **--color-bg-base**: Keep this dark for that terminal feel
- **--color-text-primary**: Must have good contrast against the background
- **User Colors**: These 15 distinct colors help users stand out in chat—vary the hue!
- **Test in Dark Room**: See how your colors feel in low light
- **Contrast Check**: Squint at your screen—can you still read everything?

## 🔊 Creating Soundpacks

A soundpack is a collection of audio files that give Agent Lobby a unique sonic personality. It's easier than you think!

### Step 1: Create Your Soundpack Directory

Create a folder: `my-soundpack-name`

### Step 2: Add Audio Files

Inside your folder, place these 7 MP3 files:

| File | When It Plays | Tips |
|------|---------------|------|
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

---

## 🕵️ Easter Eggs

The Network Settings is hidden with a π sign. Remember the Praetorians and Mozart's Ghost.
