# Release Notes

🎉 **Release highlights for agent-lobby 0.2.7**

- ✅ **YouTube embed detection improved**: Regular `youtube.com` links now auto-detect for chat embedding and pinning.
- 🚀 **Live stream support**: `youtube.com/live/VIDEOID` URLs are now recognized for in-chat playback.
- 🛠️ **Chat media handling polish**: Better YouTube link extraction keeps pinned video controls and feed embeds consistent.

> This patch extends chat video embedding so more YouTube link formats behave like first-class pinned media.

---

🎉 **Release highlights for agent-lobby 0.2.6**

- ✅ **Direct Message playback reliability**: Fixed an issue where DM effects could replay previously animated messages when chat state resynchronized.
- 💬 **Cleaner typing/DM state handling**: The DM system now preserves delivery confirmation and avoids stale playback during peer typing.
- 🧠 **More robust message dedupe**: Message playback now uses stable IDs to ensure each DM effect only runs once.
- 🚀 **General polish**: Under-the-hood improvements for smoother direct messaging and more reliable desktop behavior.

> This patch is focused on making direct message playback feel consistent and dependable, especially during active peer conversations.
