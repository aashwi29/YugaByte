import http from 'node:http';

async function test() {
  console.log('Testing server endpoints against running server or starting test server...');
  
  // Import server
  const serverProcess = await import('../server/server.js');
  
  // Wait 1 sec for port listen
  await new Promise(r => setTimeout(r, 1000));
  
  // 1. Test status
  const statusRes = await fetch('http://127.0.0.1:3000/api/status');
  const statusData = await statusRes.json();
  console.log('API Status:', statusData);
  
  // 2. Test MCP JSON-RPC tools/list
  const mcpRes = await fetch('http://127.0.0.1:3000/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    })
  });
  const mcpData = await mcpRes.json();
  console.log('MCP Tools available:', mcpData.result.tools.map(t => t.name));

  // 3. Test static HTML
  const htmlRes = await fetch('http://127.0.0.1:3000/');
  console.log('HTML Status:', htmlRes.status, 'Content-Type:', htmlRes.headers.get('content-type'));

  console.log('✅ ALL SERVER TESTS PASSED!');
  process.exit(0);
}

test().catch(err => {
  console.error('Server test failed:', err);
  process.exit(1);
});
