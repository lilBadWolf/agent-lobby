# Release Notes

🎉 **Release highlights for agent-lobby 0.4.13**

- 🧭 **Compact sidebar popup reposition**: the compact sidebar hover card now appears slightly closer and higher for better alignment.
- 🧼 **UI polish for compact mode**: this patch refines the user-hover modal placement without changing compact sidebar behavior.

> This patch fine-tunes compact sidebar hover popup placement for a smoother user experience.

🎉 **Release highlights for agent-lobby 0.4.12**

- 📦 **DM file transfers now survive large attachments more reliably**: sender-side transfers stream 8 KB chunks and avoid buffering the entire file in memory.
- 🧪 **Better RTC backpressure handling**: the sender now waits for `bufferedamountlow` and allows more time for the data channel to drain before failing.
- 🔧 **Tauri save ACL fix included**: the file save path now allows `fs:open` alongside download-write permissions so incoming file saves can complete.

> This patch hardens DM file transfer and fixes the Tauri save ACL path for large incoming attachments.

🎉 **Release highlights for agent-lobby 0.4.11**

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
