/**
 * MCP Swarm — Dashboard 2.0 HTML Generator
 * 
 * Enhanced dashboard with:
 * - Chart.js graphs (tasks 24h, cost per agent)
 * - Pulse timeline (agent heartbeats)
 * - Global Stop/Resume (via Hub API)
 * - WebSocket live updates (replaces meta-refresh)
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
  hubUrl?: string;
}

export function renderDashboard(data: DashboardData): string {
  const {
    agentName, role, isOrchestrator, paused, stop,
    bridgeConnected, projectId, uptimeStr, pid, logFilePath,
    hubUrl
  } = data;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🐝 MCP Swarm — Dashboard 2.0</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0d1117; color: #e6edf3; min-height: 100vh; padding: 2rem; }
    .container { max-width: 1100px; margin: 0 auto; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    h1 span { color: #58a6ff; }
    .subtitle { color: #8b949e; margin-bottom: 2rem; font-size: 0.95rem; }
    .live-dot { display: inline-block; width: 8px; height: 8px; background: #3fb950; border-radius: 50%; margin-left: 8px; animation: pulse-dot 2s infinite; }
    @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

    /* Cards */
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

    /* Controls */
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

    /* Charts */
    .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 2rem; }
    .chart-box { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 1.2rem; }
    .chart-box h3 { color: #c9d1d9; font-size: 0.9rem; margin-bottom: 0.8rem; }

    /* Pulse Timeline */
    .timeline { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 1.2rem; margin-bottom: 2rem; }
    .timeline h3 { color: #c9d1d9; font-size: 0.9rem; margin-bottom: 0.8rem; }
    .timeline-items { display: flex; flex-direction: column; gap: 0.4rem; }
    .timeline-item { display: flex; align-items: center; gap: 0.8rem; padding: 0.4rem 0.6rem; border-radius: 6px; background: #0d1117; }
    .timeline-item .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .timeline-item .dot.active { background: #3fb950; box-shadow: 0 0 6px #3fb95066; }
    .timeline-item .dot.idle { background: #d29922; }
    .timeline-item .dot.offline { background: #484f58; }
    .timeline-item .agent-name { font-weight: 600; font-size: 0.85rem; min-width: 120px; }
    .timeline-item .agent-info { color: #8b949e; font-size: 0.8rem; }
    .timeline-item .agent-time { color: #484f58; font-size: 0.75rem; margin-left: auto; }

    /* Endpoints */
    .endpoints { margin-top: 1rem; }
    .endpoints h2 { font-size: 1.1rem; margin-bottom: 0.8rem; color: #c9d1d9; }
    .ep-list { list-style: none; }
    .ep-list li { padding: 0.4rem 0.8rem; border-bottom: 1px solid #21262d; font-family: 'Cascadia Code', 'Fira Code', monospace; font-size: 0.8rem; display: flex; gap: 0.8rem; }
    .ep-list .method { color: #3fb950; min-width: 3.5rem; font-weight: 600; }
    .ep-list .path { color: #58a6ff; }
    .ep-list .desc { color: #8b949e; margin-left: auto; }

    .toast { position: fixed; bottom: 2rem; right: 2rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 0.8rem 1.2rem; color: #e6edf3; font-size: 0.85rem; opacity: 0; transition: opacity 0.3s; z-index: 99; pointer-events: none; }
    .toast.show { opacity: 1; }
    .footer { margin-top: 2rem; color: #484f58; font-size: 0.8rem; text-align: center; }
    .footer a { color: #58a6ff; text-decoration: none; }

    @media (max-width: 768px) {
      .charts { grid-template-columns: 1fr; }
      .cards { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🐝 MCP <span>Swarm</span> <span class="live-dot" id="live-dot" title="Live updates"></span></h1>
    <p class="subtitle">Dashboard 2.0 — Live WebSocket Updates</p>

    <div class="cards">
      <div class="card">
        <h3>Agent</h3>
        <div class="value blue" id="agent-name">${agentName}</div>
      </div>
      <div class="card">
        <h3>Role</h3>
        <div class="value"><span class="badge ${isOrchestrator ? 'orch' : 'exec'}" id="agent-role">${role.toUpperCase()}</span></div>
      </div>
      <div class="card">
        <h3>Status</h3>
        <div class="value"><span class="badge ${stop ? 'stopped' : paused ? 'paused' : 'running'}" id="agent-status">${stop ? '⏹ STOPPED' : paused ? '⏸ PAUSED' : '▶ RUNNING'}</span></div>
      </div>
      <div class="card">
        <h3>Bridge</h3>
        <div class="value ${bridgeConnected ? 'green' : 'yellow'}" id="bridge-status">${bridgeConnected ? '🌉 Connected' : '⚠ Off'}</div>
      </div>
      <div class="card">
        <h3>Project</h3>
        <div class="value" style="font-size:0.9rem;word-break:break-all;" id="project-id">${projectId}</div>
      </div>
      <div class="card">
        <h3>Uptime</h3>
        <div class="value green" id="uptime">${uptimeStr}</div>
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

    <!-- Controls -->
    <div class="controls">
      <button class="btn ${paused ? 'ok' : 'warn'}" onclick="action('${paused ? 'resume' : 'pause'}')" id="btn-pause">${paused ? '▶ Resume' : '⏸ Pause'}</button>
      <button class="btn danger" onclick="if(confirm('Shutdown companion?')) action('stop')">⏹ Shutdown</button>
      <button class="btn ok" id="btn-swarm-resume" onclick="swarmControl('resume')" style="display:${stop ? 'inline-block' : 'none'}">🐝 Resume Swarm</button>
      <button class="btn danger" id="btn-swarm-stop" onclick="if(confirm('Stop entire swarm?')) swarmControl('stop')" style="display:${stop ? 'none' : 'inline-block'}">🐝 Stop Swarm</button>
      <button class="btn" onclick="copyId()">📋 Copy Project ID</button>
    </div>

    <!-- Charts -->
    <div class="charts">
      <div class="chart-box">
        <h3>📊 Tasks Last 24h</h3>
        <canvas id="tasksChart" height="200"></canvas>
      </div>
      <div class="chart-box">
        <h3>🤖 Agents Activity</h3>
        <canvas id="agentsChart" height="200"></canvas>
      </div>
    </div>

    <!-- Pulse Timeline -->
    <div class="timeline">
      <h3>💓 Agent Pulse Timeline</h3>
      <div class="timeline-items" id="pulse-timeline">
        <div class="timeline-item">
          <div class="dot active"></div>
          <span class="agent-name">${agentName}</span>
          <span class="agent-info">${role} • ${bridgeConnected ? 'bridge connected' : 'local only'}</span>
          <span class="agent-time">now</span>
        </div>
      </div>
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
      MCP Swarm v1.1.6 • <a href="https://github.com/AbdrAbdr/MCP-Swarm" target="_blank">GitHub</a> • <a href="https://www.npmjs.com/package/mcp-swarm" target="_blank">npm</a>
    </div>
  </div>
  <div class="toast" id="toast"></div>
  <script>
    // ==================== Toast ====================
    function toast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2500);
    }

    // ==================== Local Companion Actions ====================
    async function action(act) {
      try {
        const r = await fetch('/' + act, { method: 'POST' });
        const j = await r.json();
        toast(j.ok ? act + ' OK ✅' : 'Error: ' + (j.message || 'unknown'));
        if (act !== 'stop') setTimeout(() => location.reload(), 500);
      } catch(e) { toast('Error: ' + e.message); }
    }

    // ==================== Global Swarm Control via Hub ====================
    async function swarmControl(act) {
      try {
        const r = await fetch('/hub/' + act, { method: 'POST' });
        const j = await r.json();
        toast(j.ok ? 'Swarm ' + act + ' OK ✅' : 'Error: ' + (j.message || 'unknown'));
        setTimeout(() => location.reload(), 500);
      } catch(e) { toast('Error: ' + e.message); }
    }

    function copyId() {
      const id = document.getElementById('project-id').textContent;
      navigator.clipboard.writeText(id).then(() => toast('Copied: ' + id)).catch(() => toast('Copy failed'));
    }

    // ==================== Charts ====================
    const chartDefaults = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#8b949e', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#484f58' }, grid: { color: '#21262d' } },
        y: { ticks: { color: '#484f58' }, grid: { color: '#21262d' }, beginAtZero: true }
      }
    };

    // Tasks Chart (placeholder data — will be filled by WebSocket)
    const tasksCtx = document.getElementById('tasksChart').getContext('2d');
    const tasksChart = new Chart(tasksCtx, {
      type: 'bar',
      data: {
        labels: ['6h ago', '5h', '4h', '3h', '2h', '1h', 'Now'],
        datasets: [{
          label: 'Created',
          data: [0, 0, 0, 0, 0, 0, 0],
          backgroundColor: '#58a6ff66',
          borderColor: '#58a6ff',
          borderWidth: 1,
          borderRadius: 4,
        }, {
          label: 'Completed',
          data: [0, 0, 0, 0, 0, 0, 0],
          backgroundColor: '#3fb95066',
          borderColor: '#3fb950',
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: chartDefaults
    });

    // Agents Activity (pie/doughnut)
    const agentsCtx = document.getElementById('agentsChart').getContext('2d');
    const agentsChart = new Chart(agentsCtx, {
      type: 'doughnut',
      data: {
        labels: ['Active', 'Idle', 'Offline'],
        datasets: [{
          data: [1, 0, 0],
          backgroundColor: ['#3fb950', '#d29922', '#484f58'],
          borderColor: '#161b22',
          borderWidth: 3,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#8b949e', font: { size: 11 }, padding: 12 } }
        }
      }
    });

    // ==================== WebSocket Live Updates ====================
    let ws = null;
    function connectWS() {
      try {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(proto + '//' + location.host + '/ws');
        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            handleWSMessage(msg);
          } catch {}
        };
        ws.onclose = () => { setTimeout(connectWS, 3000); };
        ws.onerror = () => { ws.close(); };
        document.getElementById('live-dot').style.background = '#3fb950';
      } catch {
        // Fallback to polling if WebSocket not available
        setInterval(async () => {
          try {
            const r = await fetch('/status');
            const data = await r.json();
            updateDashboard(data);
          } catch {}
        }, 5000);
      }
    }

    function handleWSMessage(msg) {
      if (msg.kind === 'status_update') {
        updateDashboard(msg);
      }
      if (msg.kind === 'pulse_update') {
        updateTimeline(msg);
      }
      if (msg.kind === 'task_created' || msg.kind === 'task_completed') {
        toast('📋 ' + msg.kind.replace('_', ' ') + ': ' + (msg.title || msg.taskId));
      }
      if (msg.kind === 'swarm_stopped') {
        toast('⏹ Swarm Stopped');
        document.getElementById('btn-swarm-stop').style.display = 'none';
        document.getElementById('btn-swarm-resume').style.display = 'inline-block';
      }
      if (msg.kind === 'swarm_resumed') {
        toast('▶ Swarm Resumed');
        document.getElementById('btn-swarm-stop').style.display = 'inline-block';
        document.getElementById('btn-swarm-resume').style.display = 'none';
      }
    }

    function updateDashboard(data) {
      if (data.agentName) document.getElementById('agent-name').textContent = data.agentName;
      if (data.uptimeStr) document.getElementById('uptime').textContent = data.uptimeStr;
    }

    function updateTimeline(pulse) {
      const timeline = document.getElementById('pulse-timeline');
      const existingItem = timeline.querySelector('[data-agent="' + pulse.agent + '"]');
      const statusClass = pulse.status === 'active' ? 'active' : pulse.status === 'idle' ? 'idle' : 'offline';
      const ago = Math.round((Date.now() - (pulse.lastUpdate || Date.now())) / 1000);
      const timeStr = ago < 60 ? ago + 's ago' : Math.round(ago / 60) + 'm ago';

      const html = '<div class="dot ' + statusClass + '"></div>' +
        '<span class="agent-name">' + pulse.agent + '</span>' +
        '<span class="agent-info">' + (pulse.platform || '') + ' • ' + (pulse.currentTask || 'idle') + '</span>' +
        '<span class="agent-time">' + timeStr + '</span>';

      if (existingItem) {
        existingItem.innerHTML = html;
      } else {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        item.setAttribute('data-agent', pulse.agent);
        item.innerHTML = html;
        timeline.appendChild(item);
      }
    }

    // Initialize WebSocket
    connectWS();

    // Fetch initial chart data
    fetch('/status').then(r => r.json()).then(data => {
      if (data.chartData) {
        tasksChart.data.datasets[0].data = data.chartData.created || [0,0,0,0,0,0,0];
        tasksChart.data.datasets[1].data = data.chartData.completed || [0,0,0,0,0,0,0];
        tasksChart.update();
      }
      if (data.agentStats) {
        agentsChart.data.datasets[0].data = [data.agentStats.active || 1, data.agentStats.idle || 0, data.agentStats.offline || 0];
        agentsChart.update();
      }
    }).catch(() => {});
  </script>
</body>
</html>`;
}
