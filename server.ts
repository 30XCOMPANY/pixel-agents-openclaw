// Simple HTTP Server with SSE for Pixel Agents OpenClaw
// Reads sessions from OpenClaw agent session sources

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { PNG } from 'pngjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3456;
const AGENTS_ROOT = join(homedir(), '.openclaw', 'agents');
const SESSIONS_FILE = process.env.SESSIONS_FILE || null;

// Load default layout
let defaultLayout: any = null;
const defaultLayoutPath = join(__dirname, 'dist', 'webview', 'assets', 'default-layout.json');
if (existsSync(defaultLayoutPath)) {
  try {
    defaultLayout = JSON.parse(readFileSync(defaultLayoutPath, 'utf-8'));
    console.log('[Pixel Agents] Loaded default layout');
  } catch (e) {
    console.log('[Pixel Agents] Failed to load default layout:', e);
  }
}

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
  agentName: string;
  sessionKey: string;
  sessionId: string;
  sessionCount: number;
  activeSessionCount: number;
  model: string;
  status: string;
  currentTask: string;
  channel?: string;
  palette?: number;
}

interface SessionSnapshot {
  sessionKey: string;
  sourceAgentName: string;
  data: SessionData;
}

interface AgentAggregate {
  agentName: string;
  sessionCount: number;
  activeSessionCount: number;
  latestUpdatedAt: number;
  primarySessionId: string;
  primarySessionKey: string;
  primaryChannel: string;
}

interface FurnitureAsset {
  id: string;
  label: string;
  category: string;
  file: string;
  width: number;
  height: number;
  footprintW: number;
  footprintH: number;
  isDesk: boolean;
  groupId?: string;
  orientation?: string;
  state?: string;
  canPlaceOnSurfaces?: boolean;
  backgroundTiles?: number;
  canPlaceOnWalls?: boolean;
}

interface LoadedFurnitureAssets {
  catalog: FurnitureAsset[];
  sprites: Record<string, string[][]>;
}

interface CharacterDirectionSprites {
  down: string[][][];
  up: string[][][];
  right: string[][][];
}

interface LoadedCharacterSprites {
  characters: CharacterDirectionSprites[];
}

const BUILTIN_FURNITURE_TYPES = new Set([
  'desk',
  'bookshelf',
  'plant',
  'cooler',
  'whiteboard',
  'chair',
  'pc',
  'lamp',
]);

const CHAR_COUNT = 6;
const CHAR_FRAME_W = 16;
const CHAR_FRAME_H = 32;
const CHAR_FRAMES_PER_ROW = 7;
const FLOOR_PATTERN_COUNT = 7;
const FLOOR_TILE_SIZE = 16;
const WALL_PIECE_WIDTH = 16;
const WALL_PIECE_HEIGHT = 32;
const WALL_GRID_COLS = 4;
const WALL_BITMASK_COUNT = 16;

function pngToSpriteData(pngBuffer: Buffer, width: number, height: number): string[][] {
  const png = PNG.sync.read(pngBuffer);
  const sprite: string[][] = [];

  for (let y = 0; y < height; y++) {
    const row: string[] = [];
    for (let x = 0; x < width; x++) {
      const idx = (y * png.width + x) * 4;
      const r = png.data[idx];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];
      const a = png.data[idx + 3];

      if (a < 8) {
        row.push('');
      } else {
        row.push(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase());
      }
    }
    sprite.push(row);
  }

  return sprite;
}

