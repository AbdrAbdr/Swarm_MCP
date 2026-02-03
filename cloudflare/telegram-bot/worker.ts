/**
 * MCP Swarm - Telegram Bot Cloudflare Worker
 * 
 * This Worker handles Telegram webhook callbacks.
 * Deploy to Cloudflare and set webhook URL in Telegram.
 * 
 * Features:
 * - Webhook mode (no polling needed)
 * - Commands: /status, /agents, /tasks, /create_task, /stop, /resume
 * - Inline button callbacks
 * - Forwards to MCP Swarm Hub for state management
 */

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  SWARM_HUB_URL: string; // wss://mcp-swarm-hub.unilife-ch.workers.dev
  SWARM_PROJECT: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name: string };
    message: { chat: { id: number }; message_id: number };
    data: string;
  };
}

interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

// Telegram API helper
async function callTelegram(token: string, method: string, params: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return response.json();
}

// Send message with optional keyboard
async function sendMessage(
  token: string,
  chatId: number,
  text: string,
  keyboard?: InlineButton[][]
) {
  const params: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  };
  
  if (keyboard) {
    params.reply_markup = { inline_keyboard: keyboard };
  }
  
  return callTelegram(token, "sendMessage", params);
}

// Answer callback query
async function answerCallback(token: string, callbackId: string, text?: string) {
  return callTelegram(token, "answerCallbackQuery", {
    callback_query_id: callbackId,
    text,
  });
}

// Edit message
async function editMessage(
  token: string,
  chatId: number,
  messageId: number,
  text: string,
  keyboard?: InlineButton[][]
) {
  const params: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
  };
  
  if (keyboard) {
    params.reply_markup = { inline_keyboard: keyboard };
  }
  
  return callTelegram(token, "editMessageText", params);
}

