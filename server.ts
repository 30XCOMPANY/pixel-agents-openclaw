// Simple HTTP Server with SSE for Pixel Agents OpenClaw
// Reads sessions from OpenClaw sessions.json file

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3456;
const SESSIONS_FILE = process.env.SESSIONS_FILE || 
  '/Users/oogie/.openclaw/agents/main/sessions/sessions.json';

interface SessionData {
  sessionId: string;
  updatedAt: number;
  chatType: string;
  deliveryContext?: {
    channel?: string;
  };
  origin?: {
    provider?: string;
    from?: string;
  };
}

interface AgentInfo {
  id: number;
  sessionKey: string;
  sessionId: string;
  model: string;
  status: string;
  currentTask: string;
  channel?: string;
  palette?: number;
}

const app = express();
let clients: Set<express.Response> = new Set();
let agents: Map<string, AgentInfo> = new Map();
let nextAgentId = 1;

// Serve static files from webview build output
app.use(express.static(join(__dirname, 'dist', 'webview')));

// Fallback to index.html for SPA routing
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'webview', 'index.html'));
});

// SSE endpoint for real-time agent updates
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  clients.add(res);
  console.log(`[Pixel Agents] Client connected. Total: ${clients.size}`);

  // Send default layout (triggers webview to use default)
  res.write(`data: ${JSON.stringify({ type: 'layoutLoaded', layout: null })}\n\n`);
  
  // Send character sprites loaded (uses built-in fallback)
  res.write(`data: ${JSON.stringify({ type: 'characterSpritesLoaded' })}\n\n`);
  
  // Send floor tiles loaded
  res.write(`data: ${JSON.stringify({ type: 'floorTilesLoaded' })}\n\n`);
  
  // Send wall tiles loaded
  res.write(`data: ${JSON.stringify({ type: 'wallTilesLoaded' })}\n\n`);

  // Send existing agents - webview expects array of numbers
  const agentIds = Array.from(agents.values()).map(a => a.id);
  res.write(`data: ${JSON.stringify({ type: 'existingAgents', agents: agentIds })}\n\n`);

  req.on('close', () => {
    clients.delete(res);
    console.log(`[Pixel Agents] Client disconnected. Total: ${clients.size}`);
  });
});

// API to get current agents
app.get('/api/agents', (req, res) => {
  res.json(Array.from(agents.values()));
});

// API to get single agent details
app.get('/api/agents/:id', (req, res) => {
  const id = parseInt(req.params.id);
  for (const agent of agents.values()) {
    if (agent.id === id) {
      res.json(agent);
      return;
    }
  }
  res.status(404).json({ error: 'Agent not found' });
});

// Broadcast to all connected clients
function broadcast(message: any): void {
  const data = `data: ${JSON.stringify(message)}\n\n`;
  for (const client of clients) {
    client.write(data);
  }
}

// Poll sessions from file
function pollSessions(): void {
  try {
    if (!existsSync(SESSIONS_FILE)) {
      return;
    }

    const content = readFileSync(SESSIONS_FILE, 'utf-8');
    const sessionsData = JSON.parse(content);
    
    const sessions: SessionData[] = Object.values(sessionsData);
    const currentKeys = new Set(sessions.map(s => s.sessionId));

    // Remove agents for closed sessions
    for (const [key, agent] of agents) {
      if (!currentKeys.has(agent.sessionId)) {
        agents.delete(key);
        broadcast({ type: 'agentClosed', id: agent.id });
      }
    }

    // Update or create agents
    for (const session of sessions) {
      const key = session.sessionId;
      let agent = agents.get(key);
      
      // Determine status based on chatType and recency
      const now = Date.now();
      const lastActive = session.updatedAt;
      const isRecent = (now - lastActive) < 5 * 60 * 1000; // 5 minutes
      const status = session.chatType === 'system' || !isRecent ? 'idle' : 'active';
      
      const channel = session.deliveryContext?.channel || session.origin?.provider || 'unknown';
      const currentTask = `Chat: ${channel}`;

      if (!agent) {
        const palette = (nextAgentId - 1) % 6; // Cycle through 6 palettes
        agent = {
          id: nextAgentId++,
          sessionKey: key,
          sessionId: key,
          model: 'MiniMax-M2.5',
          status,
          currentTask,
          channel,
          palette,
        };
        agents.set(key, agent);
        
        // Send agent created
        broadcast({ 
          type: 'agentCreated', 
          id: agent.id,
          palette: agent.palette,
          hueShift: 0,
          seatId: null
        });
        
        // Simulate starting a task after a short delay
        setTimeout(() => {
          broadcast({ 
            type: 'agentToolStart', 
            id: agent!.id, 
            toolId: `tool-${Date.now()}`,
            status: currentTask
          });
        }, 1000 + Math.random() * 1000);
      } else {
        // Update existing - send status changes
        if (agent.status !== status) {
          agent.status = status;
          broadcast({ type: 'agentStatus', id: agent.id, status });
          
          if (status === 'idle') {
            // Clear tools when going idle
            broadcast({ type: 'agentToolsClear', id: agent.id });
          }
        }
      }
    }

  } catch (error) {
    // Silent fail on polling errors
  }
}

// Start polling every 2 seconds
setInterval(pollSessions, 2000);
pollSessions(); // Initial poll

// Start server
const server = app.listen(PORT, () => {
  console.log(`[Pixel Agents] Server running at http://localhost:${PORT}`);
  console.log(`[Pixel Agents] Reading sessions from: ${SESSIONS_FILE}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Pixel Agents] Shutting down...');
  server.close(() => process.exit(0));
});
