# Cloudflare Worker (v0)

Каркас real-time hub:
- WebSocket endpoint: `/ws?project=<project_uid>`
- GitHub webhook endpoint: `/github/webhook?project=<project_uid>`
- Durable Object: `SwarmRoom`

Это v0-заготовка: event-log и лидер-lease есть, но безопасность/подписи webhook/аутентификация будут добавлены позже.