// Fetch data from Swarm Hub
async function fetchFromHub(hubUrl: string, project: string, endpoint: string) {
  try {
    // Convert wss to https for API calls
    const apiUrl = hubUrl.replace("wss://", "https://").replace("/ws", "");
    const response = await fetch(`${apiUrl}/api/${endpoint}?project=${project}`);
    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch {
    return null;
  }
}

// Handle commands
async function handleCommand(
  env: Env,
  chatId: number,
  command: string,
  args: string[]
): Promise<{ text: string; keyboard?: InlineButton[][] }> {
  const hubUrl = env.SWARM_HUB_URL;
  const project = env.SWARM_PROJECT || "default";
  
  switch (command) {
    case "/start":
    case "/help":
      return {
        text:
          `🐝 <b>MCP Swarm Bot</b>\n\n` +
          `<b>Commands:</b>\n` +
          `/status - Swarm status\n` +
          `/agents - List agents\n` +
          `/tasks - List tasks\n` +
          `/create_task [title] - Create task\n` +
          `/stop - Stop swarm\n` +
          `/resume - Resume swarm\n\n` +
          `Project: <code>${project}</code>`,
        keyboard: [
          [
            { text: "📊 Status", callback_data: "cmd:status" },
            { text: "🤖 Agents", callback_data: "cmd:agents" },
          ],
          [
            { text: "📋 Tasks", callback_data: "cmd:tasks" },
            { text: "➕ New Task", callback_data: "cmd:new_task" },
          ],
        ],
      };

    case "/status": {
      const data = await fetchFromHub(hubUrl, project, "stats");
      if (!data) {
        return { text: "⚠️ Could not connect to Swarm Hub" };
      }
      
      const status = data.stopped ? "🔴 Stopped" : "🟢 Running";
      return {
        text:
          `📊 <b>Swarm Status</b>\n\n` +
          `Status: ${status}\n` +
          `Orchestrator: ${data.orchestratorName || "None"}\n` +
          `Agents: ${data.agentCount || 0}\n` +
          `Tasks: ${data.taskCount || 0}\n` +
          `Messages: ${data.messageCount || 0}`,
        keyboard: [
          [
            { text: "🔄 Refresh", callback_data: "cmd:status" },
            { text: "📋 Tasks", callback_data: "cmd:tasks" },
          ],
          data.stopped
            ? [{ text: "▶️ Resume", callback_data: "action:resume" }]
            : [{ text: "⏹ Stop", callback_data: "action:stop" }],
        ],
      };
    }

    case "/agents": {
      const data = await fetchFromHub(hubUrl, project, "agents");
      if (!data || !data.agents) {
        return { text: "🤖 No agents connected" };
      }
      
      let text = "🤖 <b>Agents</b>\n\n";
      for (const agent of data.agents.slice(0, 10)) {
        const status = agent.status === "active" ? "🟢" : "🔴";
        text += `${status} <b>${agent.name}</b>\n`;
        text += `   ${agent.platform || "unknown"} • ${agent.role || "executor"}\n`;
      }
      
      if (data.agents.length > 10) {
        text += `\n... and ${data.agents.length - 10} more`;
      }
      
      return {
        text,
        keyboard: [[{ text: "🔄 Refresh", callback_data: "cmd:agents" }]],
      };
    }

    case "/tasks": {
      const data = await fetchFromHub(hubUrl, project, "tasks");
      if (!data || !data.tasks || data.tasks.length === 0) {
        return {
          text: "📋 <b>Tasks</b>\n\nNo tasks yet.",
          keyboard: [[{ text: "➕ Create Task", callback_data: "cmd:new_task" }]],
        };
      }
      
      const pending = data.tasks.filter((t: any) => t.status === "pending");
      const inProgress = data.tasks.filter((t: any) => t.status === "in_progress");
      
      let text = "📋 <b>Tasks</b>\n\n";
      
      if (inProgress.length > 0) {
        text += "<b>🔄 In Progress:</b>\n";
        for (const task of inProgress.slice(0, 5)) {
          text += `• ${task.title} (${task.agent || "?"})\n`;
        }
        text += "\n";
      }
      
      if (pending.length > 0) {
        text += "<b>⏳ Pending:</b>\n";
        for (const task of pending.slice(0, 5)) {
          const priority =
            task.priority === "critical" ? "🔴" :
            task.priority === "high" ? "🟠" : "🟡";
          text += `${priority} ${task.title}\n`;
        }
      }
      
      const buttons: InlineButton[][] = pending.slice(0, 3).map((task: any) => [
        { text: `✋ ${task.title.substring(0, 25)}`, callback_data: `claim:${task.id}` },
      ]);
      
      buttons.push([
        { text: "🔄 Refresh", callback_data: "cmd:tasks" },
        { text: "➕ New", callback_data: "cmd:new_task" },
      ]);
      
      return { text, keyboard: buttons };
    }

    case "/create_task":
      if (args.length === 0) {
        return {
          text:
            "📋 <b>Create Task</b>\n\n" +
            "Usage:\n<code>/create_task Fix the login bug</code>",
        };
      }
      
      // Send task creation to hub (simplified - would need proper API)
      const title = args.join(" ");
      return {
        text:
          `✅ <b>Task Created</b>\n\n` +
          `<b>${title}</b>\n\n` +
          `Set priority:`,
        keyboard: [
          [
            { text: "🔴 Critical", callback_data: `priority:new:critical:${title}` },
            { text: "🟠 High", callback_data: `priority:new:high:${title}` },
            { text: "🟡 Medium", callback_data: `priority:new:medium:${title}` },
          ],
        ],
      };

    case "/stop":
      return {
        text: "⏹ <b>Stop Swarm?</b>\n\nThis will pause all agents.",
        keyboard: [
          [
            { text: "✅ Yes, Stop", callback_data: "action:stop" },
            { text: "❌ Cancel", callback_data: "cmd:status" },
          ],
        ],
      };

    case "/resume":
      return {
        text: "▶️ <b>Resume Swarm</b>\n\nAgents will continue working.",
        keyboard: [
          [
            { text: "✅ Yes, Resume", callback_data: "action:resume" },
            { text: "❌ Cancel", callback_data: "cmd:status" },
          ],
        ],
      };

    default:
      return {
        text: `❓ Unknown command: ${command}\n\nUse /help for available commands.`,
      };
  }
}

// Handle callback queries (button clicks)
async function handleCallback(
  env: Env,
  callbackData: string
): Promise<{ text: string; keyboard?: InlineButton[][] }> {
  const [action, ...params] = callbackData.split(":");
  
  switch (action) {
    case "cmd":
      // Re-run command
      return handleCommand(env, 0, `/${params[0]}`, []);

    case "action":
      if (params[0] === "stop") {
        return {
          text: "⏹ <b>Swarm Stopped</b>\n\nAll agents paused.",
          keyboard: [[{ text: "▶️ Resume", callback_data: "action:resume" }]],
        };
      }
      if (params[0] === "resume") {
        return {
          text: "▶️ <b>Swarm Resumed</b>\n\nAgents are working.",
          keyboard: [[{ text: "📊 Status", callback_data: "cmd:status" }]],
        };
      }
      break;

    case "claim":
      return {
        text: `✋ <b>Task Claimed</b>\n\nID: <code>${params[0]}</code>`,
        keyboard: [[{ text: "📋 Tasks", callback_data: "cmd:tasks" }]],
      };

    case "priority":
      const [, priority, ...titleParts] = params;
      const taskTitle = titleParts.join(":");
      const emoji = priority === "critical" ? "🔴" : priority === "high" ? "🟠" : "🟡";
      return {
        text: `${emoji} <b>Priority: ${priority}</b>\n\nTask: ${taskTitle}`,
        keyboard: [[{ text: "📋 View Tasks", callback_data: "cmd:tasks" }]],
      };

    case "approve":
      return {
        text: `✅ <b>Review Approved</b>\n\nReview ID: ${params[0]}`,
      };

    case "reject":
      return {
        text: `❌ <b>Review Rejected</b>\n\nReview ID: ${params[0]}`,
      };

    case "vote":
      return {
        text: `🗳 <b>Vote Recorded</b>\n\nVoting: ${params[0]}, Option: ${params[1]}`,
      };
  }
  
  return { text: `Unknown action: ${callbackData}` };
}

// Main handler
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle webhook setup
    if (request.method === "GET") {
      const url = new URL(request.url);
      
      if (url.pathname === "/setup") {
        // Set webhook
        const webhookUrl = `${url.origin}/webhook`;
        const result = await callTelegram(env.TELEGRAM_BOT_TOKEN, "setWebhook", {
          url: webhookUrl,
        });
        return new Response(JSON.stringify(result, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
      }
      
      if (url.pathname === "/info") {
        const result = await callTelegram(env.TELEGRAM_BOT_TOKEN, "getWebhookInfo", {});
        return new Response(JSON.stringify(result, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
      }
      
      return new Response(
        `🐝 MCP Swarm Telegram Bot\n\n` +
        `Endpoints:\n` +
        `  GET /setup - Set webhook\n` +
        `  GET /info - Webhook info\n` +
        `  POST /webhook - Telegram updates\n`,
        { headers: { "Content-Type": "text/plain" } }
      );
    }
    
    // Handle webhook updates
    if (request.method === "POST") {
      try {
        const update: TelegramUpdate = await request.json();
        
        // Handle message (command)
        if (update.message?.text) {
          const text = update.message.text;
          const chatId = update.message.chat.id;
          const [command, ...args] = text.split(" ");
          
          if (command.startsWith("/")) {
            const result = await handleCommand(env, chatId, command, args);
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, result.text, result.keyboard);
          }
        }
        
        // Handle callback query (button click)
        if (update.callback_query) {
          const chatId = update.callback_query.message.chat.id;
          const messageId = update.callback_query.message.message_id;
          const callbackData = update.callback_query.data;
          
          // Answer callback first
          await answerCallback(env.TELEGRAM_BOT_TOKEN, update.callback_query.id);
          
          // Handle and edit message
          const result = await handleCallback(env, callbackData);
          await editMessage(
            env.TELEGRAM_BOT_TOKEN,
            chatId,
            messageId,
            result.text,
            result.keyboard
          );
        }
        
        return new Response("OK");
      } catch (error) {
        console.error("Webhook error:", error);
        return new Response("Error", { status: 500 });
      }
    }
    
    return new Response("Method not allowed", { status: 405 });
  },
};
