export type LocalControlResponse = {
  ok: boolean;
  stop?: boolean;
  paused?: boolean;
  agentName?: string;
};

async function request(
  method: "GET" | "POST",
  url: string,
  token?: string
): Promise<LocalControlResponse> {
  const headers: Record<string, string> = {};
  if (token) headers["x-swarm-token"] = token;

  const res = await fetch(url, { method, headers });
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  try {
    return JSON.parse(text) as LocalControlResponse;
  } catch {
    return { ok: true };
  }
}

function baseUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

export async function companionLocalStatus(port: number, token?: string) {
  return request("GET", `${baseUrl(port)}/status`, token);
}

export async function companionLocalStop(port: number, token?: string) {
  return request("POST", `${baseUrl(port)}/stop`, token);
}

export async function companionLocalPause(port: number, token?: string) {
  return request("POST", `${baseUrl(port)}/pause`, token);
}

export async function companionLocalResume(port: number, token?: string) {
  return request("POST", `${baseUrl(port)}/resume`, token);
}