function loadFurnitureAssets(): LoadedFurnitureAssets | null {
  const catalogCandidates = [
    join(__dirname, 'assets', 'furniture', 'furniture-catalog.json'),
    join(__dirname, 'dist', 'assets', 'furniture', 'furniture-catalog.json'),
    join(__dirname, 'dist', 'webview', 'assets', 'furniture', 'furniture-catalog.json'),
    join(__dirname, 'webview-ui', 'public', 'assets', 'furniture', 'furniture-catalog.json'),
  ];

  const catalogPath = catalogCandidates.find((p) => existsSync(p));
  if (!catalogPath) {
    console.log('[Pixel Agents] No furniture-catalog.json found, using built-in furniture only');
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(catalogPath, 'utf-8')) as { assets?: FurnitureAsset[] };
    const catalog = Array.isArray(parsed.assets) ? parsed.assets : [];
    const sprites: Record<string, string[][]> = {};

    const furnitureDir = dirname(catalogPath);
    const assetsDir = dirname(furnitureDir);
    const rootDir = dirname(assetsDir);

    for (const asset of catalog) {
      const normalized = asset.file.startsWith('assets/') ? asset.file : `assets/${asset.file}`;
      const fileCandidates = [
        join(rootDir, normalized),
        join(assetsDir, asset.file),
        join(furnitureDir, asset.file),
      ];
      const assetPath = fileCandidates.find((p) => existsSync(p));
      if (!assetPath) continue;

      try {
        sprites[asset.id] = pngToSpriteData(readFileSync(assetPath), asset.width, asset.height);
      } catch (err) {
        console.log(`[Pixel Agents] Failed to load furniture sprite ${asset.id}:`, err);
      }
    }

    const spriteCount = Object.keys(sprites).length;
    console.log(`[Pixel Agents] Furniture assets loaded: ${spriteCount}/${catalog.length} (${catalogPath})`);
    return spriteCount > 0 ? { catalog, sprites } : null;
  } catch (err) {
    console.log('[Pixel Agents] Failed to load furniture catalog:', err);
    return null;
  }
}

function loadCharacterSprites(): LoadedCharacterSprites | null {
  const charDirCandidates = [
    join(__dirname, 'assets', 'characters'),
    join(__dirname, 'dist', 'assets', 'characters'),
    join(__dirname, 'dist', 'webview', 'assets', 'characters'),
    join(__dirname, 'webview-ui', 'public', 'assets', 'characters'),
  ];

  const charDir = charDirCandidates.find((p) => existsSync(p));
  if (!charDir) {
    console.log('[Pixel Agents] No character skin directory found, using built-in character templates');
    return null;
  }

  try {
    const characters: CharacterDirectionSprites[] = [];
    const directions: Array<keyof CharacterDirectionSprites> = ['down', 'up', 'right'];

    for (let ci = 0; ci < CHAR_COUNT; ci++) {
      const filePath = join(charDir, `char_${ci}.png`);
      if (!existsSync(filePath)) {
        console.log(`[Pixel Agents] Missing character skin: ${filePath}. Falling back to built-in templates.`);
        return null;
      }

      const png = PNG.sync.read(readFileSync(filePath));
      const charData: CharacterDirectionSprites = { down: [], up: [], right: [] };

      for (let dirIdx = 0; dirIdx < directions.length; dirIdx++) {
        const dir = directions[dirIdx];
        const rowOffsetY = dirIdx * CHAR_FRAME_H;
        const frames: string[][][] = [];

        for (let frame = 0; frame < CHAR_FRAMES_PER_ROW; frame++) {
          const frameOffsetX = frame * CHAR_FRAME_W;
          const sprite: string[][] = [];

          for (let y = 0; y < CHAR_FRAME_H; y++) {
            const row: string[] = [];
            for (let x = 0; x < CHAR_FRAME_W; x++) {
              const idx = (((rowOffsetY + y) * png.width) + (frameOffsetX + x)) * 4;
              const r = png.data[idx];
              const g = png.data[idx + 1];
              const b = png.data[idx + 2];
              const a = png.data[idx + 3];
              if (a < 128) {
                row.push('');
              } else {
                row.push(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase());
              }
            }
            sprite.push(row);
          }
          frames.push(sprite);
        }

        charData[dir] = frames;
      }

      characters.push(charData);
    }

    console.log(`[Pixel Agents] Character skins loaded: ${characters.length} (${charDir})`);
    return { characters };
  } catch (err) {
    console.log('[Pixel Agents] Failed to load character skins, using built-in templates:', err);
    return null;
  }
}

function extractSpriteFromPng(
  png: { width: number; height: number; data: Buffer | Uint8Array },
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
): string[][] {
  const sprite: string[][] = [];
  for (let y = 0; y < height; y++) {
    const row: string[] = [];
    for (let x = 0; x < width; x++) {
      const px = offsetX + x;
      const py = offsetY + y;
      if (px < 0 || py < 0 || px >= png.width || py >= png.height) {
        row.push('');
        continue;
      }
      const idx = (py * png.width + px) * 4;
      const r = png.data[idx];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];
      const a = png.data[idx + 3];
      if (a < 128) {
        row.push('');
      } else {
        row.push(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase());
      }
    }
    sprite.push(row);
  }
  return sprite;
}

