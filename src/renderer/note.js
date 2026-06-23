const params = new URLSearchParams(window.location.search);
const noteId = params.get('id');

const elements = {
  shell: document.querySelector('#note-shell'),
  card: document.querySelector('#note-card'),
  title: document.querySelector('#note-title'),
  text: document.querySelector('#note-text'),
  close: document.querySelector('#note-close'),
  resize: document.querySelector('#note-resize'),
  resizeHandles: [...document.querySelectorAll('[data-resize-edge]')],
  reminder: document.querySelector('#note-reminder')
};

let activeNote = null;
let saveTimer = 0;
let dragPoint = null;
let resizePoint = null;
let hoverResizeEdge = '';

const RESIZE_HIT_SIZE = 12;
const RESIZE_CURSOR_BY_EDGE = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize'
};

window.toolkit.onNoteData((note) => {
  if (!note || note.id !== noteId) return;
  activeNote = note;
  renderNote(note);
});

window.toolkit.onNoteReminder(() => {
  elements.card.classList.add('is-reminding');
  window.setTimeout(() => elements.card.classList.remove('is-reminding'), 2400);
});

elements.close.addEventListener('click', () => {
  window.toolkit.notesHide(noteId);
});

elements.title.addEventListener('input', scheduleSave);
elements.text.addEventListener('input', scheduleSave);
elements.shell.addEventListener('pointerdown', startPointerAction);
elements.shell.addEventListener('pointermove', updateResizeCursor);
elements.shell.addEventListener('pointerleave', clearResizeCursor);
elements.card.addEventListener('pointermove', updateResizeCursor);
elements.card.addEventListener('pointerleave', clearResizeCursor);
elements.resize.addEventListener('pointerdown', (event) => startWindowResize(event, 'se'));
elements.resizeHandles.forEach((handle) => {
  handle.addEventListener('pointerdown', (event) => startWindowResize(event, handle.dataset.resizeEdge));
});
window.addEventListener('pointermove', moveWindow);
window.addEventListener('pointermove', resizeWindow);
window.addEventListener('pointerup', stopWindowDrag);
window.addEventListener('pointerup', stopWindowResize);
window.addEventListener('pointercancel', stopWindowDrag);
window.addEventListener('pointercancel', stopWindowResize);

window.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'w') {
    event.preventDefault();
    window.toolkit.notesHide(noteId);
  }
});

window.toolkit.notesReady(noteId);

function renderNote(note) {
  if (elements.title.value !== note.title) elements.title.value = note.title;
  if (elements.text.value !== note.text) elements.text.value = note.text;
  elements.shell.dataset.shape = note.shape;
  elements.card.style.setProperty('--note-color', note.color);
  elements.card.style.setProperty('--note-font-size', `${note.fontSize || 15}px`);
  elements.reminder.textContent = note.remindAt ? `提醒 ${formatReminder(note.remindAt)}` : '未设置提醒';
}

function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    if (!activeNote) return;
    window.toolkit.notesUpdate(noteId, {
      title: elements.title.value,
      text: elements.text.value
    });
  }, 240);
}

function startPointerAction(event) {
  if (event.button !== 0) return;
  if (event.target.closest('input, textarea, button')) return;
  const edge = getResizeEdge(event);
  if (edge) {
    startWindowResize(event, edge);
    return;
  }
  startWindowDrag(event);
}

function startWindowDrag(event) {
  dragPoint = { x: event.screenX, y: event.screenY };
  capturePointer(event.currentTarget, event.pointerId);
  event.preventDefault();
}

function startWindowResize(event, forcedEdge = 'se') {
  if (event.button !== 0) return;
  resizePoint = { x: event.screenX, y: event.screenY, edge: forcedEdge };
  const captureTarget = event.currentTarget?.setPointerCapture ? event.currentTarget : elements.shell;
  capturePointer(captureTarget, event.pointerId);
  elements.shell.classList.add('is-resizing');
  elements.card.style.cursor = RESIZE_CURSOR_BY_EDGE[forcedEdge] || 'nwse-resize';
  event.preventDefault();
  event.stopPropagation();
}

async function moveWindow(event) {
  if (!dragPoint) return;
  const dx = event.screenX - dragPoint.x;
  const dy = event.screenY - dragPoint.y;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
  dragPoint = { x: event.screenX, y: event.screenY };
  await window.toolkit.notesMoveBy(dx, dy);
}

function stopWindowDrag() {
  dragPoint = null;
}

async function resizeWindow(event) {
  if (!resizePoint) return;
  const dx = event.screenX - resizePoint.x;
  const dy = event.screenY - resizePoint.y;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
  const edge = resizePoint.edge;
  resizePoint = { x: event.screenX, y: event.screenY, edge };
  await window.toolkit.notesResizeBy(dx, dy, edge);
}

function stopWindowResize() {
  resizePoint = null;
  elements.shell.classList.remove('is-resizing');
  clearResizeCursor();
}

function updateResizeCursor(event) {
  if (resizePoint) return;
  if (event.target.closest('input, textarea, button')) {
    clearResizeCursor();
    return;
  }
  hoverResizeEdge = getResizeEdge(event);
  elements.card.style.cursor = hoverResizeEdge ? RESIZE_CURSOR_BY_EDGE[hoverResizeEdge] : 'grab';
}

function clearResizeCursor() {
  if (resizePoint) return;
  hoverResizeEdge = '';
  elements.card.style.cursor = '';
}

function getResizeEdge(event) {
  const rect = elements.shell.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const nearLeft = x <= RESIZE_HIT_SIZE;
  const nearRight = rect.width - x <= RESIZE_HIT_SIZE;
  const nearTop = y <= RESIZE_HIT_SIZE;
  const nearBottom = rect.height - y <= RESIZE_HIT_SIZE;
  const vertical = nearTop ? 'n' : nearBottom ? 's' : '';
  const horizontal = nearLeft ? 'w' : nearRight ? 'e' : '';
  return `${vertical}${horizontal}`;
}

function capturePointer(target, pointerId) {
  try {
    target?.setPointerCapture?.(pointerId);
  } catch {
    // Some synthetic or cancelled pointer sequences cannot be captured.
  }
}

function formatReminder(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}
