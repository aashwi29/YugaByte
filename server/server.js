import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MekoEngine } from './meko_engine.js';
import { SwarmService } from './swarm_service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');

const PORT = process.env.PORT || 3000;

// Initialize Meko Engine and Swarm Service
const meko = new MekoEngine({
  logsPath: path.join(projectRoot, 'logs', 'meko_calls.jsonl'),
  dataPath: path.join(projectRoot, 'data', 'meko_store.json')
});

const swarm = new SwarmService(meko);

// Initialize baseline data
await meko.seedBaseline();

// SSE Connected Clients
const sseClients = new Set();

meko.on('meko_call', (entry) => {
  const data = JSON.stringify({ type: 'meko_call', entry });
  for (const client of sseClients) {
    try {
      client.write(`data: ${data}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
});

// Helper for MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Enable CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  try {
    // 1. SSE Stream: Live Meko calls and Swarm updates
    if (pathname === '/api/stream' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(': connected\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // 2. REST API Endpoints
    if (pathname === '/api/status' && req.method === 'GET') {
      return sendJson(res, 200, {
        status: 'running',
        mcp_connected: true,
        calls_count: meko.getCallLogs().length,
        datapacks: Array.from(meko.memoryStore.keys()),
        tickets_count: swarm.getAllTickets().length,
        pending_promotions: swarm.getPendingPromotions().length
      });
    }

    if (pathname === '/api/logs' && req.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '100', 10);
      return sendJson(res, 200, {
        logs: meko.getCallLogs(limit)
      });
    }

    if (pathname === '/api/grievance' && req.method === 'POST') {
      const body = await parseBody(req);
      const ticket = await swarm.handleNewGrievance(body);
      return sendJson(res, 201, { success: true, ticket });
    }

    if (pathname === '/api/tickets' && req.method === 'GET') {
      return sendJson(res, 200, {
        tickets: swarm.getAllTickets()
      });
    }

    if (pathname === '/api/resolve' && req.method === 'POST') {
      const body = await parseBody(req);
      const result = await swarm.resolveGrievance(body);
      return sendJson(res, 200, { success: true, ...result });
    }

    if (pathname === '/api/promotions' && req.method === 'GET') {
      return sendJson(res, 200, {
        pending_promotions: swarm.getPendingPromotions()
      });
    }

    if (pathname === '/api/promote' && req.method === 'POST') {
      const body = await parseBody(req);
      const result = await swarm.approveCanonPromotion(body);
      return sendJson(res, 200, { success: true, ...result });
    }

    if (pathname === '/api/dean' && req.method === 'GET') {
      const q = url.searchParams.get('q') || 'hostel electrical heating maintenance';
      const result = await swarm.dean.getCampusCanonIntelligence(q);
      return sendJson(res, 200, result);
    }

    // Scenarios for judging / live demo
    if (pathname === '/api/scenario/case-a' && req.method === 'POST') {
      const ticket = await swarm.runCaseA();
      return sendJson(res, 200, {
        message: 'Case A started: Student Riya submitted geyser tripping grievance.',
        ticket
      });
    }

    if (pathname === '/api/scenario/case-b' && req.method === 'POST') {
      const body = await parseBody(req);
      const useMeko = body.useMeko !== false; // default true
      const ticket = await swarm.runCaseB({ useMeko });
      return sendJson(res, 200, {
        message: `Case B executed with Meko ${useMeko ? 'ON (Recalled institutional context)' : 'OFF (Siloed helpdesk)'}`,
        ticket
      });
    }

    if (pathname === '/api/reset' && req.method === 'POST') {
      meko.resetAll();
      await meko.seedBaseline();
      swarm.tickets.clear();
      swarm.pendingPromotions.clear();
      return sendJson(res, 200, {
        success: true,
        message: 'Store reset and baseline re-seeded.'
      });
    }

    // Standard MCP JSON-RPC protocol endpoint (tools/list & tools/call)
    if (pathname === '/mcp' && req.method === 'POST') {
      const body = await parseBody(req);
      const { id, method, params } = body;

      if (method === 'tools/list') {
        return sendJson(res, 200, {
          jsonrpc: '2.0',
          id,
          result: {
            tools: [
              {
                name: 'memory_add',
                description: 'Add a memory or ticket update to a Meko datapack',
                inputSchema: {
                  type: 'object',
                  properties: {
                    datapack_id: { type: 'string' },
                    content: { type: 'string' },
                    agent: { type: 'string' }
                  },
                  required: ['datapack_id', 'content', 'agent']
                }
              },
              {
                name: 'memory_search',
                description: 'Search memories inside a Meko datapack',
                inputSchema: {
                  type: 'object',
                  properties: {
                    datapack_id: { type: 'string' },
                    query: { type: 'string' },
                    agent: { type: 'string' }
                  },
                  required: ['datapack_id', 'query', 'agent']
                }
              },
              {
                name: 'memory_promote',
                description: 'Promote a verified memory to campus-canon with human approval',
                inputSchema: {
                  type: 'object',
                  properties: {
                    source_datapack_id: { type: 'string' },
                    memory_id: { type: 'string' },
                    human_approver: { type: 'string' },
                    agent: { type: 'string' }
                  },
                  required: ['source_datapack_id', 'memory_id', 'human_approver', 'agent']
                }
              },
              {
                name: 'knowledgebase_search',
                description: 'Search verified canon memories in campus-canon',
                inputSchema: {
                  type: 'object',
                  properties: {
                    query: { type: 'string' },
                    agent: { type: 'string' }
                  },
                  required: ['query', 'agent']
                }
              }
            ]
          }
        });
      }

      if (method === 'tools/call') {
        const { name, arguments: args } = params;
        let toolResult;
        if (name === 'memory_add') {
          toolResult = await meko.memory_add(args);
        } else if (name === 'memory_search') {
          toolResult = await meko.memory_search(args);
        } else if (name === 'memory_promote') {
          toolResult = await meko.memory_promote(args);
        } else if (name === 'knowledgebase_search') {
          toolResult = await meko.knowledgebase_search(args);
        } else {
          return sendJson(res, 400, {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Tool not found: ${name}` }
          });
        }
        return sendJson(res, 200, {
          jsonrpc: '2.0',
          id,
          result: toolResult
        });
      }

      return sendJson(res, 400, {
        jsonrpc: '2.0',
        id,
        error: { code: -32600, message: 'Invalid Request' }
      });
    }

    // 3. Static File Serving
    let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '\\') safePath = '/index.html';
    const filePath = path.join(publicDir, safePath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      return fs.createReadStream(filePath).pipe(res);
    }

    // 404 Not Found
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  } catch (err) {
    console.error('Server error handling request:', err);
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Campus Grievance Swarm Server Running`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`⚡ Meko Call Log: logs/meko_calls.jsonl`);
  console.log(`🔗 MCP Endpoint: http://localhost:${PORT}/mcp`);
  console.log(`📡 SSE Live Stream: http://localhost:${PORT}/api/stream`);
  console.log(`=======================================================`);
});
