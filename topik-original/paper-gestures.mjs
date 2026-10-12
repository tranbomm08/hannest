// Gestures operate on the view only. The original PDF, answers and clock are untouched.
export function attachPaperGestures({ viewport, canvas, isReady, getZoom, setZoom, finishZoom, onPage }) {
  let gesture = null;
  const listeners = [];
  const listen = (name, handler, options) => {
    viewport.addEventListener(name, handler, options);
    listeners.push([name, handler, options]);
  };
  const point = value => ({ x: value.clientX, y: value.clientY });
  const midpoint = touches => ({ x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2 });
  const distance = touches => Math.hypot(touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY);
  const allowed = event => isReady() && (event.target === viewport || event.target === canvas || event.target.matches?.("canvas[data-original-slice]"));
  const prevent = event => { if (event.cancelable) event.preventDefault(); };
  const begin = value => ({
    kind: 'single', start: point(value), last: point(value), at: Date.now(),
    left: viewport.scrollLeft, top: viewport.scrollTop,
    maxLeft: Math.max(0, viewport.scrollWidth - viewport.clientWidth), zoomed: getZoom() > 1.01, turned: false,
  });
  function pageDirection(state) {
    const dx = state.last.x - state.start.x, dy = state.last.y - state.start.y;
    if (Math.abs(dx) <= Math.max(10, Math.abs(dy) * 1.5)) return 0;
    // A drag that starts inside a zoomed page pans it. Only an outward drag
    // starting at an edge can turn the page, even if panning later reaches an edge.
    if (state.zoomed && state.maxLeft > 2 && !(dx > 0 ? state.left <= 2 : state.left >= state.maxLeft - 2)) return 0;
    return dx < 0 ? 1 : -1;
  }
  function endSingle(state) {
    const direction = pageDirection(state);
    const threshold = Math.max(48, Math.min(100, viewport.clientWidth * 0.16));
    if (direction && !state.turned && Date.now() - state.at <= 1500 &&
      Math.abs(state.last.x - state.start.x) >= threshold) {
      state.turned = true; onPage(direction);
    }
  }
  function startTouch(event) {
    if (!allowed(event)) return;
    if (event.touches.length === 2) {
      if (gesture?.kind === 'pinch') return;
      gesture = { kind: 'pinch', distance: Math.max(1, distance(event.touches)), zoom: getZoom() };
      prevent(event); return;
    }
    if (event.touches.length !== 1) {
      if (gesture?.kind === 'pinch') finishZoom();
      gesture = { kind: 'blocked' }; return;
    }
    if (!gesture) gesture = begin(event.touches[0]);
  }
  function moveTouch(event) {
    if (!gesture || !isReady()) return;
    if (gesture.kind === 'pinch') {
      if (event.touches.length !== 2) return;
      prevent(event);
      setZoom(gesture.zoom * distance(event.touches) / gesture.distance, midpoint(event.touches), true);
    } else if (gesture.kind === 'single' && event.touches.length === 1) {
      gesture.last = point(event.touches[0]);
      if (pageDirection(gesture)) prevent(event);
      // All other single-finger moves keep native vertical/horizontal scrolling.
    }
  }
  function endTouch(event) {
    if (!gesture) return;
    const state = gesture;
    if (state.kind === 'pinch') {
      finishZoom();
      gesture = event.touches.length ? { kind: 'blocked' } : null;
      return;
    }
    if (event.touches.length) return;
    gesture = null;
    if (state.kind === 'single' && isReady()) {
      if (event.changedTouches.length) state.last = point(event.changedTouches[0]);
      endSingle(state);
    }
  }
  function cancel() {
    if (gesture?.kind === 'pinch') finishZoom();
    gesture = null;
  }
  function startPointer(event) {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    if (event.button !== 0 || !allowed(event)) return;
    gesture = { ...begin(event), pointerId: event.pointerId };
    try { viewport.setPointerCapture(event.pointerId); } catch {}
    prevent(event);
  }
  function movePointer(event) {
    if (gesture?.pointerId !== event.pointerId || !isReady()) return;
    gesture.last = point(event);
    const dx = gesture.last.x - gesture.start.x, dy = gesture.last.y - gesture.start.y;
    if (!pageDirection(gesture)) viewport.scrollLeft = Math.max(0, gesture.left - dx);
    viewport.scrollTop = Math.max(0, gesture.top - dy);
    prevent(event);
  }
  function endPointer(event) {
    if (gesture?.pointerId !== event.pointerId) return;
    const state = gesture; gesture = null; state.last = point(event);
    try { viewport.releasePointerCapture(event.pointerId); } catch {}
    if (isReady()) endSingle(state);
  }
  listen('touchstart', startTouch, { passive: false });
  listen('touchmove', moveTouch, { passive: false });
  listen('touchend', endTouch);
  listen('touchcancel', cancel);
  listen('pointerdown', startPointer);
  listen('pointermove', movePointer);
  listen('pointerup', endPointer);
  listen('pointercancel', cancel);
  return { reset: cancel, dispose() {
    gesture = null;
    for (const [name, handler, options] of listeners) viewport.removeEventListener(name, handler, options);
  } };
}
