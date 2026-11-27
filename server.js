const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

loadEnv();

const PUBLIC_FILES = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/app.js', 'app.js'],
  ['/styles.css', 'styles.css'],
  ['/comb.svg', 'comb.svg'],
]);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function createServer({
  publicDir = __dirname,
  eventManagerUrl = process.env.EVENT_MANAGER_URL || 'http://localhost:3000',
} = {}) {
  const hub = new URL(eventManagerUrl);
  const transport = hub.protocol === 'https:' ? require('node:https') : http;

  return http.createServer((request, response) => {
    const requestUrl = new URL(request.url, 'http://localhost');

    if (requestUrl.pathname === '/api' || requestUrl.pathname.startsWith('/api/')) {
      proxyToEventManager(request, response, requestUrl, hub, transport);
      return;
    }

    const fileName = PUBLIC_FILES.get(requestUrl.pathname);
    if (!fileName || !['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('No encontrado');
      return;
    }

    fs.readFile(path.join(publicDir, fileName), (error, content) => {
      if (error) {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('No se pudo cargar la página');
        return;
      }
      response.writeHead(200, {
        'Content-Type': CONTENT_TYPES[path.extname(fileName)],
        'Cache-Control': 'no-cache',
      });
      response.end(request.method === 'HEAD' ? undefined : content);
    });
  });
}

function proxyToEventManager(request, response, requestUrl, hub, transport) {
  const targetPath = `${requestUrl.pathname.replace(/^\/api/, '') || '/'}${requestUrl.search}`;
  const proxyRequest = transport.request(
    {
      hostname: hub.hostname,
      port: hub.port || (hub.protocol === 'https:' ? 443 : 80),
      path: targetPath,
      method: request.method,
      headers: {
        ...request.headers,
        host: hub.host,
      },
    },
    (hubResponse) => {
      response.writeHead(hubResponse.statusCode || 502, {
        'Content-Type': hubResponse.headers['content-type'] || 'application/json; charset=utf-8',
      });
      hubResponse.pipe(response);
    },
  );

  proxyRequest.setTimeout(5000, () => proxyRequest.destroy(new Error('Tiempo de espera agotado')));
  proxyRequest.on('error', (error) => {
    if (response.headersSent) return response.destroy(error);
    response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({
      ok: false,
      error: 'EPN Event Manager no disponible',
      message: error.message,
    }));
  });
  request.pipe(proxyRequest);
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8082;
  const server = createServer();
  server.listen(port, () => {
    console.log(`CRUD de películas disponible en http://localhost:${port}`);
    console.log(`Eventos enviados a ${process.env.EVENT_MANAGER_URL || 'http://localhost:3000'}`);
  });
}

module.exports = { createServer };
