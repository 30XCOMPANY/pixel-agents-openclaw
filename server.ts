// Simple HTTP Server with SSE for Pixel Agents OpenClaw
// Reads sessions from OpenClaw agent session sources

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { PNG } from 'pngjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3456;
const AGENTS_ROOT = join(homedir(), '.openclaw', 'agents');
const SESSIONS_FILE = process.env.SESSIONS_FILE || null;
const LAYOUT_TEMPLATE = (process.env.LAYOUT_TEMPLATE || 'severance').trim();

function tryReadJson(path: string): any | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (e) {
    console.log(`[Pixel Agents] Failed to parse JSON: ${path}`, e);
    return null;
  }
}

function loadLayoutTemplate(templateId: string): { layout: any | null; source: string | null } {
  const templateCandidates = [
    join(__dirname, 'dist', 'webview', 'assets', 'layouts', `${templateId}.json`),
    join(__dirname, 'webview-ui', 'public', 'assets', 'layouts', `${templateId}.json`),
  ];

  for (const path of templateCandidates) {
    const layout = tryReadJson(path);
    if (layout) return { layout, source: path };
  }
  return { layout: null, source: null };
}

function loadDefaultLayout(): { layout: any | null; source: string | null; template: string } {
  if (LAYOUT_TEMPLATE) {
    const fromTemplate = loadLayoutTemplate(LAYOUT_TEMPLATE);
    if (fromTemplate.layout) {
      return { layout: fromTemplate.layout, source: fromTemplate.source, template: LAYOUT_TEMPLATE };
    }
    console.log(`[Pixel Agents] Layout template not found: "${LAYOUT_TEMPLATE}", falling back to default-layout.json`);
  }

  const fallbackCandidates = [
    join(__dirname, 'dist', 'webview', 'assets', 'default-layout.json'),
    join(__dirname, 'webview-ui', 'public', 'assets', 'default-layout.json'),
  ];
  for (const path of fallbackCandidates) {
    const layout = tryReadJson(path);
    if (layout) {
      return { layout, source: path, template: 'default-layout' };
    }
  }
  return { layout: null, source: null, template: 'none' };
}

const defaultLayoutInfo = loadDefaultLayout();
let currentLayout = defaultLayoutInfo.layout;
if (defaultLayoutInfo.source) {
  console.log(`[Pixel Agents] Loaded layout template "${defaultLayoutInfo.template}" from ${defaultLayoutInfo.source}`);
} else {
  console.log('[Pixel Agents] No default layout file found; webview will use built-in fallback layout');
}

function getLayoutSaveTargets(): string[] {
  const targets = [
    join(__dirname, 'webview-ui', 'public', 'assets', 'default-layout.json'),
    join(__dirname, 'dist', 'webview', 'assets', 'default-layout.json'),
  ];

  if (defaultLayoutInfo.source) {
    targets.push(defaultLayoutInfo.source);
  }

  if (defaultLayoutInfo.template && defaultLayoutInfo.template !== 'default-layout' && defaultLayoutInfo.template !== 'none') {
    targets.push(
      join(__dirname, 'webview-ui', 'public', 'assets', 'layouts', `${defaultLayoutInfo.template}.json`),
      join(__dirname, 'dist', 'webview', 'assets', 'layouts', `${defaultLayoutInfo.template}.json`),
    );
  }

  return Array.from(new Set(targets));
}

function saveLayoutToDisk(layout: any): string[] {
  const payload = JSON.stringify(layout, null, 2);
  const targets = getLayoutSaveTargets();
  const saved: string[] = [];
  for (const target of targets) {
    try {
      writeFileSync(target, payload, 'utf-8');
      saved.push(target);
    } catch (err) {
      console.log(`[Pixel Agents] Failed to write layout: ${target}`, err);
    }
  }
  return saved;
}

interface SessionData {
  sessionId: string;
  updatedAt: number;
  chatType?: string;
  channel?: string;
  groupActivation?: string;
  abortedLastRun?: boolean;
  lastHeartbeatText?: string;
  deliveryContext?: {
    channel?: string;
  };
  origin?: {
    provider?: string;
    from?: string;
  };
}

