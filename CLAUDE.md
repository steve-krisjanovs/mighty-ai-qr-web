# mighty-ai-qr-web — Claude Instructions

Next.js/React app. TypeScript, Tailwind, app router. API routes baked in (auth, chat, models, decode, webhooks). SQLite via node:sqlite.

---

## TODO / Bugs

- **BUG**: `Cannot read properties of undefined (reading 'id')` appears randomly in chat responses — intermittent, root cause unknown, likely a null/undefined message or chunk object not being guarded before accessing `.id`
