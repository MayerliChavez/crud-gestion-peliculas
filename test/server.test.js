const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const http = require('node:http');
const { createServer } = require('../server');

let hub;
let app;
let baseUrl;
let lastEvent;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

before(async () => {
  hub = http.createServer((request, response) => {
    let rawBody = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { rawBody += chunk; });
    request.on('end', () => {
      if (request.method === 'POST') lastEvent = { path: request.url, body: JSON.parse(rawBody) };
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(request.method === 'GET' ? [] : { ok: true }));
    });
  });

  const hubPort = await listen(hub);
  app = createServer({ eventManagerUrl: `http://127.0.0.1:${hubPort}` });
  const appPort = await listen(app);
  baseUrl = `http://127.0.0.1:${appPort}`;
});

after(async () => {
  await close(app);
  await close(hub);
});

test('sirve la interfaz y sus estilos claros', async () => {
  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /CineLibro/);

  const styles = await fetch(`${baseUrl}/styles.css`);
  assert.equal(styles.status, 200);
  assert.match(await styles.text(), /color-scheme:\s*light/);
});

test('lee el historial del gestor por el proxy', async () => {
  const response = await fetch(`${baseUrl}/api/events`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});

test('reenvía POST /api/events a POST /events con el evento original', async () => {
  const event = {
    source: 'crud-maye',
    entity: 'pelicula',
    action: 'CREATE',
    title: 'Película creada',
    description: 'Se registró una nueva película',
    payload: { id: 'pelicula-1', titulo: 'Interestelar' },
  };
  const response = await fetch(`${baseUrl}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(lastEvent, { path: '/events', body: event });
});