interface SessionSummary {
  sessionId: string;
  sessionKey: string;
  updatedAt: number;
  channel: string;
  chatType: string;
  isActive: boolean;
  isMentionStandby: boolean;
  isApprovalWait: boolean;
  hasError: boolean;
}

interface AgentInfo {
  id: number;
  agentName: string;
  sessionKey: string;
  sessionId: string;
  sessionCount: number;
  activeSessionCount: number;
  mentionStandbyCount: number;
  approvalWaitCount: number;
  errorCount: number;
  sessionSummaries: SessionSummary[];
  model: string;
  status: string;
  currentTask: string;
  channel?: string;
  palette?: number;
  snapshotSignature?: string;
}

interface EventContext {
  agentId?: number;
  sessionId?: string;
  agentName?: string;
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
  mentionStandbyCount: number;
  approvalWaitCount: number;
  errorCount: number;
  sessions: SessionSummary[];
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
    const channel = info.deliveryContext?.channel || info.channel || info.origin?.provider || 'unknown';
    const updatedAt = typeof info.updatedAt === 'number' ? info.updatedAt : 0;
    const chatType = typeof info.chatType === 'string' ? info.chatType : 'unknown';
    const isRecent = (now - updatedAt) < 5 * 60 * 1000;
    const isInteractiveType = chatType === 'direct' || chatType === 'channel' || chatType === 'group';
    const isActive = isInteractiveType && isRecent;
    const isMentionStandby = info.groupActivation === 'mention';
    const isApprovalWait = info.abortedLastRun === true;
    const hasError = typeof info.lastHeartbeatText === 'string'
      && info.lastHeartbeatText.trim().length > 0
      && info.lastHeartbeatText.toLowerCase().includes('rejected');
    const summary: SessionSummary = {
      sessionId: info.sessionId,
      sessionKey: session.sessionKey,
      updatedAt,
      channel,
      chatType,
      isActive,
      isMentionStandby,
      isApprovalWait,
      hasError,
    };
    let agg = byAgent.get(session.sourceAgentName);

    if (!agg) {
      agg = {
        agentName: session.sourceAgentName,
        sessionCount: 0,
        activeSessionCount: 0,
        mentionStandbyCount: 0,
        approvalWaitCount: 0,
        errorCount: 0,
        sessions: [],
        latestUpdatedAt: 0,
        primarySessionId: info.sessionId,
        primarySessionKey: session.sessionKey,
        primaryChannel: channel,
      };
      byAgent.set(session.sourceAgentName, agg);
    }

    agg.sessionCount++;
    if (isActive) agg.activeSessionCount++;
    if (isMentionStandby) agg.mentionStandbyCount++;
    if (isApprovalWait) agg.approvalWaitCount++;
    if (hasError) agg.errorCount++;
    agg.sessions.push(summary);

    if (updatedAt >= agg.latestUpdatedAt) {
      agg.latestUpdatedAt = updatedAt;
      agg.primarySessionId = info.sessionId;
      agg.primarySessionKey = session.sessionKey;
      agg.primaryChannel = channel;
    }
  }

  for (const agg of byAgent.values()) {
    agg.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
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
let nextEventSeq = 1;

function buildEventPayload(message: Record<string, unknown>, context?: EventContext): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ...message,
    event_id: `evt_${Date.now()}_${nextEventSeq++}`,
    timestamp: Date.now(),
  };
  if (typeof context?.agentId === 'number') payload.agent_id = context.agentId;
  if (typeof context?.sessionId === 'string' && context.sessionId.length > 0) payload.session_id = context.sessionId;
  if (typeof context?.agentName === 'string' && context.agentName.length > 0) payload.agent_name = context.agentName;
  return payload;
}

function writeSse(
  res: express.Response,
  message: Record<string, unknown>,
  context?: EventContext,
): void {
  res.write(`data: ${JSON.stringify(buildEventPayload(message, context))}\n\n`);
}

