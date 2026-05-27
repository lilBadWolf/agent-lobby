# Release Notes

🚀 **Release highlights for agent-lobby 0.5.5**

- 🏓 **Pong start flow got another reliability pass** to prevent players from getting stuck in "waiting" at match launch.
- 🔗 **Direct-line game channel binding is more robust** so both sides stay synced to the same active game channel during startup.
- 🛠️ **Handshake behavior was hardened** to better handle real-world timing and channel swap edge cases.
- 👀 **Extra diagnostics were added for this cycle** to validate multiplayer startup behavior in live sessions while we finish tightening the flow.

> This patch is focused on one thing: getting both players into the round cleanly and consistently. 🎮✅
