const $ = (id) => document.getElementById(id);

let peliculas = [];
let eventos = [];
let editando = null;

async function hubRequest(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new Error(body.message || body.error || `Error HTTP ${response.status}`);
  }
  return body;
}

function setHubStatus(connected) {
  $('connectionDot').classList.toggle('online', connected);
  $('connectionText').textContent = connected
    ? 'EPN Event Manager conectado'
    : 'EPN Event Manager desconectado';
}

function parsePayload(payload) {
  if (payload && typeof payload === 'object') return payload;
  if (typeof payload === 'string') {
    try { return JSON.parse(payload); } catch { return null; }
  }
  return null;
}

function eventTime(evento) {
  const value = evento.recorded_at || evento.timestamp || evento.createdAt || evento.event_date;
  const time = Date.parse(value || '');
  return Number.isNaN(time) ? 0 : time;
}

function rebuildMovies(history) {
  const relevant = history
    .filter((event) => event.source === 'crud-maye' && event.entity === 'pelicula')
    .slice()
    .sort((a, b) => eventTime(a) - eventTime(b));
  const current = new Map();

  for (const event of relevant) {
    const movie = parsePayload(event.payload);
    if (!movie || !movie.id) continue;
    if (event.action === 'CREATE' || event.action === 'UPDATE') current.set(String(movie.id), movie);
    if (event.action === 'DELETE') current.delete(String(movie.id));
  }
  return Array.from(current.values());
}

async function loadCatalog() {
  $('loading').hidden = false;
  try {
    const history = await hubRequest('/events');
    if (!Array.isArray(history)) throw new Error('El gestor devolvió un historial con formato inesperado.');
    eventos = history;
    peliculas = rebuildMovies(history);
    setHubStatus(true);
    render();
  } catch (error) {
    setHubStatus(false);
    peliculas = [];
    render();
    showToast(`No se pudo leer el historial del gestor: ${error.message}`, true);
  } finally {
    $('loading').hidden = true;
  }
}

function showToast(message, error = false) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 3600);
}

function addCell(row, child) {
  const cell = document.createElement('td');
  cell.append(child);
  row.append(cell);
}

function render() {
  const query = $('search').value.trim().toLocaleLowerCase('es');
  const filter = $('availability').value;
  const visible = peliculas.filter((movie) => {
    const matchesSearch = `${movie.titulo} ${movie.director}`.toLocaleLowerCase('es').includes(query);
    const matchesAvailability = filter === 'all' || (filter === 'available' ? movie.disponible : !movie.disponible);
    return matchesSearch && matchesAvailability;
  });

  $('movieRows').replaceChildren();
  for (const movie of visible) {
    const row = document.createElement('tr');
    const title = document.createElement('div'); title.className = 'movie-title'; title.textContent = movie.titulo;
    const director = document.createElement('div'); director.className = 'movie-director'; director.textContent = movie.director;
    const titleCell = document.createElement('td'); titleCell.append(title, director); row.append(titleCell);
    const genre = document.createElement('span'); genre.className = 'genre'; genre.textContent = movie.genero; addCell(row, genre);
    const year = document.createElement('span'); year.textContent = movie.anio; addCell(row, year);
    const duration = document.createElement('span'); duration.textContent = `${movie.duracion} min`; addCell(row, duration);
    const status = document.createElement('span'); status.className = `status${movie.disponible ? '' : ' off'}`; status.textContent = movie.disponible ? 'Disponible' : 'No disponible'; addCell(row, status);

    const actions = document.createElement('div'); actions.className = 'actions';
    const edit = document.createElement('button'); edit.className = 'small-button'; edit.type = 'button'; edit.textContent = 'Editar'; edit.addEventListener('click', () => openForm(movie));
    const remove = document.createElement('button'); remove.className = 'small-button delete'; remove.type = 'button'; remove.textContent = 'Eliminar'; remove.addEventListener('click', () => deleteMovie(movie));
    actions.append(edit, remove); addCell(row, actions);
    $('movieRows').append(row);
  }

  $('totalCount').textContent = peliculas.length;
  $('availableCount').textContent = peliculas.filter((movie) => movie.disponible).length;
  $('eventCount').textContent = eventos.filter((event) => event.source === 'crud-maye' && event.entity === 'pelicula').length;
  $('emptyState').hidden = visible.length !== 0;
  $('emptyTitle').textContent = peliculas.length ? 'No hay resultados' : 'Todavía no hay películas';
  $('emptyMessage').textContent = peliculas.length ? 'Prueba con otra búsqueda o cambia el filtro.' : 'Agrega la primera para iniciar tu catálogo.';
  $('emptyAdd').hidden = peliculas.length !== 0;
  renderActivity();
}

