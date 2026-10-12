// Display geometry only. It never changes the paper, answers or exam clock.
export const PHONE_BREAKPOINT = 680;
export const READABLE_PAPER_WIDTH = 720;

export function paperLayout(availableWidth, mode, manualZoom = 1) {
  const available = Math.max(1, Number(availableWidth) || 1);
  const requested = mode === 'readable' ? READABLE_PAPER_WIDTH / available : mode === 'fit' ? 1 : manualZoom;
  const zoom = Math.max(1, Math.min(3, Number(requested) || 1));
  const width = available * zoom;
  const responseWidth = Math.max(1, Math.min(720, available - 16));
  return {
    zoom, width, responseWidth, responseLeft: (available - responseWidth) / 2,
    // Start near the left edge of the printed text; every margin remains accessible.
    leadingScroll: Math.max(0, Math.min(width - available, width * 0.1)),
  };
}