function generateFallbackFloorPatterns(): string[][][] {
  const shades = ['#A7A7A7', '#9A9A9A', '#8C8C8C', '#B5B5B5', '#7E7E7E', '#C2C2C2', '#6F6F6F'];
  const patterns: string[][][] = [];

  for (let p = 0; p < FLOOR_PATTERN_COUNT; p++) {
    const tile: string[][] = [];
    for (let y = 0; y < FLOOR_TILE_SIZE; y++) {
      const row: string[] = [];
      for (let x = 0; x < FLOOR_TILE_SIZE; x++) {
        const v = (x * 13 + y * 17 + p * 29) % 7;
        row.push(shades[v]);
      }
      tile.push(row);
    }
    patterns.push(tile);
  }

  return patterns;
}

function loadFloorSprites(): string[][][] {
  const floorCandidates = [
    join(__dirname, 'assets', 'floors.png'),
    join(__dirname, 'dist', 'assets', 'floors.png'),
    join(__dirname, 'dist', 'webview', 'assets', 'floors.png'),
    join(__dirname, 'webview-ui', 'public', 'assets', 'floors.png'),
  ];
  const floorPath = floorCandidates.find((p) => existsSync(p));
  if (!floorPath) {
    console.log('[Pixel Agents] No floors.png found, using generated fallback floor patterns');
    return generateFallbackFloorPatterns();
  }

  try {
    const png = PNG.sync.read(readFileSync(floorPath));
    const sprites: string[][][] = [];
    for (let t = 0; t < FLOOR_PATTERN_COUNT; t++) {
      const ox = t * FLOOR_TILE_SIZE;
      sprites.push(extractSpriteFromPng(png, ox, 0, FLOOR_TILE_SIZE, FLOOR_TILE_SIZE));
    }
    console.log(`[Pixel Agents] Floor tiles loaded: ${sprites.length} (${floorPath})`);
    return sprites;
  } catch (err) {
    console.log('[Pixel Agents] Failed to load floors.png, using generated fallback floor patterns:', err);
    return generateFallbackFloorPatterns();
  }
}

function loadWallSprites(): string[][][] | null {
  const wallCandidates = [
    join(__dirname, 'assets', 'walls.png'),
    join(__dirname, 'dist', 'assets', 'walls.png'),
    join(__dirname, 'dist', 'webview', 'assets', 'walls.png'),
    join(__dirname, 'webview-ui', 'public', 'assets', 'walls.png'),
  ];
  const wallPath = wallCandidates.find((p) => existsSync(p));
  if (!wallPath) {
    console.log('[Pixel Agents] No walls.png found, using fallback wall rendering');
    return null;
  }

  try {
    const png = PNG.sync.read(readFileSync(wallPath));
    const sprites: string[][][] = [];
    for (let mask = 0; mask < WALL_BITMASK_COUNT; mask++) {
      const ox = (mask % WALL_GRID_COLS) * WALL_PIECE_WIDTH;
      const oy = Math.floor(mask / WALL_GRID_COLS) * WALL_PIECE_HEIGHT;
      sprites.push(extractSpriteFromPng(png, ox, oy, WALL_PIECE_WIDTH, WALL_PIECE_HEIGHT));
    }
    console.log(`[Pixel Agents] Wall tiles loaded: ${sprites.length} (${wallPath})`);
    return sprites;
  } catch (err) {
    console.log('[Pixel Agents] Failed to load walls.png, using fallback wall rendering:', err);
    return null;
  }
}

function layoutNeedsCustomFurniture(layout: any): boolean {
  if (!layout || !Array.isArray(layout.furniture)) return false;
  return layout.furniture.some((item: any) => {
    if (typeof item?.type !== 'string') return false;
    return !BUILTIN_FURNITURE_TYPES.has(item.type);
  });
}

function parseAgentName(sessionKey: string, fallback: string): string {
  const m = /^agent:([^:]+):/.exec(sessionKey);
  return m?.[1] || fallback;
}

