# Release Notes

🎉 **Release highlights for agent-lobby 0.4.18**

- 🔧 **Persistence wiring fixes**: corrected the persistence key flow so profile settings and saved state restore reliably.
- 🧠 **Persistence key refactor**: cleaned up storage key naming for more stable settings behavior.
- 🧑‍💻 **Profile settings polish**: UI refinements make editing profile details faster and more intuitive.
- 🪟 **Sidebar tweaks**: improved sidebar layout and interaction consistency.
- ⚙️ **Profile UI enhancements**: profile controls now behave more consistently when switching avatar and presence settings.

> This patch tightens persistence behavior, refines profile settings, and polishes sidebar UI consistency.

🎉 **Release highlights for agent-lobby 0.4.17**

- 🧩 **Expanded avatar pack support**: additional built-in avatar packs are now available and selectable from Profile Settings.
- 🔀 **Pack navigation UI**: users can switch packs with compact prev/next controls while browsing included avatars.
- 🎨 **Consistent pack preview**: built-in avatar sprites now render consistently across profile preview, chat, and hover cards.

> This release expands built-in avatar pack support with improved pack navigation and consistent rendering throughout the app.

🎉 **Release highlights for agent-lobby 0.4.16**

- 🧩 **Avatar packs first pass**: choose built-in avatar sprites or enter an avatar URL in Profile Settings.
- 👁️ **Live custom avatar preview**: the custom URL tab now shows a preview for both direct image links and selected pack tiles.
- 🧠 **Chat and sidebar rendering aligned**: built-in avatar pack selections now render correctly across lobby chat and user hover cards.
- 🪟 **Popup avatar cropping fix**: the hover user details popup now renders included avatar packs with the same sprite crop logic used elsewhere.
- 🔧 **Pack asset resolution fix**: included avatar pack assets now resolve locally for other users instead of using the sender's dev-server URL.
- 🤖 **Copilot Kudos**: AI implementation glued the feature flow together with validation and preview behavior.

> This release introduces built-in avatar pack selection, live custom avatar preview, consistent avatar rendering across chat and popup, and portable pack asset resolution.

🎉 **Release highlights for agent-lobby 0.4.15**

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
