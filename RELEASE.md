# Release Notes

🎉 **Release highlights for agent-lobby 0.4.2**

- 🔊 **Soundpack discovery improved**: the soundpack system now only lists proper soundpack folders and ignores stray single audio files placed directly in the root `public/sounds` folder.
- 🎧 **New sound assets added to the soundpack system**:
  - `ringback-tone.mp3` — loops while a DM request, audio call request, or video call request is pending.
  - `rejected.mp3` — plays when an outgoing DM request, file transfer, or audio/video call request is declined.
  - `secret.mp3` — plays when the network settings modal is opened via the pi button.
- 🧹 **Soundpack system cleanup**: local soundpack discovery is now more robust and will not surface invalid root-sound entries as soundpacks.

> This release strengthens the soundpack system and adds clearer, event-driven audio feedback for DMs, call requests, declined requests, and the network settings action.
