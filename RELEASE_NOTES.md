## 🌉 v1.0.7 — Full Bridge Coverage (All 26 Smart Tools via Remote)

### Fixed
- **Critical: Bridge auto-start** — `mcp-swarm-remote` now passes `MCP_SERVER_URL` to companion daemon
- **Documentation** — Full startup flow, dual configs (Remote/Local), `SWARM_HUB_URL` instructions
- **CI** — `npm publish` no longer fails on already-published versions (version check before publish)

### Changed
- **Universal bridge delegation** — `bridge.ts` delegates ALL 26 tool calls via `allSmartTools` handlers
- **Simplified routing** — `toolNeedsBridge()` → `toolName.startsWith("swarm_")`

### Configuration

**Option A: Remote (recommended)**
```json
{
  "mcpServers": {
    "mcp-swarm": {
      "command": "npx",
      "args": ["-y", "-p", "mcp-swarm", "mcp-swarm-remote", "--url", "https://mcp-swarm-server.YOUR-SUBDOMAIN.workers.dev/mcp"],
      "env": { "SWARM_HUB_URL": "wss://mcp-swarm-hub.YOUR-SUBDOMAIN.workers.dev/ws" }
    }
  }
}
```

**Option B: Local**
```json
{
  "mcpServers": {
    "mcp-swarm": {
      "command": "node",
      "args": ["C:/path/to/dist/serverSmart.js"],
      "env": { "SWARM_HUB_URL": "wss://mcp-swarm-hub.YOUR-SUBDOMAIN.workers.dev/ws" }
    }
  }
}
```

### Startup Flow (Remote)
```
1. npx downloads mcp-swarm@latest
2. mcp-swarm-remote → starts companion with MCP_SERVER_URL + SWARM_HUB_URL
3. Companion → Bridge (26 tools) + Hub (real-time sync)
4. All 26 smart tools work! ✅
```

### Stats
| Metric | Before | v1.0.7 |
|--------|--------|--------|
| Tools via bridge | 3 | **26** |
| Bridge auto-start | ❌ | ✅ |

### Upgrade
```bash
npm install -g mcp-swarm@latest
```