function findAgentById(id: number): AgentInfo | null {
  for (const agent of agents.values()) {
    if (agent.id === id) return agent;
  }
  return null;
}

function buildSessionsDigest(sessions: SessionSummary[]): string {
  return sessions
    .map((s) => [
      s.sessionId,
      s.updatedAt,
      s.channel,
      s.chatType,
      s.isActive ? 1 : 0,
      s.isMentionStandby ? 1 : 0,
      s.isApprovalWait ? 1 : 0,
      s.hasError ? 1 : 0,
    ].join(':'))
    .join('|');
}

function buildAgentSnapshotSignature(agent: AgentInfo): string {
  return [
    agent.agentName,
    agent.sessionId,
    String(agent.sessionCount),
    String(agent.activeSessionCount),
    String(agent.mentionStandbyCount),
    String(agent.approvalWaitCount),
    String(agent.errorCount),
    agent.channel || '',
    agent.currentTask,
    agent.status,
    buildSessionsDigest(agent.sessionSummaries),
  ].join('|');
}

function buildAgentSnapshotMessage(agent: AgentInfo): Record<string, unknown> {
  return {
    type: 'agentSnapshot',
    id: agent.id,
    agentName: agent.agentName,
    sessionId: agent.sessionId,
    sessionCount: agent.sessionCount,
    activeSessionCount: agent.activeSessionCount,
    mentionStandbyCount: agent.mentionStandbyCount,
    approvalWaitCount: agent.approvalWaitCount,
    errorCount: agent.errorCount,
    channel: agent.channel || 'unknown',
    currentTask: agent.currentTask,
    status: agent.status,
    sessions: agent.sessionSummaries,
  };
}

function broadcastAgentSnapshot(agent: AgentInfo): void {
  broadcast(buildAgentSnapshotMessage(agent), {
    agentId: agent.id,
    sessionId: agent.sessionId,
    agentName: agent.agentName,
  });
}

// CORS headers for SSE
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Cache-Control');
  next();
});
app.use(express.json({ limit: '5mb' }));

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
    writeSse(res, {
      type: 'furnitureAssetsLoaded',
      catalog: loadedFurnitureAssets.catalog,
      sprites: loadedFurnitureAssets.sprites,
    });
    console.log(`[Pixel Agents] Sending furnitureAssetsLoaded (${loadedFurnitureAssets.catalog.length} assets)`);
  }

  // If bundled layout references custom furniture but catalog is missing,
  // fall back to built-in default layout generated by the client.
  const needsCustomFurniture = layoutNeedsCustomFurniture(currentLayout);
  const shouldFallbackToBuiltinLayout = needsCustomFurniture && !loadedFurnitureAssets;
  if (shouldFallbackToBuiltinLayout) {
    console.log('[Pixel Agents] Bundled layout needs custom assets; fallback to built-in default layout');
  }

  const layoutMsg = {
    type: 'layoutLoaded',
    layout: shouldFallbackToBuiltinLayout ? null : currentLayout,
  };
  console.log('[Pixel Agents] Sending layoutLoaded');
  writeSse(res, layoutMsg);

  // Send settings
  writeSse(res, { type: 'settingsLoaded', soundEnabled: true });
  console.log('[Pixel Agents] Sending settingsLoaded');

  // Send character skins when available; webview falls back to built-in templates otherwise.
  if (loadedCharacterSprites) {
    writeSse(res, { type: 'characterSpritesLoaded', characters: loadedCharacterSprites.characters });
    console.log(`[Pixel Agents] Sending characterSpritesLoaded (${loadedCharacterSprites.characters.length} skins)`);
  } else {
    writeSse(res, { type: 'characterSpritesLoaded' });
  }
  
  // Send floor tile sprites
  writeSse(res, { type: 'floorTilesLoaded', sprites: loadedFloorSprites });
  console.log(`[Pixel Agents] Sending floorTilesLoaded (${loadedFloorSprites.length} patterns)`);
  
  // Send wall tile sprites when available
  if (loadedWallSprites) {
    writeSse(res, { type: 'wallTilesLoaded', sprites: loadedWallSprites });
    console.log(`[Pixel Agents] Sending wallTilesLoaded (${loadedWallSprites.length} pieces)`);
  } else {
    writeSse(res, { type: 'wallTilesLoaded' });
  }

  // Send existing agents - webview expects array of numbers
  const currentAgents = Array.from(agents.values());
  const agentIds = currentAgents.map(a => a.id);
  const agentMeta = Object.fromEntries(currentAgents.map((a) => [
    a.id,
    {
      palette: a.palette,
      hueShift: 0,
      seatId: null,
      agentName: a.agentName,
      sessionId: a.sessionId,
      sessionCount: a.sessionCount,
      activeSessionCount: a.activeSessionCount,
      mentionStandbyCount: a.mentionStandbyCount,
      approvalWaitCount: a.approvalWaitCount,
      errorCount: a.errorCount,
      channel: a.channel || 'unknown',
      currentTask: a.currentTask,
      status: a.status,
      sessions: a.sessionSummaries,
    }
  ]));
  console.log(`[Pixel Agents] Sending existingAgents: ${agentIds.length} agents`);
  writeSse(res, { type: 'existingAgents', agents: agentIds, agentMeta });
  for (const agent of currentAgents) {
    writeSse(res, buildAgentSnapshotMessage(agent), {
      agentId: agent.id,
      sessionId: agent.sessionId,
      agentName: agent.agentName,
    });
  }

  // Send a ping to keep connection alive
  const pingInterval = setInterval(() => {
    writeSse(res, { type: 'ping' });
  }, 10000);

  req.on('close', () => {
    clearInterval(pingInterval);
    clients.delete(res);
    console.log(`[Pixel Agents] Client disconnected. Total: ${clients.size}`);
  });
});

