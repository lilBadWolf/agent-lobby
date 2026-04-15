# Release Notes

🎉 **Release highlights for agent-lobby 0.4.10**

- 🚀 **More reliable DM file transfers**: transfer commands now use the active peer data channel when available and recover better from channel handoff.
- ⚙️ **Safer chunk handling**: malformed file chunks are ignored and duplicate chunks are filtered out before reassembly.
- 🧩 **Cleaner transfer cleanup**: failed remote file deliveries now release pending send state immediately.

> This patch improves DM file transfer reliability and makes large attachment handoff safer across peer connections.

🎉 **Release highlights for agent-lobby 0.4.9**

- 🧑‍💻 **User avatar support**: new avatar URL setting is shared via MQTT presence and rendered next to chat senders when enabled.
- 🪪 **User taglines**: add a personal tagline in settings and share it through presence updates.
- 💬 **Sidebar user detail popup**: hover over a username to reveal avatar and tagline in a lightweight modal-style card.
- 📩 **Modern message styling**: current-user messages are now aligned to the right for a cleaner instant-message experience.

> This patch adds richer presence metadata, a user detail hover experience, and a more modern chat layout.

🎉 **Release highlights for agent-lobby 0.4.7**

- 🎵 **Playlist Track # column** now makes same-album sorting easier and more reliable.
- 📅 **Year metadata is now normalized** in both playlist and media library editors, trimming dates like `2025-04-25` to `2025`.
- 🧠 **Media library metadata loading fixed** so existing file `Year` tags populate the editor correctly.
- 🔁 **Media library sorting is more stable** across rescans, preserving row order when values are equal.

> This patch improves metadata editing accuracy and playlist/library sorting stability.

🎉 **Release highlights for agent-lobby 0.4.5**

- 📚 **New Media Library popout** for agentAMP: scan local folders, search by title/artist/album/genre, and add tracks directly to your playlist.
- 🔎 **Search and filter** makes browsing local audio/video fast; clear search and selection instantly with the new clear button.
- 🧠 **Metadata editing from the library**: right-click a row to open the edit modal and save artist/title/album/year/genre/track number.
- 🧩 **Better library table UX**: sortable columns, row hover highlighting, resizable/reorderable headers, and a sticky header row.

> This release introduces a full Media Library experience for agentAMP, making local track discovery, selection, and metadata editing seamless.

🎉 **Release highlights for agent-lobby 0.4.4**

- 📌 **Pinned Twitch and YouTube streaming windows** now stay attached as pop-out views for easier multitasking.
- 📺 **Improved YouTube pop-out handling** keeps playback responsive while preserving chat and multi-window layouts.
- 📁 **Large file and batch file loading enhancements** now handle long imports more reliably, with far better progress feedback and fewer freezes.
- 🧩 **Desktop UX polish** for pinned media windows and file queue management.

> This release sharpens content workflow with pinned pop-out media, stronger large/batch file load support, and smoother desktop window behavior.
