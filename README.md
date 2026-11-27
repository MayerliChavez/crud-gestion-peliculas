# CRUD ligero de películas

Aplicación web sencilla para administrar películas y enviar cada cambio al EPN Event Manager. Este proyecto no guarda películas en una base propia: el Event Manager es el único servicio que persiste los eventos.

## Estructura

```text
app.js       Lógica de la interfaz y envío de eventos
index.html   Página del CRUD
styles.css   Estilos
light-theme.css Paleta clara
server.js    Servidor estático y proxy HTTP al Event Manager
comb.svg     Ícono
```

La lista se reconstruye en memoria usando el historial `GET /events` del gestor. La aplicación hace proxy de `/api/*` hacia el mismo path sin el prefijo `/api`; por ejemplo, `/api/events` se envía a `POST /events`. Así, navegador y API local comparten el puerto `8082` y no requieren CORS.

## Ejecutar

Requiere Node.js 20 o posterior. No hay dependencias externas:

```bash
npm start
```

Abre <http://localhost:8082>. Para desarrollo con reinicio automático:

```bash
npm run start:dev
```

## Configuración

Copia `.env.example` como `.env` si deseas cambiar la configuración:

```env
PORT=8082
EVENT_MANAGER_URL=http://localhost:3000
```

## Operaciones

La interfaz permite crear, listar, buscar, filtrar, editar y eliminar películas. Las acciones de escritura se envían como eventos a `POST /events` con el formato:

```json
{
  "source": "crud-maye",
  "entity": "pelicula",
  "action": "CREATE",
  "title": "Película creada",
  "description": "Se registró una nueva película",
  "payload": {
    "id": "identificador-de-la-pelicula",
    "titulo": "Interestelar",
    "director": "Christopher Nolan",
    "genero": "Ciencia ficción",
    "anio": 2014,
    "duracion": 169,
    "disponible": true
  }
}
```

Las acciones son `CREATE`, `UPDATE` y `DELETE`, siempre en mayúsculas. El cuerpo se envía al controlador `/events` del [EPN Event Manager](https://github.com/MayerliChavez/mantenimiento-software-equipo/blob/main/epn-event-manager/src/modules/events/events.controller.ts). La interfaz reconstruye el estado de las películas con los eventos de `source: "crud-maye"` y `entity: "pelicula"`.

Si el gestor no está disponible, el proxy devuelve HTTP `502` y la interfaz informa que no pudo enviar el evento. No se guarda una copia local. Hay un bug conocido en la rama actual del Event Manager: su `DELETE` responde `{ "ok": true }` sin persistir el evento; por eso una película eliminada puede reaparecer al recargar hasta que el gestor corrija esa rama. Este proyecto no cambia el gestor.

## Pruebas

```bash
npm test
```

Las pruebas usan el servidor HTTP local y un gestor simulado; no necesitan iniciar el Event Manager real.