app.post('/api/message', (req, res) => {
  const msg = req.body as { type?: string; [key: string]: any };
  if (!msg || typeof msg.type !== 'string') {
    res.status(400).json({ ok: false, error: 'invalid message' });
    return;
  }

  if (msg.type === 'saveLayout') {
    const layout = msg.layout;
    const valid = layout
      && layout.version === 1
      && Array.isArray(layout.tiles)
      && Array.isArray(layout.furniture)
      && typeof layout.cols === 'number'
      && typeof layout.rows === 'number';
    if (!valid) {
      res.status(400).json({ ok: false, error: 'invalid layout' });
      return;
    }

    currentLayout = layout;
    const savedPaths = saveLayoutToDisk(layout);
    console.log(`[Pixel Agents] Layout saved (${savedPaths.length} targets)`);
    res.json({ ok: true, savedPaths });
    return;
  }

  if (msg.type === 'focusAgent') {
    const id = Number(msg.id);
    if (!Number.isNaN(id)) {
      const agent = findAgentById(id);
      broadcast({ type: 'agentSelected', id }, {
        agentId: id,
        sessionId: agent?.sessionId,
        agentName: agent?.agentName,
      });
    }
    res.json({ ok: true });
    return;
  }

  if (msg.type === 'closeAgent') {
    const id = Number(msg.id);
    if (!Number.isNaN(id)) {
      for (const [key, agent] of agents) {
        if (agent.id !== id) continue;
        agents.delete(key);
        broadcast({ type: 'agentClosed', id }, {
          agentId: id,
          sessionId: agent.sessionId,
          agentName: agent.agentName,
        });
        break;
      }
    }
    res.json({ ok: true });
    return;
  }

  // Browser mode compatibility: accept-and-ignore unsupported extension commands.
  res.json({ ok: true, ignored: true });
});

// API to get current agents
app.get('/api/agents', (req, res) => {
  res.json(Array.from(agents.values()));
});

