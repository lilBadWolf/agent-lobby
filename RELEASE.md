# Release Notes

🎉 **Release highlights for agent-lobby 0.4.32**

- 🔧 Fixed hosted web build runtime errors by loading Tauri APIs only in the desktop runtime.
- 🌐 Added browser-safe fallbacks so the hosted dist can run without leaking Tauri-only code into the web bundle.
- 🔐 Hardened lobby message handling with malformed payload validation and safe encryption fallback.
- ✅ Kept the app stable across both Tauri and web deployments while preserving desktop behavior.

> This release focuses on making the hosted web build more robust and compatible while keeping the desktop app intact.
