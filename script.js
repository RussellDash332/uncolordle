const DATA_URL = "https://raw.githubusercontent.com/meodai/color-names/main/src/colornames.csv";
const STORAGE_KEY = "uncolordle";

let colors = [];
let byName = new Map();
let guessedNames = new Set();
let guesses = [];
let gameWon = false;

const els = {
  name: document.getElementById("color-name"),
  percent: document.getElementById("similarity"),
  submit: document.getElementById("submit-guess"),
  reset: document.getElementById("reset-game"),
  status: document.getElementById("status"),
  statusText: document.getElementById("status-text"),
  dataCount: document.getElementById("data-count"),
  suggestionPanel: document.getElementById("suggestion-panel"),
  suggestionSwatch: document.getElementById("suggestion-swatch"),
  suggestionName: document.getElementById("suggestion-name"),
  suggestionHex: document.getElementById("suggestion-hex"),
  history: document.getElementById("history"),
  emptyHistory: document.getElementById("empty-history"),
  hintList: document.getElementById("name-hints"),
};

function setStatus(message, type = "") {
  els.statusText.textContent = message;
  els.status.className = `status ${type}`.trim();
}

function normalizeName(name) {
  return name.toLowerCase();
}

function hexToRgb(hex) {
  const s = hex.replace(/^#/, "");
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

function parseCSVLine(line) {
  const out = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }

  out.push(field);
  return out;
}

function parseColors(csv) {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/);
  const result = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const row = parseCSVLine(line);
    const name = row[0]?.trim();
    const hex = row[1]?.trim();

    if (!name || !/^#[0-9a-fA-F]{6}$/.test(hex)) continue;

    const [r, g, b] = hexToRgb(hex);
    result.push({ name, hex, r, g, b, lab: null });
  }

  return result;
}

function saveGuesses() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(guesses));
}

function loadGuesses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const saved = JSON.parse(raw);

    if (!Array.isArray(saved)) return;

    guesses = saved.filter(
      g => g && typeof g.name === "string" && Number.isFinite(g.percent)
    );

    gameWon = guesses.some(g => g.percent === 100);
  } catch {
    guesses = [];
    gameWon = false;
  }
}

function rebuildGuessSet() {
  guessedNames = new Set(
    guesses.map(g => normalizeName(g.name))
  );
}

function renderHistory() {
  els.history.textContent = "";
  els.emptyHistory.hidden = guesses.length !== 0;

  for (let i = guesses.length - 1; i >= 0; i--) {
    const guess = guesses[i];
    const item = byName.get(normalizeName(guess.name));

    if (!item) continue;

    const row = document.createElement("div");
    row.className = "history-row";

    const index = document.createElement("div");
    index.className = "history-index";
    index.textContent = "#" + String(i + 1);

    const swatch = document.createElement("div");
    swatch.className = "history-swatch";
    swatch.style.backgroundColor = item.hex;
    swatch.setAttribute("aria-label", item.hex);

    const main = document.createElement("div");
    main.className = "history-main";

    const name = document.createElement("div");
    name.className = "history-name";
    name.textContent = item.name;

    const hex = document.createElement("div");
    hex.className = "history-hex";
    hex.textContent = item.hex.toUpperCase();

    const score = document.createElement("div");
    score.className = "history-score";
    score.textContent = `${guess.percent.toFixed(2)}%`;

    main.append(name, hex);
    row.append(index, swatch, main, score);
    els.history.appendChild(row);
  }
}

function updateHints() {
  const q = normalizeName(els.name.value);

  els.hintList.textContent = "";

  if (!q || !colors.length) return;

  const lower = q;
  let shown = 0;

  for (const color of colors) {
    if (normalizeName(color.name).startsWith(lower)) {
      const option = document.createElement("option");
      option.value = color.name;
      els.hintList.appendChild(option);

      //if (++shown === 10) break;
    }
  }
}

// thanks Ryan :)
function rgbToLab(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  r = r > 0.04045
    ? ((r + 0.055) / 1.055) ** 2.4
    : r / 12.92;

  g = g > 0.04045
    ? ((g + 0.055) / 1.055) ** 2.4
    : g / 12.92;

  b = b > 0.04045
    ? ((b + 0.055) / 1.055) ** 2.4
    : b / 12.92;

  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750);
  const z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;

  const f = t =>
    t > 0.008856451679
      ? Math.cbrt(t)
      : 7.787037037 * t + 16 / 116;

  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return [
    116 * fy - 16,
    500 * (fx - fy),
    200 * (fy - fz),
  ];
}