// Broadcast to all connected clients
function broadcast(message: Record<string, unknown>, context?: EventContext): void {
  const data = `data: ${JSON.stringify(buildEventPayload(message, context))}\n\n`;
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
        broadcast({ type: 'agentClosed', id: agent.id }, {
          agentId: agent.id,
          sessionId: agent.sessionId,
          agentName: agent.agentName,
        });
      }
    }

    // Create/update one character per OpenClaw agent (not per session)
    for (const [key, agg] of byAgent) {
      let agent = agents.get(key);
      const status = agg.activeSessionCount > 0
        ? 'active'
        : (agg.approvalWaitCount > 0 ? 'waiting' : 'idle');
      const channel = agg.primaryChannel;
      const standby = agg.mentionStandbyCount > 0 ? `, ${agg.mentionStandbyCount} mention-only` : '';
      const approval = agg.approvalWaitCount > 0 ? `, ${agg.approvalWaitCount} approval-wait` : '';
      const currentTask = `Agent ${agg.agentName}: ${agg.activeSessionCount}/${agg.sessionCount} active${standby}${approval} (${channel})`;

      if (!agent) {
        const palette = (nextAgentId - 1) % 6; // Cycle through 6 palettes
        agent = {
          id: nextAgentId++,
          agentName: agg.agentName,
          sessionKey: agg.primarySessionKey,
          sessionId: agg.primarySessionId,
          sessionCount: agg.sessionCount,
          activeSessionCount: agg.activeSessionCount,
          mentionStandbyCount: agg.mentionStandbyCount,
          approvalWaitCount: agg.approvalWaitCount,
          errorCount: agg.errorCount,
          sessionSummaries: agg.sessions,
          model: 'MiniMax-M2.5',
          status,
          currentTask,
          channel,
          palette,
        };
        agent.snapshotSignature = buildAgentSnapshotSignature(agent);
        agents.set(key, agent);
        
        console.log(`[Pixel Agents] Creating character ${agent.id} for OpenClaw agent "${agg.agentName}" (${agg.sessionCount} sessions)`);
        
        // Send agent created
        broadcast({ 
          type: 'agentCreated', 
          id: agent.id,
          palette: agent.palette,
          hueShift: 0,
          seatId: null,
          status: agent.status,
          agentName: agent.agentName,
          sessionId: agent.sessionId,
          sessionCount: agent.sessionCount,
          activeSessionCount: agent.activeSessionCount,
          mentionStandbyCount: agent.mentionStandbyCount,
          approvalWaitCount: agent.approvalWaitCount,
          errorCount: agent.errorCount,
          channel: agent.channel || 'unknown',
          currentTask: agent.currentTask,
          sessions: agent.sessionSummaries,
        }, {
          agentId: agent.id,
          sessionId: agent.sessionId,
          agentName: agent.agentName,
        });
        broadcastAgentSnapshot(agent);
      } else {
        const prevSnapshotSignature = agent.snapshotSignature || '';
        agent.agentName = agg.agentName;
        agent.sessionKey = agg.primarySessionKey;
        agent.sessionId = agg.primarySessionId;
        agent.sessionCount = agg.sessionCount;
        agent.activeSessionCount = agg.activeSessionCount;
        agent.mentionStandbyCount = agg.mentionStandbyCount;
        agent.approvalWaitCount = agg.approvalWaitCount;
        agent.errorCount = agg.errorCount;
        agent.sessionSummaries = agg.sessions;
        agent.channel = channel;
        agent.currentTask = currentTask;

        // Update existing - send status changes
        if (agent.status !== status) {
          agent.status = status;
          broadcast({ type: 'agentStatus', id: agent.id, status }, {
            agentId: agent.id,
            sessionId: agent.sessionId,
            agentName: agent.agentName,
          });
          
          if (status !== 'active') {
            // Clear tools when not active
            broadcast({ type: 'agentToolsClear', id: agent.id }, {
              agentId: agent.id,
              sessionId: agent.sessionId,
              agentName: agent.agentName,
            });
          }
        }

        const nextSnapshotSignature = buildAgentSnapshotSignature(agent);
        if (nextSnapshotSignature !== prevSnapshotSignature) {
          agent.snapshotSignature = nextSnapshotSignature;
          broadcastAgentSnapshot(agent);
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
  console.log(`[Pixel Agents] Active layout template: ${defaultLayoutInfo.template}`);
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
