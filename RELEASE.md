# Release Notes

🎉 **Release highlights for agent-lobby 0.4.24**

- � **Soundpack overhaul**: the authentication + lobby experience now supports richer soundpack audio and custom soundpack visuals.
- ✨ Added a new `AuthBackground` component to load soundpack-specific background CSS/JS and better align auth visuals with soundpack themes.
- 🎧 Added the `simulation` soundpack audio library with new startup, join, message, part, rejected, ringback, shutdown, system, secret, and signal-station sounds.
- 🌌 Improved the `starfield` and simulation code rain animations for smoother visuals and more responsive motion across the lobby experience.
- 📴 Improved audio handling during settings and auth transitions, including stopping numbers-station playback while the settings modal or chat area is visible.
- 🧩 Added a new VSEmbed proxy/hack so `https://vsembed.su/embed/tv?...` embeds can pin and report playback time correctly through the app.

> This release refocuses the app's soundpack system on immersive audio and background presentation instead of a simple config change, while polishing the visual ambiance of starfield and rain effects.