// thanks Ryan :)
function deltaE00(c1, c2) {
  const [L1, a1, b1] = c1;
  const [L2, a2, b2] = c2;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;

  const Cbar7 = Cbar ** 7;
  const G =
    0.5 *
    (1 - Math.sqrt(
      Cbar7 / (Cbar7 + 25 ** 7)
    ));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;

  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  let h1p = Math.atan2(b1, a1p) * 180 / Math.PI;
  let h2p = Math.atan2(b2, a2p) * 180 / Math.PI;

  if (h1p < 0) h1p += 360;
  if (h2p < 0) h2p += 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp = h2p - h1p;

  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (dhp > 180) {
    dhp -= 360;
  } else if (dhp < -180) {
    dhp += 360;
  }

  const dHp =
    2 *
    Math.sqrt(C1p * C2p) *
    Math.sin(dhp * Math.PI / 360);

  const Lbar = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbar;

  if (C1p * C2p === 0) {
    hbar = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hbar = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hbar = (h1p + h2p + 360) / 2;
  } else {
    hbar = (h1p + h2p - 360) / 2;
  }

  const T =
    1
    - 0.17 * Math.cos((hbar - 30) * Math.PI / 180)
    + 0.24 * Math.cos((2 * hbar) * Math.PI / 180)
    + 0.32 * Math.cos((3 * hbar + 6) * Math.PI / 180)
    - 0.20 * Math.cos((4 * hbar - 63) * Math.PI / 180);

  const dTheta =
  30 *
  Math.exp(
    -((hbar - 275) / 25) * ((hbar - 275) / 25)
  );

  const Rc =
    2 *
    Math.sqrt(
      Cbarp ** 7 /
      (Cbarp ** 7 + 25 ** 7)
    );

  const Sl =
    1 +
    0.015 *
    (Lbar - 50) ** 2 /
    Math.sqrt(
      20 + (Lbar - 50) ** 2
    );

  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;

  const Rt =
    -Rc *
    Math.sin(
      2 * dTheta * Math.PI / 180
    );

  const dL = dLp / Sl;
  const dC = dCp / Sc;
  const dH = dHp / Sh;

  return Math.sqrt(
    dL * dL +
    dC * dC +
    dH * dH +
    Rt * dC * dH
  );
}

// thanks Ryan :)
function colorDiff(c1, c2) {
  const color1 =
    c1.lab ||
    (c1.lab = rgbToLab(c1.r, c1.g, c1.b));

  const color2 =
    c2.lab ||
    (c2.lab = rgbToLab(c2.r, c2.g, c2.b));

  return Math.abs(
    100 - deltaE00(color1, color2)
  );
}

function scoreCandidate(r, g, b, targetD, rgb) {
  const candidate = {
    r,
    g,
    b,
    lab: rgbToLab(r, g, b)
  };

  let err = 0;

  for (let i = 0; i < rgb.length; i++) {
    const d = colorDiff(candidate, rgb[i]);
    const x = d - targetD[i];
    err += x * x;
  }

  return err;
}

function solveEstimatedRgb() {
  if (!guesses.length) return null;

  const rgb = [];
  const targetD = [];

  for (const guess of guesses) {
    const color = byName.get(normalizeName(guess.name));

    if (!color) continue;

    rgb.push(color);
    targetD.push(guess.percent);
  }

  if (!rgb.length) return null;

  let bestErr = Infinity;
  let best = [0, 0, 0];

  // Global search: step 8
  for (let r = 0; r < 256; r += 8) {
    for (let g = 0; g < 256; g += 8) {
      for (let b = 0; b < 256; b += 8) {
        const err = scoreCandidate(r, g, b, targetD, rgb);

        if (err < bestErr) {
          bestErr = err;
          best = [r, g, b];
        }
      }
    }
  }

  let [br, bg, bb] = best;

  // Local search: step 2
  bestErr = Infinity;

  for (
    let r = Math.max(0, br - 8);
    r < Math.min(256, br + 9);
    r += 2
  ) {
    for (
      let g = Math.max(0, bg - 8);
      g < Math.min(256, bg + 9);
      g += 2
    ) {
      for (
        let b = Math.max(0, bb - 8);
        b < Math.min(256, bb + 9);
        b += 2
      ) {
        const err = scoreCandidate(r, g, b, targetD, rgb);

        if (err < bestErr) {
          bestErr = err;
          best = [r, g, b];
        }
      }
    }
  }

  [br, bg, bb] = best;

  // Final refinement: step 1
  bestErr = Infinity;

  for (
    let r = Math.max(0, br - 2);
    r < Math.min(256, br + 3);
    r++
  ) {
    for (
      let g = Math.max(0, bg - 2);
      g < Math.min(256, bg + 3);
      g++
    ) {
      for (
        let b = Math.max(0, bb - 2);
        b < Math.min(256, bb + 3);
        b++
      ) {
        const err = scoreCandidate(r, g, b, targetD, rgb);

        if (err < bestErr) {
          bestErr = err;
          best = [r, g, b];
        }
      }
    }
  }

  return best;
}

