# Release Notes

🚀 **Release highlights for agent-lobby 0.5.7**

- 🧠 **Multiplayer startup reliability got a major hardening pass** for both PONG and BATTLESHIP.
- 🛰️ **Game message fallback paths were strengthened** so matches are far less likely to stall at "ready" across different runtime timing conditions.
- 🔗 **DM channel handoff behavior is more resilient** when game sessions are opening, reconnecting, or swapping channel instances.
- ✅ **Regression protection was expanded** with targeted multiplayer tests focused on the exact startup-sync failures we were seeing.

> This release is focused on fewer false starts, fewer stuck matches, and smoother head-to-head sessions. 🎮🔥
