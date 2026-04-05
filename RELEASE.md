# Release Notes

🎉 **Release highlights for agent-lobby 0.2.6**

- ✅ **Direct Message playback reliability**: Fixed an issue where DM effects could replay previously animated messages when chat state resynchronized.
- 💬 **Cleaner typing/DM state handling**: The DM system now preserves delivery confirmation and avoids stale playback during peer typing.
- 🧠 **More robust message dedupe**: Message playback now uses stable IDs to ensure each DM effect only runs once.
- 🚀 **General polish**: Under-the-hood improvements for smoother direct messaging and more reliable desktop behavior.

> This patch is focused on making direct message playback feel consistent and dependable, especially during active peer conversations.
