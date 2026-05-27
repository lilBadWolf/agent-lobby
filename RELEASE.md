# Release Notes

🚀 **Release highlights for agent-lobby 0.5.4**

- 🏓 **Pong startup sync is much more reliable** so both players are properly aligned before a round begins.
- 🔁 **Peer readiness is now more resilient** with better recovery from timing hiccups that previously caused stuck starts.
- 🧪 **Observe mode is now a true production-like check** using real WebRTC data channels (with signaling only for connection setup), so what you see in testing matches real-world behavior much more closely.
- ✅ **Multiplayer verification got stronger** with expanded automated coverage for sync, movement propagation, and round transitions.
- 🧰 **Build and packaging dependencies were refreshed** to keep release builds stable and up to date.

> This release is all about trustworthy Pong multiplayer flow, from first handshake to live gameplay. 🎮✨