function getSessionSources(): Array<{ agentName: string; path: string }> {
  if (SESSIONS_FILE) {
    if (!existsSync(SESSIONS_FILE)) return [];
    return [{ agentName: 'custom', path: SESSIONS_FILE }];
  }

  if (!existsSync(AGENTS_ROOT)) return [];

  const sources: Array<{ agentName: string; path: string }> = [];
  for (const entry of readdirSync(AGENTS_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(AGENTS_ROOT, entry.name, 'sessions', 'sessions.json');
    if (existsSync(path)) {
      sources.push({ agentName: entry.name, path });
    }
  }
  return sources;
}

function loadSessionsFromSource(agentName: string, path: string): SessionSnapshot[] {
  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, SessionData>;
    const snapshots: SessionSnapshot[] = [];

    for (const [sessionKey, data] of Object.entries(parsed)) {
      if (!data || typeof data.sessionId !== 'string') continue;
      const sourceAgentName = parseAgentName(sessionKey, agentName);
      snapshots.push({
        sessionKey,
        sourceAgentName,
        data,
      });
    }
    return snapshots;
  } catch (error) {
    console.log(`[Pixel Agents] Failed reading sessions source ${path}:`, error);
    return [];
  }
}

function aggregateByAgent(sessions: SessionSnapshot[]): Map<string, AgentAggregate> {
  const byAgent = new Map<string, AgentAggregate>();
  const now = Date.now();

  for (const session of sessions) {
    const info = session.data;
    const channel = info.deliveryContext?.channel || info.origin?.provider || 'unknown';
    const updatedAt = typeof info.updatedAt === 'number' ? info.updatedAt : 0;
    const isRecent = (now - updatedAt) < 5 * 60 * 1000;
    const isActive = info.chatType !== 'system' && isRecent;
    let agg = byAgent.get(session.sourceAgentName);

    if (!agg) {
      agg = {
        agentName: session.sourceAgentName,
        sessionCount: 0,
        activeSessionCount: 0,
        latestUpdatedAt: 0,
        primarySessionId: info.sessionId,
        primarySessionKey: session.sessionKey,
        primaryChannel: channel,
      };
      byAgent.set(session.sourceAgentName, agg);
    }

    agg.sessionCount++;
    if (isActive) agg.activeSessionCount++;

    if (updatedAt >= agg.latestUpdatedAt) {
      agg.latestUpdatedAt = updatedAt;
      agg.primarySessionId = info.sessionId;
      agg.primarySessionKey = session.sessionKey;
      agg.primaryChannel = channel;
    }
  }

  return byAgent;
}

const loadedFurnitureAssets = loadFurnitureAssets();
const loadedCharacterSprites = loadCharacterSprites();
const loadedFloorSprites = loadFloorSprites();
const loadedWallSprites = loadWallSprites();

const app = express();
let clients: Set<express.Response> = new Set();
let agents: Map<string, AgentInfo> = new Map();
let nextAgentId = 1;