function findClosestColor(rgb) {
  const [r, g, b] = rgb;
  const candidate = {
    r,
    g,
    b,
    lab: rgbToLab(r, g, b)
  };

  let best = null;
  let bestDiff = -Infinity;

  for (const color of colors) {
    if (guessedNames.has(normalizeName(color.name))) continue;

    const diff = colorDiff(candidate, color);

    if (diff > bestDiff) {
      bestDiff = diff;
      best = color;
    }
  }

  return best;
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b]
    .map(v => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

function renderSuggestion() {
  if (!guesses.length || gameWon) {
    els.suggestionPanel.hidden = true;
    return;
  }

  const estimated = solveEstimatedRgb();

  if (!estimated) return;

  const estimatedHex = rgbToHex(estimated);
  const suggestion = findClosestColor(estimated);

  els.suggestionPanel.hidden = false;

  if (!suggestion) {
    els.suggestionName.textContent =
      "No unguessed colors remain";

    els.suggestionHex.textContent = "";
    els.suggestionSwatch.style.backgroundColor =
      estimatedHex;

    return;
  }

  els.suggestionSwatch.style.backgroundColor =
    suggestion.hex;

  els.suggestionName.textContent =
    suggestion.name;

  els.suggestionHex.textContent =
    suggestion.hex.toUpperCase();
}

function renderAll() {
  rebuildGuessSet();
  renderHistory();
  renderSuggestion();
}

async function loadColorData() {
  try {
    setStatus("Loading color database…");
    els.submit.disabled = true;

    const response = await fetch(DATA_URL, {
      cache: "force-cache"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const csv = await response.text();

    colors = parseColors(csv);
    byName = new Map(
        colors.map(color => [normalizeName(color.name), color])
    );

    els.dataCount.textContent =
      `${colors.length.toLocaleString()} named colors loaded`;

    els.submit.disabled = gameWon;
    els.submit.textContent = gameWon ? "Good Job!" : "Add guess";
    setStatus(
      gameWon ? "Target color found!" : "Ready",
      "success"
    );

    guesses = guesses
        .map(g => {
            const color = byName.get(normalizeName(g.name));
            return color ? { name: color.name, percent: g.percent } : null;
        })
        .filter(Boolean);

    rebuildGuessSet();
    renderAll();

  } catch (error) {
    console.error(error);

    setStatus(
      "Could not load the color database. Check your internet connection and reload the page.",
      "error"
    );
  }
}

function addGuess() {
  if (!colors.length || gameWon) return;

  const name = els.name.value;
  const percentValue = els.percent.value.trim();
  const percent = Number(percentValue);

  const color = byName.get(
    normalizeName(name)
  );

  if (!color) {
    setStatus(
      "Color name must match a database entry, ignoring capitalization.",
      "error"
    );

    els.name.focus();
    return;
  }

  if (
    percentValue === "" ||
    !Number.isFinite(percent) ||
    percent < 0 ||
    percent > 100
  ) {
    setStatus(
      "Similarity is required and must be a number between 0 and 100.",
      "error"
    );

    els.percent.focus();
    return;
  }

  if (guessedNames.has(normalizeName(name))) {
    setStatus(
      "That color has already been entered.",
      "error"
    );

    els.name.focus();
    return;
  }

  guesses.push({
    name: color.name,
    percent
  });

  // Clear immediately after accepting the guess.
  els.name.value = "";
  els.percent.value = "";
  updateHints();

  if (percent === 100) {
    gameWon = true;

    els.submit.textContent = "Good Job!";
    els.submit.disabled = true;

    saveGuesses();
    renderAll();

    setStatus(
      "Target color found!",
      "success"
    );

    return;
  }

  saveGuesses();
  renderAll();

  setStatus(
    `Guess ${guesses.length} recorded. Next suggestion calculated below.`,
    "success"
  );

  els.name.focus();
}

function resetGame() {
  guesses = [];
  gameWon = false;

  localStorage.removeItem(STORAGE_KEY);

  els.submit.textContent = "Add guess";
  els.submit.disabled = !colors.length;

  renderAll();

  setStatus(
    "Reset complete.",
    "success"
  );

  els.name.focus();
}

els.submit.addEventListener(
  "click",
  addGuess
);

els.reset.addEventListener(
  "click",
  resetGame
);

els.name.addEventListener(
  "input",
  updateHints
);

els.name.addEventListener(
  "keydown",
  event => {
    if (event.key === "Enter") {
      event.preventDefault();
      addGuess();
    }
  }
);

els.percent.addEventListener(
  "keydown",
  event => {
    if (event.key === "Enter") {
      event.preventDefault();
      addGuess();
    }
  }
);

els.percent.addEventListener(
  "input",
  () => {
    let value = els.percent.value;

    // Only allow digits and one decimal point.
    value = value.replace(/[^\d.]/g, "");

    const dot = value.indexOf(".");

    if (dot !== -1) {
      value =
        value.slice(0, dot + 1) +
        value.slice(dot + 1).replace(/\./g, "").slice(0, 2);
    }

    // Cap at 100.
    if (value !== "" && Number(value) > 100) {
      value = "100";
    }

    els.percent.value = value;
  }
);

loadGuesses();
rebuildGuessSet();
renderHistory();
loadColorData();