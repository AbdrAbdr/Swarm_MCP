/**
 * MCP Swarm — Dashboard HTML Generator
 * 
 * Generates the interactive web dashboard HTML for the companion control server.
 * Extracted from companion.ts for better maintainability.
 */

export interface DashboardData {
    agentName: string;
    role: string;
    isOrchestrator: boolean;
    paused: boolean;
    stop: boolean;
    bridgeConnected: boolean;
    projectId: string;
    uptimeStr: string;
    pid: number;
    logFilePath: string;
}

export function renderDashboard(data: DashboardData): string {
    const {
        agentName, role, isOrchestrator, paused, stop,
        bridgeConnected, projectId, uptimeStr, pid, logFilePath
    } = data;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="5">
  <title>🐝 MCP Swarm — Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0d1117; color: #e6edf3; min-height: 100vh; padding: 2rem; }
    .container { max-width: 960px; margin: 0 auto; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    h1 span { color: #58a6ff; }
    .subtitle { color: #8b949e; margin-bottom: 2rem; font-size: 0.95rem; }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 1.2rem; transition: border-color 0.2s; }
    .card:hover { border-color: #58a6ff44; }
    .card h3 { color: #8b949e; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .card .value { font-size: 1.3rem; font-weight: 600; }
    .card .value.green { color: #3fb950; }
    .card .value.blue { color: #58a6ff; }
    .card .value.yellow { color: #d29922; }
    .badge { display: inline-block; padding: 0.15rem 0.6rem; border-radius: 99px; font-size: 0.75rem; font-weight: 600; }
    .badge.orch { background: #1f6feb33; color: #58a6ff; border: 1px solid #1f6feb; }
    .badge.exec { background: #23863633; color: #3fb950; border: 1px solid #238636; }
    .badge.running { background: #23863633; color: #3fb950; }
    .badge.paused { background: #d2992233; color: #d29922; }
    .badge.stopped { background: #f8514933; color: #f85149; }
    .controls { display: flex; gap: 0.6rem; margin-bottom: 2rem; flex-wrap: wrap; }
    .btn { padding: 0.5rem 1.2rem; border: 1px solid #30363d; border-radius: 8px; background: #161b22; color: #e6edf3; cursor: pointer; font-size: 0.85rem; font-weight: 500; transition: all 0.15s; }
    .btn:hover { background: #1f2937; border-color: #58a6ff; transform: translateY(-1px); }
    .btn:active { transform: translateY(0); }
    .btn.danger { border-color: #f85149; color: #f85149; }
    .btn.danger:hover { background: #f8514922; }
    .btn.warn { border-color: #d29922; color: #d29922; }
    .btn.warn:hover { background: #d2992222; }
    .btn.ok { border-color: #3fb950; color: #3fb950; }
    .btn.ok:hover { background: #3fb95022; }
    .toast { position: fixed; bottom: 2rem; right: 2rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 0.8rem 1.2rem; color: #e6edf3; font-size: 0.85rem; opacity: 0; transition: opacity 0.3s; z-index: 99; pointer-events: none; }
    .toast.show { opacity: 1; }
    .endpoints { margin-top: 1rem; }
    .endpoints h2 { font-size: 1.1rem; margin-bottom: 0.8rem; color: #c9d1d9; }
    .ep-list { list-style: none; }
    .ep-list li { padding: 0.4rem 0.8rem; border-bottom: 1px solid #21262d; font-family: 'Cascadia Code', 'Fira Code', monospace; font-size: 0.8rem; display: flex; gap: 0.8rem; }
    .ep-list .method { color: #3fb950; min-width: 3.5rem; font-weight: 600; }
    .ep-list .path { color: #58a6ff; }
    .ep-list .desc { color: #8b949e; margin-left: auto; }
    .footer { margin-top: 2rem; color: #484f58; font-size: 0.8rem; text-align: center; }
    .footer a { color: #58a6ff; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🐝 MCP <span>Swarm</span></h1>
    <p class="subtitle">Companion Dashboard — auto-refreshes every 5s</p>
    <div class="cards">
      <div class="card">
        <h3>Agent</h3>
        <div class="value blue">${agentName}</div>
      </div>
      <div class="card">
        <h3>Role</h3>
        <div class="value"><span class="badge ${isOrchestrator ? 'orch' : 'exec'}">${role.toUpperCase()}</span></div>
      </div>
      <div class="card">
        <h3>Status</h3>
        <div class="value"><span class="badge ${stop ? 'stopped' : paused ? 'paused' : 'running'}">${stop ? '⏹ STOPPED' : paused ? '⏸ PAUSED' : '▶ RUNNING'}</span></div>
      </div>
      <div class="card">
        <h3>Bridge</h3>
        <div class="value ${bridgeConnected ? 'green' : 'yellow'}">${bridgeConnected ? '🌉 Connected' : '⚠ Off'}</div>
      </div>
      <div class="card">
        <h3>Project</h3>
        <div class="value" style="font-size:0.9rem;word-break:break-all;" id="project-id">${projectId}</div>
      </div>
      <div class="card">
        <h3>Uptime</h3>
        <div class="value green">${uptimeStr}</div>
      </div>
      <div class="card">
        <h3>PID</h3>
        <div class="value" style="font-size:1rem;">${pid}</div>
      </div>
      <div class="card">
        <h3>Log File</h3>
        <div class="value" style="font-size:0.7rem;word-break:break-all;color:#8b949e;">${logFilePath}</div>
      </div>
    </div>
    <div class="controls">
      <button class="btn ${paused ? 'ok' : 'warn'}" onclick="action('${paused ? 'resume' : 'pause'}')">${paused ? '▶ Resume' : '⏸ Pause'}</button>
      <button class="btn danger" onclick="if(confirm('Shutdown companion?')) action('stop')">⏹ Shutdown</button>
      <button class="btn" onclick="copyId()">📋 Copy Project ID</button>
    </div>
    <div class="endpoints">
      <h2>📡 API Endpoints</h2>
      <ul class="ep-list">
        <li><span class="method">GET</span><span class="path">/</span><span class="desc">Dashboard</span></li>
        <li><span class="method">GET</span><span class="path">/status</span><span class="desc">JSON status</span></li>
        <li><span class="method">GET</span><span class="path">/health</span><span class="desc">Health check</span></li>
        <li><span class="method">GET</span><span class="path">/bridge/status</span><span class="desc">Bridge info</span></li>
        <li><span class="method">POST</span><span class="path">/pause</span><span class="desc">Pause</span></li>
        <li><span class="method">POST</span><span class="path">/resume</span><span class="desc">Resume</span></li>
        <li><span class="method">POST</span><span class="path">/stop</span><span class="desc">Stop</span></li>
      </ul>
    </div>
    <div class="footer">
      MCP Swarm v1.1 • <a href="https://github.com/AbdrAbdr/MCP-Swarm" target="_blank">GitHub</a> • <a href="https://www.npmjs.com/package/mcp-swarm" target="_blank">npm</a>
    </div>
  </div>
  <div class="toast" id="toast"></div>
  <script>
    function toast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2500);
    }
    async function action(act) {
      try {
        const r = await fetch('/' + act, { method: 'POST' });
        const j = await r.json();
        toast(j.ok ? act + ' OK ✅' : 'Error: ' + (j.message || 'unknown'));
        if (act !== 'stop') setTimeout(() => location.reload(), 500);
      } catch(e) { toast('Error: ' + e.message); }
    }
    function copyId() {
      const id = document.getElementById('project-id').textContent;
      navigator.clipboard.writeText(id).then(() => toast('Copied: ' + id)).catch(() => toast('Copy failed'));
    }
  </script>
</body>
</html>`;
}