// CORS headers for SSE
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Cache-Control');
  next();
});

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  clients.add(res);
  console.log(`[Pixel Agents] Client connected. Total: ${clients.size}`);

  // Send furniture assets first so layout can resolve ASSET_* item types
  if (loadedFurnitureAssets) {
    res.write(`data: ${JSON.stringify({
      type: 'furnitureAssetsLoaded',
      catalog: loadedFurnitureAssets.catalog,
      sprites: loadedFurnitureAssets.sprites,
    })}\n\n`);
    console.log(`[Pixel Agents] Sending furnitureAssetsLoaded (${loadedFurnitureAssets.catalog.length} assets)`);
  }

  // If bundled layout references custom furniture but catalog is missing,
  // fall back to built-in default layout generated by the client.
  const needsCustomFurniture = layoutNeedsCustomFurniture(defaultLayout);
  const shouldFallbackToBuiltinLayout = needsCustomFurniture && !loadedFurnitureAssets;
  if (shouldFallbackToBuiltinLayout) {
    console.log('[Pixel Agents] Bundled layout needs custom assets; fallback to built-in default layout');
  }

  const layoutMsg = {
    type: 'layoutLoaded',
    layout: shouldFallbackToBuiltinLayout ? null : defaultLayout,
  };
  console.log('[Pixel Agents] Sending layoutLoaded');
  res.write(`data: ${JSON.stringify(layoutMsg)}\n\n`);

  // Send character skins when available; webview falls back to built-in templates otherwise.
  if (loadedCharacterSprites) {
    res.write(`data: ${JSON.stringify({ type: 'characterSpritesLoaded', characters: loadedCharacterSprites.characters })}\n\n`);
    console.log(`[Pixel Agents] Sending characterSpritesLoaded (${loadedCharacterSprites.characters.length} skins)`);
  } else {
    res.write(`data: ${JSON.stringify({ type: 'characterSpritesLoaded' })}\n\n`);
  }
  
  // Send floor tile sprites
  res.write(`data: ${JSON.stringify({ type: 'floorTilesLoaded', sprites: loadedFloorSprites })}\n\n`);
  console.log(`[Pixel Agents] Sending floorTilesLoaded (${loadedFloorSprites.length} patterns)`);
  
  // Send wall tile sprites when available
  if (loadedWallSprites) {
    res.write(`data: ${JSON.stringify({ type: 'wallTilesLoaded', sprites: loadedWallSprites })}\n\n`);
    console.log(`[Pixel Agents] Sending wallTilesLoaded (${loadedWallSprites.length} pieces)`);
  } else {
    res.write(`data: ${JSON.stringify({ type: 'wallTilesLoaded' })}\n\n`);
  }

  // Send existing agents - webview expects array of numbers
  const currentAgents = Array.from(agents.values());
  const agentIds = currentAgents.map(a => a.id);
  const agentMeta = Object.fromEntries(currentAgents.map((a) => [
    a.id,
    { palette: a.palette, hueShift: 0, seatId: null }
  ]));
  console.log(`[Pixel Agents] Sending existingAgents: ${agentIds.length} agents`);
  res.write(`data: ${JSON.stringify({ type: 'existingAgents', agents: agentIds, agentMeta })}\n\n`);

  // Send a ping to keep connection alive
  const pingInterval = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`);
  }, 10000);

  req.on('close', () => {
    clearInterval(pingInterval);
    clients.delete(res);
    console.log(`[Pixel Agents] Client disconnected. Total: ${clients.size}`);
  });
});

// API to get current agents
app.get('/api/agents', (req, res) => {
  res.json(Array.from(agents.values()));
});

// Broadcast to all connected clients
function broadcast(message: any): void {
  const data = `data: ${JSON.stringify(message)}\n\n`;
  for (const client of clients) {
    client.write(data);
  }
}

// Poll OpenClaw sessions and aggregate to one character per OpenClaw agent
function pollSessions(): void {
  try {
    const sources = getSessionSources();
    if (sources.length === 0) {
      return;
    }

    const allSessions = sources.flatMap((src) => loadSessionsFromSource(src.agentName, src.path));
    const byAgent = aggregateByAgent(allSessions);
    const currentKeys = new Set(byAgent.keys());

    // Remove agents for missing OpenClaw agent names
    for (const [key, agent] of agents) {
      if (!currentKeys.has(key)) {
        agents.delete(key);
        broadcast({ type: 'agentClosed', id: agent.id });
      }
    }

    // Create/update one character per OpenClaw agent (not per session)
    for (const [key, agg] of byAgent) {
      let agent = agents.get(key);
      const status = agg.activeSessionCount > 0 ? 'active' : 'idle';
      const channel = agg.primaryChannel;
      const currentTask = `Agent ${agg.agentName}: ${agg.activeSessionCount}/${agg.sessionCount} active (${channel})`;

      if (!agent) {
        const palette = (nextAgentId - 1) % 6; // Cycle through 6 palettes
        agent = {
          id: nextAgentId++,
          agentName: agg.agentName,
          sessionKey: agg.primarySessionKey,
          sessionId: agg.primarySessionId,
          sessionCount: agg.sessionCount,
          activeSessionCount: agg.activeSessionCount,
          model: 'MiniMax-M2.5',
          status,
          currentTask,
          channel,
          palette,
        };
        agents.set(key, agent);
        
        console.log(`[Pixel Agents] Creating character ${agent.id} for OpenClaw agent "${agg.agentName}" (${agg.sessionCount} sessions)`);
        
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
        agent.agentName = agg.agentName;
        agent.sessionKey = agg.primarySessionKey;
        agent.sessionId = agg.primarySessionId;
        agent.sessionCount = agg.sessionCount;
        agent.activeSessionCount = agg.activeSessionCount;
        agent.channel = channel;
        agent.currentTask = currentTask;

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
    console.log('[Pixel Agents] Polling error:', error);
  }
}

// Start polling every 2 seconds
setInterval(pollSessions, 2000);
pollSessions(); // Initial poll

// Start server
const server = app.listen(PORT, () => {
  console.log(`[Pixel Agents] Server running at http://localhost:${PORT}`);
  if (SESSIONS_FILE) {
    console.log(`[Pixel Agents] Reading sessions from override: ${SESSIONS_FILE}`);
  } else {
    console.log(`[Pixel Agents] Reading sessions from all OpenClaw agents under: ${AGENTS_ROOT}`);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Pixel Agents] Shutting down...');
  server.close(() => process.exit(0));
});
