const state = {
  base: "#FFF8F1",
  assort: "#D8C7B8",
  accent: "#9B3342",
};

const ids = {
  base: ["basePicker", "baseText", "baseValue"],
  assort: ["assortPicker", "assortText", "assortValue"],
  accent: ["accentPicker", "accentText", "accentValue"],
};

const normalizeHex = (value) => {
  const raw = value.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw.split("").map((char) => char + char).join("")}`.toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw}`.toUpperCase();
  }
  return null;
};

const hexToRgb = (hex) => {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
};

const luminance = ({ r, g, b }) => {
  const channels = [r, g, b].map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

const contrast = (first, second) => {
  const light = Math.max(luminance(hexToRgb(first)), luminance(hexToRgb(second)));
  const dark = Math.min(luminance(hexToRgb(first)), luminance(hexToRgb(second)));
  return ((light + 0.05) / (dark + 0.05)).toFixed(2);
};

const updateRatios = () => {
  document.querySelector("#accentWhiteRatio").textContent = `${contrast(state.accent, "#FFFFFF")}:1`;
  document.querySelector("#accentBaseRatio").textContent = `${contrast(state.accent, state.base)}:1`;
  document.querySelector("#textBaseRatio").textContent = `${contrast("#312624", state.base)}:1`;
};

const applyColors = () => {
  const root = document.documentElement;

  Object.entries(state).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, value);
    const [pickerId, textId, valueId] = ids[key];
    document.querySelector(`#${pickerId}`).value = value;
    document.querySelector(`#${textId}`).value = value;
    document.querySelector(`#${valueId}`).textContent = value;
  });

  updateRatios();
};

const setColor = (key, value) => {
  const normalized = normalizeHex(value);
  if (!normalized) return;
  state[key] = normalized;
  applyColors();
};

Object.keys(ids).forEach((key) => {
  const [pickerId, textId] = ids[key];
  document.querySelector(`#${pickerId}`).addEventListener("input", (event) => {
    setColor(key, event.target.value);
  });
  document.querySelector(`#${textId}`).addEventListener("change", (event) => {
    setColor(key, event.target.value);
  });
});

document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    const [base, assort, accent] = button.dataset.preset.split(",");
    state.base = normalizeHex(base);
    state.assort = normalizeHex(assort);
    state.accent = normalizeHex(accent);
    applyColors();
  });
});

document.querySelectorAll("[data-mode-button]").forEach((button) => {
  button.addEventListener("click", () => {
    document.body.dataset.mode = button.dataset.modeButton;
    document.querySelectorAll("[data-mode-button]").forEach((modeButton) => {
      modeButton.classList.toggle("is-active", modeButton === button);
    });
  });
});

document.querySelectorAll("[data-persona-button]").forEach((button) => {
  button.addEventListener("click", () => {
    const persona = button.dataset.personaButton;
    document.body.dataset.persona = persona;
    document.querySelectorAll("[data-persona-button]").forEach((personaButton) => {
      personaButton.classList.toggle("is-active", personaButton.dataset.personaButton === persona);
    });
  });
});

applyColors();
