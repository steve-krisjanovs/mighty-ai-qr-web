# mighty-ai-qr-web — Claude Instructions

Next.js/React app. TypeScript, Tailwind, app router. API routes baked in (auth, chat, models, decode, webhooks). SQLite via node:sqlite.

---

## TODO / Bugs

- **BUG**: `Cannot read properties of undefined (reading 'id')` appears randomly in chat responses — intermittent, root cause unknown, likely a null/undefined message or chunk object not being guarded before accessing `.id`
- **TODO**: Add UI nudges prompting the user to set up their own BYOK and Tavily API key (e.g. banner or settings hint). Add a boolean in the settings pane to dismiss/stop the nagging once the user has seen it.
- **TODO**: Make the default free tier work with any configured API provider, not just Anthropic.
