const VALID_CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"];

function normalizeCorner(corner) {
  return VALID_CORNERS.includes(corner) ? corner : "top-left";
}

function computeCornerPosition(corner, width, height, workArea, margin = 16) {
  const normalized = normalizeCorner(corner);
  let x = workArea.x + margin;
  let y = workArea.y + margin;

  if (normalized.includes("right")) {
    x = workArea.x + workArea.width - width - margin;
  }
  if (normalized.includes("bottom")) {
    y = workArea.y + workArea.height - height - margin;
  }

  return { x: Math.round(x), y: Math.round(y) };
}

module.exports = { computeCornerPosition, normalizeCorner, VALID_CORNERS };