function renderActivity() {
  const list = $('activityList');
  list.replaceChildren();
  const recent = eventos
    .filter((event) => event.source === 'crud-maye' && event.entity === 'pelicula')
    .slice(-3).reverse();
  if (!recent.length) {
    const empty = document.createElement('p'); empty.className = 'activity-empty'; empty.textContent = 'Aún no hay eventos de películas registrados.'; list.append(empty); return;
  }
  for (const event of recent) {
    const card = document.createElement('article'); card.className = 'activity-item';
    const title = document.createElement('strong'); title.textContent = event.title || `Película · ${event.action}`;
    const details = document.createElement('span');
    const payload = parsePayload(event.payload);
    details.textContent = `${payload?.titulo || 'Película'} · ${event.action}`;
    card.append(title, details); list.append(card);
  }
}

function openForm(movie = null) {
  editando = movie;
  const form = $('movieForm');
  form.reset();
  $('formTitle').textContent = movie ? 'Editar película' : 'Nueva película';
  $('saveMovie').textContent = movie ? 'Guardar cambios' : 'Guardar';
  if (movie) {
    for (const key of ['titulo', 'director', 'genero', 'anio', 'duracion']) form.elements[key].value = movie[key];
    form.elements.disponible.value = String(movie.disponible);
  }
  $('dialog').hidden = false;
  form.elements.titulo.focus();
}

function closeForm() {
  $('dialog').hidden = true;
  editando = null;
}

function newId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function sendEvent(action, movie) {
  const titles = {
    CREATE: ['Película creada', 'Se registró una nueva película'],
    UPDATE: ['Película actualizada', 'Se actualizó una película'],
    DELETE: ['Película eliminada', 'Se eliminó una película'],
  };
  const [title, description] = titles[action];
  await hubRequest('/events', {
    method: 'POST',
    body: JSON.stringify({ source: 'crud-maye', entity: 'pelicula', action, title, description, payload: movie }),
  });
  eventos.push({ source: 'crud-maye', entity: 'pelicula', action, title, description, payload: movie, recorded_at: new Date().toLocaleString() });
  setHubStatus(true);
}

async function saveMovie(event) {
  event.preventDefault();
  const editing = Boolean(editando);
  const form = new FormData($('movieForm'));
  const movie = {
    id: editing ? editando.id : newId(),
    titulo: String(form.get('titulo')).trim(),
    director: String(form.get('director')).trim(),
    genero: String(form.get('genero')).trim(),
    anio: Number(form.get('anio')),
    duracion: Number(form.get('duracion')),
    disponible: form.get('disponible') === 'true',
  };
  const button = $('saveMovie'); button.disabled = true; button.textContent = 'Enviando…';
  try {
    await sendEvent(editing ? 'UPDATE' : 'CREATE', movie);
    if (editing) peliculas = peliculas.map((item) => item.id === movie.id ? movie : item);
    else peliculas.push(movie);
    closeForm(); render(); showToast('Evento enviado al EPN Event Manager.');
  } catch (error) {
    showToast(`No se guardó el evento: ${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = editing ? 'Guardar cambios' : 'Guardar';
  }
}

async function deleteMovie(movie) {
  if (!window.confirm(`¿Eliminar “${movie.titulo}” del catálogo?`)) return;
  try {
    await sendEvent('DELETE', movie);
    peliculas = peliculas.filter((item) => item.id !== movie.id);
    render(); showToast('Evento de eliminación enviado al gestor.');
  } catch (error) {
    showToast(`No se envió el evento: ${error.message}`, true);
  }
}

$('addMovie').addEventListener('click', () => openForm());
$('emptyAdd').addEventListener('click', () => openForm());
$('closeDialog').addEventListener('click', closeForm);
$('cancelDialog').addEventListener('click', closeForm);
$('dialog').addEventListener('click', (event) => { if (event.target === $('dialog')) closeForm(); });
$('movieForm').addEventListener('submit', saveMovie);
$('search').addEventListener('input', render);
$('availability').addEventListener('change', render);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeForm(); });

loadCatalog();
