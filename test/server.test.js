const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const http = require('node:http');
const { createServer } = require('../server');

let hubServer;
let appServer;
let appUrl;
let received;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

before(async () => {
  hubServer = http.createServer((request, response) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { raw += chunk; });
    request.on('end', () => {
      if (request.method === 'POST') received = { path: request.url, body: JSON.parse(raw) };
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(request.method === 'GET' ? [] : { ok: true }));
    });
  });
  const hubPort = await listen(hubServer);
  appServer = createServer({ eventManagerUrl: `http://127.0.0.1:${hubPort}` });
  const appPort = await listen(appServer);
  appUrl = `http://127.0.0.1:${appPort}`;
});

after(async () => {
  await close(appServer);
  await close(hubServer);
});

test('sirve la página principal', async () => {
  const response = await fetch(appUrl);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /CineLibro/);
});

test('sirve la hoja de estilos del tema claro', async () => {
  const response = await fetch(`${appUrl}/light-theme.css`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /color-scheme:\s*light/);
});

test('consulta el historial por el proxy', async () => {
  const response = await fetch(`${appUrl}/api/events`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});

test('reenvía POST /api/events como POST /events sin cambiar el contrato', async () => {
  const event = {
    source: 'crud-maye',
    entity: 'pelicula',
    action: 'CREATE',
    title: 'Película creada',
    description: 'Se registró una nueva película',
    payload: { id: 'pelicula-1', titulo: 'Interestelar' },
  };
  const response = await fetch(`${appUrl}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(received, { path: '/events', body: event });
});
