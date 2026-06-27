//#region ST imports

import {
  eventSource,
  event_types,
  saveSettingsDebounced,
} from "../../../../script.js";
import { extension_settings } from "../../../extensions.js";

//#endregion ST imports

//#region Local imports

import { ExColor } from "./ExColor.js";
import { CharacterType, STCharacter } from "./STCharacter.js";
import { getSmartAvatarColor } from "./color-utils.js";
import {
  createColorSourceDropdown,
  createColorTextPickerCombo,
  createCheckboxWithLabel,
} from "./element-creators.js";
import { initializeSettings } from "./settings-utils.js";
import {
  expEventSource,
  exp_event_type,
  getAllPersonas,
  getCharacterBeingEdited,
  getCurrentCharacter,
  getCurrentGroupCharacters,
  getCurrentPersona,
  getMessageAuthor,
  isInAnyChat,
  isInCharacterChat,
  isInGroupChat,
} from "./st-utils.js";
import { setInputColorPickerComboValue } from "./utils.js";
import { pickColor, isNativeEyeDropperSupported } from "./eyedropper.js";

//#endregion Local imports

const DEFAULT_STATIC_DIALOGUE_COLOR_HEX = "#e18a24";
/** @type {[number, number, number]} */
const DEFAULT_STATIC_DIALOGUE_COLOR_RGB = [225, 138, 36];

/**
 * @typedef {ValueOf<typeof ColorizeSourceType>} ColorizeSourceType
 * @readonly
 */
export const ColorizeSourceType = {
  AVATAR_SMART: "avatar_smart",
  CHAR_COLOR_OVERRIDE: "char_color_override",
  STATIC_COLOR: "static_color",
  DISABLED: "disabled",
};

/**
 * @typedef {defaultExtSettings} PaletteTalkSettings
 */
const defaultCharColorSettings = {
  colorizeSource: ColorizeSourceType.AVATAR_SMART,
  staticColor: DEFAULT_STATIC_DIALOGUE_COLOR_HEX,
  colorOverrides: {},
  colorNameText: false,
  boostVibrancy: false,
};
const defaultExtSettings = {
  charColorSettings: defaultCharColorSettings,
  personaColorSettings: defaultCharColorSettings,
  // Maps a displayed character NAME (lowercased) -> hex colour. Used for
  // "Send As" NPCs whose messages can't be resolved to a real character/avatar.
  nameColorOverrides: {},
};

const extName = "SillyTavern-Palette-Talk";
const extFolderPath = `scripts/extensions/third-party/${extName}`;
const extSettings = initializeSettings(extName, defaultExtSettings);

function debounce(fn, delay = 100) {
  /** @type {number?} */
  let timeoutId = null;
  return function debounced(...args) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = window.setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

/** @type {HTMLStyleElement} */
let charactersStyleSheet;
/** @type {HTMLStyleElement} */
let personasStyleSheet;
/** @type {HTMLStyleElement} */
let namesStyleSheet;

/**
 * @param {STCharacter} stChar
 */
async function getCharStyleString(stChar) {
  let styleHtml = "";
  const dialogueColor = await getCharacterDialogueColor(stChar);
  const colorSettings = getSettingsForChar(stChar);

  if (dialogueColor) {
    styleHtml += `
            .mes[sdc-author_uid="${stChar.uid}"] {
                --character-color: #${dialogueColor.toHex()};
            }
        `;

    // Apply color to character name if enabled
    if (colorSettings.colorNameText) {
      styleHtml += `
            .mes[sdc-author_uid="${stChar.uid}"] .name_text {
                color: var(--character-color);
            }
        `;
    }
  }

  return styleHtml;
}

/**
 *
 * @param {STCharacter[]=} characterList
 */
async function updateCharactersStyleSheet(characterList) {
  if (!characterList) {
    if (!isInAnyChat()) {
      return;
    }
    if (isInGroupChat()) {
      characterList = getCurrentGroupCharacters();
    } else if (isInCharacterChat()) {
      characterList = [getCurrentCharacter()];
    }
  }

  const stylesHtml = await Promise.all(
    characterList.map(async (char) => await getCharStyleString(char))
  );
  charactersStyleSheet.innerHTML = stylesHtml.join("");
}

// Handled differently from the chars style sheet so we don't have to do any dirty/complex tricks when a chat has messages
// from a persona the user isn't currently using (otherwise the message color would revert to the default).
/**
 *
 * @param {STCharacter[]=} personaList
 */
async function updatePersonasStyleSheet(personaList) {
  personaList ??= getAllPersonas();

  const stylesHtml = await Promise.all(
    personaList.map(async (persona) => await getCharStyleString(persona))
  );
  personasStyleSheet.innerHTML = stylesHtml.join("");
}

/**
 *
 * @param {STCharacter | CharacterType} charType
 */
function getSettingsForChar(charType) {
  if (charType instanceof STCharacter) {
    charType = charType.type;
  }

  switch (charType) {
    case CharacterType.CHARACTER:
      return extSettings.charColorSettings;
    case CharacterType.PERSONA:
      return extSettings.personaColorSettings;
    default:
      console.warn(
        `Character type '${charType}' has no settings key, using defaults.`
      );
      return structuredClone(defaultCharColorSettings);
  }
}

/**
 * Determines if the current application theme is light or dark.
 * Checks the computed background color of the body.
 * @returns {boolean} True if light theme, false if dark theme.
 */
function isLightTheme() {
  const rgb = window
    .getComputedStyle(document.body)
    .backgroundColor.match(/\d+/g);
  if (!rgb) return false; // Default to dark if can't determine

  // Calculate relative luminance
  const luminance =
    (0.299 * parseInt(rgb[0]) +
      0.587 * parseInt(rgb[1]) +
      0.114 * parseInt(rgb[2])) /
    255;
  return luminance > 0.5;
}

/**
 * Improves color contrast for better readability on dark or light backgrounds.
 * Ensures adequate saturation and luminance while preserving hue.
 * Optionally boosts vibrancy.
 *
 * @param {import("./ExColor.js").ColorArray} rgb
 * @param {boolean} boostVibrancy - Whether to apply 20% saturation boost
 * @param {boolean} isLight - Whether the current theme is light
 * @returns {import("./ExColor.js").ColorArray}
 */
function makeBetterContrast(rgb, boostVibrancy = false, isLight = false) {
  const [h, s, l, a] = ExColor.rgb2hsl(rgb);

  let nHue = h;
  let nSat = s;
  let nLum = l;

  // Ensure minimum saturation for vibrancy
  if (nSat < 0.4) {
    nSat = Math.min(nSat + 0.3, 0.8);
  }

  if (isLight) {
    // Light Theme Logic: Darken colors that are too bright
    if (nLum > 0.6) {
      nLum = 0.45; // Darken bright colors
    } else if (nLum > 0.4) {
      nLum = 0.4; // Slight darken for mid-range
    }
    // Ensure it's not TOO dark though, or it looks like black text
    if (nLum < 0.2) {
      nLum = 0.25;
    }
  } else {
    // Dark Theme Logic (Default)
    // Ensure luminance is in readable range (not too dark, not too bright)
    if (nLum < 0.5) {
      nLum = 0.65; // Brighten dark colors
    } else if (nLum < 0.7) {
      nLum = 0.7; // Slight boost for mid-range
    } else if (nLum > 0.85) {
      nLum = 0.8; // Tone down very bright colors
    }
  }

  // Apply optional vibrancy boost (35% saturation increase)
  if (boostVibrancy) {
    nSat = Math.max(0, Math.min(1, nSat + 0.35));
  }

  return ExColor.hsl2rgb([nHue, nSat, nLum, a]);
}

const MAX_CACHE_SIZE = 100; // Prevent memory issues with many characters
let avatarColorCache = {};
let cacheInsertionOrder = []; // Track insertion order for LRU eviction

/**
 * Removes the specified cache entry and keeps insertion tracking in sync.
 * @param {string} cacheKey
 */
function removeCacheEntry(cacheKey) {
  delete avatarColorCache[cacheKey];
  const index = cacheInsertionOrder.indexOf(cacheKey);
  if (index > -1) {
    cacheInsertionOrder.splice(index, 1);
  }
}

/**
 * Enforces the maximum cache size by removing oldest entries
 */
function enforceCacheLimit() {
  if (Object.keys(avatarColorCache).length > MAX_CACHE_SIZE) {
    // Remove oldest 20% of entries to avoid frequent cleanup
    const entriesToRemove = Math.floor(MAX_CACHE_SIZE * 0.2);
    for (
      let i = 0;
      i < entriesToRemove && cacheInsertionOrder.length > 0;
      i++
    ) {
      const oldestKey = cacheInsertionOrder.shift();
      delete avatarColorCache[oldestKey];
    }
  }
}

/**
 * Adds an entry to the cache with size enforcement
 * @param {string} key
 * @param {ExColor} value
 */
function addToCache(key, value) {
  avatarColorCache[key] = value;
  cacheInsertionOrder.push(key);
  enforceCacheLimit();
}

/**
 * Clears the cache for a specific character type only
 * @param {CharacterType} charType
 */
function clearCacheForCharType(charType) {
  const prefix = `${charType}|`;
  Object.keys(avatarColorCache).forEach((key) => {
    if (key.startsWith(prefix)) {
      removeCacheEntry(key);
    }
  });
}

/**
 * Clears cached colors for a specific character (all adjustment variants).
 * @param {STCharacter} stChar
 */
function clearCacheForCharacter(stChar) {
  const prefix = `${stChar.type}|${stChar.uid}|`;
  Object.keys(avatarColorCache).forEach((key) => {
    if (key.startsWith(prefix)) {
      removeCacheEntry(key);
    }
  });
}

/**
 * Gets the dialogue color for a character using smart color extraction.
 *
 * @param {STCharacter} stChar
 * @returns {Promise<ExColor?>}
 */
async function getCharacterDialogueColor(stChar) {
  const colorSettings = getSettingsForChar(stChar);
  const colorizeSource = Object.keys(colorSettings.colorOverrides).includes(
    stChar.avatarName
  )
    ? ColorizeSourceType.CHAR_COLOR_OVERRIDE
    : colorSettings.colorizeSource;

  switch (colorizeSource) {
    case ColorizeSourceType.AVATAR_SMART: {
      const isLight = isLightTheme();
      // Create cache key that includes character type, vibrancy boost setting, and theme
      const cacheKey = `${stChar.type}|${stChar.uid}|${
        colorSettings.boostVibrancy ? "boosted" : "normal"
      }|${isLight ? "light" : "dark"}`;

      // Check cache first
      if (avatarColorCache[cacheKey]) {
        return avatarColorCache[cacheKey];
      }

      try {
        const avatar = stChar.getAvatarImageThumbnail();
        const colorRgb = await getSmartAvatarColor(avatar);
        const betterContrastRgb = colorRgb
          ? makeBetterContrast(
              colorRgb,
              colorSettings.boostVibrancy || false,
              isLight
            )
          : DEFAULT_STATIC_DIALOGUE_COLOR_RGB;
        const exColor = ExColor.fromRgb(betterContrastRgb);

        // Cache the result with size enforcement
        addToCache(cacheKey, exColor);
        return exColor;
      } catch (error) {
        console.warn(
          `[Palette Talk] Failed to extract color from avatar for ${stChar.uid}:`,
          error
        );
        // Return default color on error
        const exColor = ExColor.fromRgb(DEFAULT_STATIC_DIALOGUE_COLOR_RGB);
        addToCache(cacheKey, exColor); // Cache the fallback too
        return exColor;
      }
    }
    case ColorizeSourceType.STATIC_COLOR: {
      return ExColor.fromHex(colorSettings.staticColor);
    }
    case ColorizeSourceType.CHAR_COLOR_OVERRIDE: {
      const overrideColor = colorSettings.colorOverrides[stChar.avatarName];
      return overrideColor ? ExColor.fromHex(overrideColor) : null;
    }
    case ColorizeSourceType.DISABLED:
    default:
      return null;
  }
}

/**
 *
 * @param {string} textboxValue
 * @param {any} defaultValue
 * @returns {string | null}
 */
function getTextValidHexOrDefault(textboxValue, defaultValue) {
  const trimmed = textboxValue.trim();
  if (!ExColor.isValidHexString(trimmed)) return defaultValue;

  return ExColor.getHexWithHash(trimmed);
}

/**
 * Reads the displayed character name from a message element.
 * Used as a fallback for "Send As" NPCs that have no resolvable avatar.
 *
 * @param {HTMLElement} message
 * @returns {string} The trimmed display name, or "".
 */
function getMessageDisplayName(message) {
  const nameElem = message.querySelector(".ch_name .name_text, .name_text");
  return (nameElem?.textContent ?? "").trim();
}

/**
 * Adds author UID + display-name attributes to a message element.
 *
 * The UID attribute drives avatar-based colouring. The name attribute is a
 * fallback so "Send As" NPC messages (which often share a default avatar and
 * can't be resolved to a real character) can still be coloured by name.
 *
 * @param {HTMLElement} message
 */
function addAuthorUidClassToMessage(message) {
  const authorChatUidAttr = "sdc-author_uid";

  // Always (re)tag the display name — Send-As can reuse a message slot.
  const displayName = getMessageDisplayName(message);
  if (displayName) {
    message.setAttribute("sdc-author_name", displayName.toLowerCase());
  }

  if (message.hasAttribute(authorChatUidAttr)) {
    return;
  }

  let messageAuthorChar = null;
  try {
    messageAuthorChar = getMessageAuthor(message);
  } catch (err) {
    // Send-As NPCs / unusual avatars can throw here; that's expected — we
    // fall back to name-based colouring below instead of failing.
    console.debug("[Palette Talk] Could not resolve message author, using name fallback.", err);
  }

  if (messageAuthorChar) {
    message.setAttribute(authorChatUidAttr, messageAuthorChar.uid);
  }
}

function addAuthorUidToExistingMessages() {
  const chatElem = document.getElementById("chat");
  if (!chatElem) {
    return;
  }

  chatElem.querySelectorAll(":scope > .mes").forEach((message) => {
    addAuthorUidClassToMessage(message);
  });
}

//#region Event Handlers

const scheduleCharacterSettingsRefresh = debounce(async () => {
  await updateCharactersStyleSheet();
  saveSettingsDebounced();
}, 120);

const schedulePersonaSettingsRefresh = debounce(async () => {
  await updatePersonasStyleSheet();
  saveSettingsDebounced();
}, 120);

const scheduleAllSettingsRefresh = debounce(async () => {
  await updateCharactersStyleSheet();
  await updatePersonasStyleSheet();
  updateNamesStyleSheet();
  saveSettingsDebounced();
}, 120);

const scheduleNamesRefresh = debounce(() => {
  updateNamesStyleSheet();
  saveSettingsDebounced();
}, 120);

function onCharacterSettingsUpdated() {
  scheduleCharacterSettingsRefresh();
}

function onPersonaSettingsUpdated() {
  schedulePersonaSettingsRefresh();
}

function onAnySettingsUpdated() {
  scheduleAllSettingsRefresh();
}

/**
 *
 * @param {STCharacter} char
 */
function onCharacterChanged(char) {
  const colorOverride = document.getElementById("sdc-char_color_override");
  if (!colorOverride) return;
  const newValue = extSettings.charColorSettings.colorOverrides[char.avatarName];
  // Prefer the custom override UI setter if present; fall back to legacy input combo behavior.
  const setter = /** @type {any} */ (colorOverride).__sdcSetColorOverrideValue;
  if (typeof setter === "function") {
    setter(newValue);
    return;
  }
  setInputColorPickerComboValue(colorOverride, newValue);
}

/**
 *
 * @param {STCharacter} persona
 */
function onPersonaChanged(persona) {
  const colorOverride = document.getElementById("sdc-persona_color_override");
  if (!colorOverride) return;
  const newValue =
    extSettings.personaColorSettings.colorOverrides[persona.avatarName];
  // Prefer the custom override UI setter if present; fall back to legacy input combo behavior.
  const setter = /** @type {any} */ (colorOverride).__sdcSetColorOverrideValue;
  if (typeof setter === "function") {
    setter(newValue);
    return;
  }
  setInputColorPickerComboValue(colorOverride, newValue);
}

//#endregion Event Handlers

//#region Initialization

function initializeStyleSheets() {
  charactersStyleSheet = createAndAppendStyleSheet("sdc-chars_style_sheet");
  personasStyleSheet = createAndAppendStyleSheet("sdc-personas_style_sheet");
  namesStyleSheet = createAndAppendStyleSheet("sdc-names_style_sheet");

  function createAndAppendStyleSheet(id) {
    const styleSheet = document.createElement("style");
    styleSheet.id = id;
    return document.body.appendChild(styleSheet);
  }
}

/**
 * Escapes a string for safe use inside a CSS attribute-selector value.
 * @param {string} value
 * @returns {string}
 */
function cssEscapeAttrValue(value) {
  return String(value).replace(/["\\]/g, "\\$&");
}

/**
 * Rebuilds the name-based stylesheet from `nameColorOverrides`. This colours
 * "Send As" NPC dialogue (and names) by the displayed character name, which is
 * the only reliable identifier those messages have.
 */
function updateNamesStyleSheet() {
  if (!namesStyleSheet) return;
  const overrides = extSettings.nameColorOverrides || {};
  const colorNames = extSettings.charColorSettings.colorNameText;

  const rules = Object.entries(overrides)
    .filter(([name, hex]) => name && hex)
    .map(([name, hex]) => {
      const sel = `.mes[sdc-author_name="${cssEscapeAttrValue(name)}"]`;
      let rule = `
        ${sel} { --character-color: ${hex}; }`;
      if (colorNames) {
        rule += `
        ${sel} .name_text { color: var(--character-color); }`;
      }
      return rule;
    });

  namesStyleSheet.innerHTML = rules.join("");
}

function initializeSettingsUI() {
  const elemExtensionSettings = document.getElementById(
    "sdc-extension-settings"
  );

  // ===== CHARACTER SETTINGS =====
  const charDialogueSettings = elemExtensionSettings.querySelector(
    "#sdc-char_dialogue_settings"
  );
  const charStaticColorRow = charDialogueSettings.children[1]; // The static color label/container

  // Color source dropdown
  const charColorSourceDropdown = createColorSourceDropdown(
    "sdc-char_colorize_source",
    (changedEvent) => {
      const value = $(changedEvent.target).prop("value");
      extSettings.charColorSettings.colorizeSource = value;

      // Show/hide static color picker based on selection
      charStaticColorRow.style.display =
        value === ColorizeSourceType.STATIC_COLOR ? "block" : "none";

      onCharacterSettingsUpdated();
    }
  );
  charDialogueSettings.children[0].insertAdjacentElement(
    "afterend",
    charColorSourceDropdown
  );

  // Static color picker
  const charStaticColorPickerCombo = createColorTextPickerCombo(
    (textboxValue) => getTextValidHexOrDefault(textboxValue, null),
    (colorValue) => {
      extSettings.charColorSettings.staticColor = colorValue;
      onCharacterSettingsUpdated();
    }
  );
  charDialogueSettings.children[2].insertAdjacentElement(
    "beforeend",
    charStaticColorPickerCombo
  );

  // Color name text checkbox
  const charColorNameCheckbox = createCheckboxWithLabel(
    "sdc-char_color_name",
    "Apply color to character names",
    "When enabled, character names will be colored in addition to dialogue quotes.",
    extSettings.charColorSettings.colorNameText || false,
    (checked) => {
      extSettings.charColorSettings.colorNameText = checked;
      onCharacterSettingsUpdated();
    }
  );
  charDialogueSettings.children[2].insertAdjacentElement(
    "afterend",
    charColorNameCheckbox
  );

  // Vibrancy boost checkbox (insert after color name checkbox to maintain correct order)
  const charVibrancyCheckbox = createCheckboxWithLabel(
    "sdc-char_boost_vibrancy",
    "Boost color vibrancy",
    "Increases saturation by 35% for more colorful dialogue (Avatar Smart mode only).",
    extSettings.charColorSettings.boostVibrancy || false,
    (checked) => {
      extSettings.charColorSettings.boostVibrancy = checked;
      clearCacheForCharType(CharacterType.CHARACTER); // Clear character cache
      onCharacterSettingsUpdated();
    }
  );
  charColorNameCheckbox.insertAdjacentElement("afterend", charVibrancyCheckbox);

  // Initialize values and visibility
  charStaticColorRow.style.display =
    extSettings.charColorSettings.colorizeSource ===
    ColorizeSourceType.STATIC_COLOR
      ? "block"
      : "none";
  $(charColorSourceDropdown.querySelector("select"))
    .prop("value", extSettings.charColorSettings.colorizeSource)
    .trigger("change");
  $(charStaticColorPickerCombo.querySelector('input[type="text"]'))
    .prop("value", extSettings.charColorSettings.staticColor)
    .trigger("focusout");

  // ===== PERSONA SETTINGS =====
  const personaDialogueSettings = elemExtensionSettings.querySelector(
    "#sdc-persona_dialogue_settings"
  );
  const personaStaticColorRow = personaDialogueSettings.children[1]; // The static color label/container

  // Color source dropdown
  const personaColorSourceDropdown = createColorSourceDropdown(
    "sdc-persona_colorize_source",
    (changedEvent) => {
      const value = $(changedEvent.target).prop("value");
      extSettings.personaColorSettings.colorizeSource = value;

      // Show/hide static color picker based on selection
      personaStaticColorRow.style.display =
        value === ColorizeSourceType.STATIC_COLOR ? "block" : "none";

      onPersonaSettingsUpdated();
    }
  );
  personaDialogueSettings.children[0].insertAdjacentElement(
    "afterend",
    personaColorSourceDropdown
  );

  // Static color picker
  const personaStaticColorPickerCombo = createColorTextPickerCombo(
    (textboxValue) => getTextValidHexOrDefault(textboxValue, null),
    (colorValue) => {
      extSettings.personaColorSettings.staticColor = colorValue;
      onPersonaSettingsUpdated();
    }
  );
  personaDialogueSettings.children[2].insertAdjacentElement(
    "beforeend",
    personaStaticColorPickerCombo
  );

  // Color name text checkbox
  const personaColorNameCheckbox = createCheckboxWithLabel(
    "sdc-persona_color_name",
    "Apply color to persona names",
    "When enabled, persona names will be colored in addition to dialogue quotes.",
    extSettings.personaColorSettings.colorNameText || false,
    (checked) => {
      extSettings.personaColorSettings.colorNameText = checked;
      onPersonaSettingsUpdated();
    }
  );
  personaDialogueSettings.children[2].insertAdjacentElement(
    "afterend",
    personaColorNameCheckbox
  );

  // Vibrancy boost checkbox (insert after color name checkbox to maintain correct order)
  const personaVibrancyCheckbox = createCheckboxWithLabel(
    "sdc-persona_boost_vibrancy",
    "Boost color vibrancy",
    "Increases saturation by 35% for more colorful dialogue (Avatar Smart mode only).",
    extSettings.personaColorSettings.boostVibrancy || false,
    (checked) => {
      extSettings.personaColorSettings.boostVibrancy = checked;
      clearCacheForCharType(CharacterType.PERSONA); // Clear persona cache
      onPersonaSettingsUpdated();
    }
  );
  personaColorNameCheckbox.insertAdjacentElement(
    "afterend",
    personaVibrancyCheckbox
  );

  // Initialize values and visibility
  personaStaticColorRow.style.display =
    extSettings.personaColorSettings.colorizeSource ===
    ColorizeSourceType.STATIC_COLOR
      ? "block"
      : "none";
  $(personaColorSourceDropdown.querySelector("select"))
    .prop("value", extSettings.personaColorSettings.colorizeSource)
    .trigger("change");
  $(personaStaticColorPickerCombo.querySelector('input[type="text"]'))
    .prop("value", extSettings.personaColorSettings.staticColor)
    .trigger("focusout");
}

/**
 * Builds the "Send As / NPC Colors" section in the settings panel. Lets the
 * user map a character NAME to a colour, which is applied to messages posted
 * via the "Send As" feature (those NPCs have no resolvable avatar). Solves
 * upstream Issue #1.
 */
function initializeNameOverridesUI() {
  const root = document.getElementById("sdc-extension-settings");
  if (!root) return;
  const content = root.querySelector(".inline-drawer-content");
  if (!content) return;

  extSettings.nameColorOverrides ??= {};

  const section = document.createElement("div");
  section.id = "sdc-name_overrides_settings";
  section.className = "sdc-extension_block dc-color-settings-group";

  const header = document.createElement("div");
  header.innerHTML = `
        <label title="Colour dialogue for characters posted via 'Send As' (NPCs without their own avatar), matched by name.">
            <h4>Send As / NPC Colors<span class="margin5 fa-solid fa-circle-info opacity50p"></span></h4>
        </label>`;
  section.appendChild(header);

  const list = document.createElement("div");
  list.className = "sdc-name-overrides-list";
  section.appendChild(list);

  /** Re-renders the list of name -> colour rows. */
  function renderRows() {
    list.innerHTML = "";
    const entries = Object.entries(extSettings.nameColorOverrides);
    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "sdc-name-overrides-empty";
      empty.textContent = "No NPC colors yet. Add one below.";
      list.appendChild(empty);
    }
    entries.forEach(([name, hex]) => list.appendChild(createRow(name, hex)));
  }

  /**
   * @param {string} name
   * @param {string} hex
   */
  function createRow(name, hex) {
    const row = document.createElement("div");
    row.className = "sdc-name-override-row";

    const swatch = document.createElement("span");
    swatch.className = "sdc-name-override-swatch";
    swatch.style.backgroundColor = hex;

    const nameSpan = document.createElement("span");
    nameSpan.className = "sdc-name-override-name";
    nameSpan.textContent = name;
    nameSpan.title = name;

    const hexSpan = document.createElement("span");
    hexSpan.className = "sdc-name-override-hex";
    hexSpan.textContent = hex.toUpperCase();

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "menu_button menu_button_icon sdc-name-override-del";
    delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
    delBtn.title = "Remove this NPC color";
    delBtn.onclick = () => {
      delete extSettings.nameColorOverrides[name];
      renderRows();
      scheduleNamesRefresh();
    };

    row.append(swatch, nameSpan, hexSpan, delBtn);
    return row;
  }

  // --- Add-new row -----------------------------------------------------
  const addRow = document.createElement("div");
  addRow.className = "sdc-name-override-add";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "text_pole";
  nameInput.placeholder = "Character name";

  const hexInput = document.createElement("input");
  hexInput.type = "text";
  hexInput.className = "text_pole sdc-hex-input";
  hexInput.placeholder = "#RRGGBB";
  hexInput.maxLength = 7;

  const colorPickerWrapper = document.createElement("div");
  colorPickerWrapper.className =
    "dc-color-picker-wrapper sdc-custom-picker-wrapper";
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.className = "dc-color-picker";
  colorInput.value = "#e18a24";
  colorPickerWrapper.appendChild(colorInput);

  colorInput.addEventListener("input", () => {
    hexInput.value = colorInput.value;
  });

  const eyedropperBtn = document.createElement("button");
  eyedropperBtn.type = "button";
  eyedropperBtn.className = "menu_button menu_button_icon sdc-eyedropper-btn";
  eyedropperBtn.innerHTML = '<i class="fa-solid fa-eye-dropper"></i>';
  eyedropperBtn.title = isNativeEyeDropperSupported()
    ? "Pick a colour from anywhere on screen"
    : "Pick a colour by clicking on an avatar";
  eyedropperBtn.onclick = async () => {
    const picked = await pickColor();
    if (picked) {
      hexInput.value = picked;
      colorInput.value = picked;
    }
  };

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "menu_button sdc-name-override-addbtn";
  addBtn.textContent = "Add";
  addBtn.onclick = () => {
    const name = nameInput.value.trim();
    const hex = getTextValidHexOrDefault(hexInput.value, colorInput.value);
    if (!name || !hex) return;
    extSettings.nameColorOverrides[name.toLowerCase()] = hex;
    nameInput.value = "";
    hexInput.value = "";
    renderRows();
    scheduleNamesRefresh();
  };

  addRow.append(nameInput, hexInput, colorPickerWrapper, eyedropperBtn, addBtn);
  section.appendChild(addRow);

  content.appendChild(section);
  renderRows();
}

/**
 * Closes SillyTavern's wand (extensions) dropdown menu. ST itself closes the
 * menu via a delegated document click handler, but we close it explicitly too
 * so the menu never lingers if our handler ran first.
 */
function closeExtensionsMenu() {
  const menu = document.getElementById("extensionsMenu");
  if (!menu) return;
  // jQuery is available in ST; use it when present for the same fade ST uses.
  try {
    if (typeof $ === "function") {
      $(menu).fadeOut?.(150);
      $(menu).hide?.();
      return;
    }
  } catch (_) {
    /* noop — fall through to plain style toggle */
  }
  menu.style.display = "none";
}

/**
 * Opens (and scrolls to) the extension's settings drawer in the Extensions tab.
 * Lets ST's own inline-drawer click handler do the toggling so we never leave
 * the drawer in a half-open ("stuck") state.
 */
function openSettingsDrawer() {
  const settingsDrawer = document.getElementById("sdc-extension-settings");
  if (!settingsDrawer) {
    console.warn("[Palette Talk] Settings drawer not found");
    return;
  }

  const drawerToggle = settingsDrawer.querySelector(".inline-drawer-toggle");
  const drawerContent = settingsDrawer.querySelector(".inline-drawer-content");

  // Only trigger ST's toggle if the drawer is currently closed. ST sets the
  // 'open' class on the toggle when expanded, so we mirror that check and let
  // ST handle the icon + content state itself (avoids the stuck-drawer bug).
  const isOpen =
    drawerToggle?.classList.contains("open") ||
    drawerContent?.classList.contains("open");
  if (drawerToggle && !isOpen) {
    drawerToggle.click();
  }

  settingsDrawer.scrollIntoView({ behavior: "smooth", block: "start" });

  // Brief highlight effect to draw attention.
  settingsDrawer.classList.add("sdc-settings-flash");
  setTimeout(() => settingsDrawer.classList.remove("sdc-settings-flash"), 800);
}

/**
 * Adds a button to SillyTavern's wand (Extensions) dropdown menu that opens the
 * extension's settings. The menu is built lazily by ST, so we poll for it
 * instead of assuming it exists at init time (this was the source of the
 * "button never shows / hangs in the wand menu" bug).
 *
 * @returns {boolean} true if the button was added or already exists
 */
function addExtensionMenuButton() {
  // ST builds the wand items inside '#extensionsMenu .list-group'. Fall back to
  // the menu root or the gallery wand container for older/newer ST layouts.
  const container =
    document.querySelector("#extensionsMenu .list-group") ||
    document.getElementById("extensionsMenu") ||
    document.getElementById("gallery_wand_container");
  if (!(container instanceof HTMLElement)) return false;

  // Already present — nothing to do.
  if (document.getElementById("sdc-extensions-menu-button")) return true;

  const button = document.createElement("div");
  button.id = "sdc-extensions-menu-button";
  button.className = "list-group-item flex-container flexGap5 interactable";
  button.title = "Open Palette Talk Settings";
  button.tabIndex = 0;
  button.setAttribute("role", "button");

  const icon = document.createElement("i");
  icon.className = "fa-solid fa-palette extensionsMenuExtensionButton";
  const label = document.createElement("span");
  label.textContent = "Palette Talk";
  button.appendChild(icon);
  button.appendChild(label);

  // Guard against double-fire: touch devices fire 'touchend' plus a synthetic
  // 'click' for a single tap. Only preventDefault — do NOT stopPropagation, or
  // ST's delegated document click handler that closes the wand menu won't run.
  let lastFire = 0;
  const activate = (e) => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastFire < 400) return;
    lastFire = now;
    openSettingsDrawer();
    closeExtensionsMenu();
  };
  button.addEventListener("click", activate);
  button.addEventListener("touchend", activate, { passive: false });

  container.appendChild(button);
  return true;
}

/**
 * Polls for ST's wand menu and inserts our button once it exists.
 * @returns {number} interval id (so it can be cleared on dispose)
 */
function scheduleExtensionMenuButton() {
  if (addExtensionMenuButton()) return 0;
  let tries = 0;
  const timer = window.setInterval(() => {
    if (addExtensionMenuButton() || ++tries > 40) {
      clearInterval(timer);
    }
  }, 500);
  return timer;
}

function initializeCharSpecificUI() {
  /**
   * Preset colors for quick selection (readable on both light/dark themes)
   */
  const PRESET_COLORS = [
    { hex: "#E74C3C", name: "Coral Red" },
    { hex: "#E67E22", name: "Orange" },
    { hex: "#F1C40F", name: "Gold" },
    { hex: "#27AE60", name: "Green" },
    { hex: "#3498DB", name: "Blue" },
    { hex: "#9B59B6", name: "Purple" },
  ];

  /**
   *
   * @param {string} id
   * @param {() => STCharacter} stCharGetter
   */
  function createColorOverrideElem(id, stCharGetter) {
    // Create container
    const wrapper = document.createElement("div");
    wrapper.id = id;
    wrapper.className = "sdc-color-override-container";

    // Add subtle separator at top
    const separator = document.createElement("div");
    separator.className = "sdc-separator";

    // Create label row
    const labelRow = document.createElement("div");
    labelRow.className = "sdc-label-row";

    const label = document.createElement("label");
    label.className = "sdc-override-label";
    label.innerHTML = `
            <span>Dialogue Color</span>
            <i class="fa-solid fa-circle-info margin5 opacity50p" 
               title="Pick a preset color or enter a custom hex. Click reset to use auto-detection."></i>
        `;
    labelRow.appendChild(label);

    // Create the inline control row
    const controlRow = document.createElement("div");
    controlRow.className = "sdc-inline-color-row";

    // Preset swatches container
    const presetsContainer = document.createElement("div");
    presetsContainer.className = "sdc-preset-swatches";

    /** @type {HTMLButtonElement[]} */
    const swatchButtons = [];

    // Track current selection state
    let currentColor = "";

    /**
     * Updates the visual selection state of all swatches
     * @param {string} selectedColor
     */
    function updateSwatchSelection(selectedColor) {
      currentColor = selectedColor;
      swatchButtons.forEach((btn) => {
        const isSelected =
          btn.dataset.color.toUpperCase() === selectedColor.toUpperCase();
        btn.classList.toggle("selected", isSelected);
      });
      // Update custom input selection state
      const isCustom =
        selectedColor &&
        !PRESET_COLORS.some(
          (p) => p.hex.toUpperCase() === selectedColor.toUpperCase()
        );
      customInputWrapper.classList.toggle("selected", isCustom);
      // Show/hide reset button
      resetBtn.style.display = selectedColor ? "flex" : "none";
    }

    /**
     * Applies a color override
     * @param {string} colorValue
     */
    function applyColorOverride(colorValue) {
      const stChar = stCharGetter();
      const colorSettings = getSettingsForChar(stChar);

      if (colorValue && colorValue.length > 0) {
        colorSettings.colorOverrides[stChar.avatarName] = colorValue;
      } else {
        delete colorSettings.colorOverrides[stChar.avatarName];
      }

      // Clear cache when override changes
      clearCacheForCharacter(stChar);

      if (stChar.type === CharacterType.PERSONA) {
        onPersonaSettingsUpdated();
      } else {
        onCharacterSettingsUpdated();
      }

      setUIOverrideValue(colorValue);
    }

    /**
     * Updates ONLY the UI state (swatch selection, custom highlight, reset visibility, inputs).
     * Does not update settings.
     *
     * @param {string?} colorValue
     */
    function setUIOverrideValue(colorValue) {
      const value = colorValue ?? "";
      updateSwatchSelection(value);

      // Update custom input to show the color
      if (value) {
        textInput.value = value;
        colorInput.value = value;
      } else {
        textInput.value = "";
        colorInput.value = "#808080";
      }

      // Reflect the chosen colour in the live preview. When cleared, fall back
      // to the auto-detected avatar colour so the preview is still meaningful.
      if (value) {
        updatePreview(value);
      } else {
        updatePreviewFromAuto();
      }
    }

    /**
     * Updates the preview using the colour SDC would auto-pick for this
     * character (avatar-smart / static), so an empty override still previews.
     */
    async function updatePreviewFromAuto() {
      try {
        const stChar = stCharGetter();
        const autoColor = await getCharacterDialogueColor(stChar);
        updatePreview(autoColor ? `#${autoColor.toHex()}` : "");
      } catch (_) {
        updatePreview("");
      }
    }

    // Create preset swatch buttons
    PRESET_COLORS.forEach((preset) => {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "sdc-preset-swatch";
      swatch.dataset.color = preset.hex;
      swatch.style.backgroundColor = preset.hex;
      swatch.title = preset.name;
      swatch.onclick = () => applyColorOverride(preset.hex);
      swatchButtons.push(swatch);
      presetsContainer.appendChild(swatch);
    });

    // Divider between presets and custom
    const divider = document.createElement("div");
    divider.className = "sdc-color-divider";

    // Custom color input wrapper
    const customInputWrapper = document.createElement("div");
    customInputWrapper.className = "sdc-custom-color-wrapper";

    // Hex text input
    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.className = "text_pole sdc-hex-input";
    textInput.placeholder = "#RRGGBB";
    textInput.maxLength = 7;

    // Color picker
    const colorPickerWrapper = document.createElement("div");
    colorPickerWrapper.className =
      "dc-color-picker-wrapper sdc-custom-picker-wrapper";

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.className = "dc-color-picker";
    colorInput.value = "#808080";

    colorPickerWrapper.appendChild(colorInput);

    // Wire up custom input events
    textInput.addEventListener("focusout", () => {
      const validated = getTextValidHexOrDefault(textInput.value, "");
      if (validated) {
        applyColorOverride(validated);
      } else if (textInput.value === "") {
        // Allow clearing via empty input
        applyColorOverride("");
      }
    });

    textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        textInput.blur();
      }
    });

    colorInput.addEventListener("input", () => {
      textInput.value = colorInput.value;
    });

    colorInput.addEventListener("change", () => {
      applyColorOverride(colorInput.value);
    });

    customInputWrapper.appendChild(textInput);
    customInputWrapper.appendChild(colorPickerWrapper);

    // Eyedropper button — pick a colour straight from an avatar (or anywhere on
    // screen with the native EyeDropper API). This is the headline feature.
    const eyedropperBtn = document.createElement("button");
    eyedropperBtn.type = "button";
    eyedropperBtn.className = "menu_button menu_button_icon sdc-eyedropper-btn";
    eyedropperBtn.innerHTML = '<i class="fa-solid fa-eye-dropper"></i>';
    eyedropperBtn.title = isNativeEyeDropperSupported()
      ? "Pick a colour from anywhere on screen (e.g. the avatar)"
      : "Pick a colour by clicking on an avatar image";
    eyedropperBtn.onclick = async () => {
      eyedropperBtn.classList.add("sdc-eyedropper-btn-active");
      try {
        const hex = await pickColor();
        if (hex) applyColorOverride(hex);
      } finally {
        eyedropperBtn.classList.remove("sdc-eyedropper-btn-active");
      }
    };

    // Reset button
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "menu_button menu_button_icon sdc-reset-btn";
    resetBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i>';
    resetBtn.title = "Reset to auto-detect from avatar";
    resetBtn.style.display = "none";
    resetBtn.onclick = () => applyColorOverride("");

    // Assemble the control row
    controlRow.appendChild(presetsContainer);
    controlRow.appendChild(divider);
    controlRow.appendChild(customInputWrapper);
    controlRow.appendChild(eyedropperBtn);
    controlRow.appendChild(resetBtn);

    // Live preview — shows a sample dialogue line in the chosen colour so the
    // user can judge readability before committing.
    const previewRow = document.createElement("div");
    previewRow.className = "sdc-preview-row";
    const previewQuote = document.createElement("span");
    previewQuote.className = "sdc-preview-quote";
    previewQuote.textContent = '"The quick brown fox."';
    const previewLabel = document.createElement("span");
    previewLabel.className = "sdc-preview-label";
    previewLabel.textContent = "Preview";
    previewRow.appendChild(previewLabel);
    previewRow.appendChild(previewQuote);

    /** @param {string} hex */
    function updatePreview(hex) {
      previewQuote.style.color = hex && hex.length ? hex : "";
    }

    // Assemble wrapper
    wrapper.appendChild(separator);
    wrapper.appendChild(labelRow);
    wrapper.appendChild(controlRow);
    wrapper.appendChild(previewRow);

    // Expose a setter so the persona/character change handlers can refresh UI state
    // when the selected persona/character changes.
    /** @type {any} */ (wrapper).__sdcSetColorOverrideValue = setUIOverrideValue;

    // Initialize with current value
    setTimeout(() => {
      const stChar = stCharGetter();
      const colorSettings = getSettingsForChar(stChar);
      const savedColor = colorSettings.colorOverrides[stChar.avatarName] || "";
      setUIOverrideValue(savedColor);
    }, 100);

    return wrapper;
  }

  /**
   * Attempts to insert the character override UI into the character editor.
   * This UI target isn't always present (e.g. if user hasn't opened the editor yet).
   * @returns {boolean} true if inserted or already present
   */
  function tryInsertCharacterOverride() {
    if (document.getElementById("sdc-char_color_override")) return true;

    const elemCharCardForm = document.getElementById("form_create");
    if (!elemCharCardForm) return false;

    const elemAvatarNameBlock = elemCharCardForm.querySelector(
      "div#avatar-and-name-block"
    );
    if (!elemAvatarNameBlock) return false;

    const elemCharColorOverride = createColorOverrideElem(
      "sdc-char_color_override",
      getCharacterBeingEdited
    );
    elemAvatarNameBlock.insertAdjacentElement("afterend", elemCharColorOverride);
    return true;
  }

  /**
   * Finds a good anchor element to insert the persona override UI.
   * Tries known IDs first, then falls back to locating the "Current Persona" label.
   * @returns {{anchor: Element, position: InsertPosition}?}
   */
  function findPersonaOverrideAnchor() {
    const elemPersonaDescription = document.getElementById("persona_description");
    if (elemPersonaDescription?.parentElement) {
      return { anchor: elemPersonaDescription.parentElement, position: "afterbegin" };
    }

    // Fallback: find the label that contains "Current Persona" and insert before its row/container.
    const labels = Array.from(document.querySelectorAll("label"));
    const currentPersonaLabel = labels.find((l) =>
      (l.textContent ?? "").trim().toLowerCase().includes("current persona")
    );
    if (!currentPersonaLabel) return null;

    const row =
      currentPersonaLabel.closest("div") ?? currentPersonaLabel.parentElement;
    if (!row) return null;

    return { anchor: row, position: "beforebegin" };
  }

  /**
   * Attempts to insert the persona override UI into Persona Management settings.
   * This panel may be created lazily, so we retry when DOM changes.
   * @returns {boolean} true if inserted or already present
   */
  function tryInsertPersonaOverride() {
    if (document.getElementById("sdc-persona_color_override")) return true;

    const anchor = findPersonaOverrideAnchor();
    if (!anchor) return false;

    const elemPersonaColorOverride = createColorOverrideElem(
      "sdc-persona_color_override",
      getCurrentPersona
    );
    anchor.anchor.insertAdjacentElement(anchor.position, elemPersonaColorOverride);
    return true;
  }

  function tryInsertAll() {
    const charOk = tryInsertCharacterOverride();
    const personaOk = tryInsertPersonaOverride();
    return { charOk, personaOk };
  }

  // Initial attempt (might only succeed partially depending on which UI panels exist)
  tryInsertAll();

  // Watch for the Persona Management and/or Character Editor DOM being created.
  const injectionObserver = new MutationObserver(
    debounce(() => {
      const { charOk, personaOk } = tryInsertAll();
      if (charOk && personaOk) injectionObserver.disconnect();
    }, 200)
  );
  injectionObserver.observe(document.body, { childList: true, subtree: true });
}

jQuery(async ($) => {
  // Hot-reload guard: if a previous instance is still around (e.g. the user
  // re-installed/updated without a full page reload), tear it down first so we
  // don't end up with duplicate buttons, observers and style sheets.
  if (window.__sdcInitialized && typeof window.__sdcDispose === "function") {
    try {
      window.__sdcDispose();
    } catch (e) {
      console.warn("[Palette Talk] Previous dispose failed:", e);
    }
  }
  window.__sdcInitialized = true;

  /** @type {Array<() => void>} Cleanup callbacks run on dispose. */
  const cleanupTasks = [];
  /** @param {() => void} fn */
  const onDispose = (fn) => cleanupTasks.push(fn);

  const settingsHtml = await $.get(`${extFolderPath}/palette-talk.html`);

  const elemStExtensionSettings2 = document.getElementById(
    "extensions_settings2"
  );
  $(elemStExtensionSettings2).append(settingsHtml);

  initializeStyleSheets();
  initializeSettingsUI();
  initializeNameOverridesUI();
  initializeCharSpecificUI();

  // Add extension menu button for quick access to settings (polls for the wand
  // menu, since ST builds it lazily).
  const wandTimer = scheduleExtensionMenuButton();
  if (wandTimer) onDispose(() => clearInterval(wandTimer));

  eventSource.on(event_types.CHAT_CHANGED, () => {
    updateCharactersStyleSheet();
    updateNamesStyleSheet();
  });
  expEventSource.on(exp_event_type.MESSAGE_ADDED, addAuthorUidClassToMessage);

  expEventSource.on(exp_event_type.CHAR_CARD_CHANGED, (char) => {
    onCharacterChanged(char);
    clearCacheForCharacter(char);
    updateCharactersStyleSheet();
  });
  expEventSource.on(exp_event_type.PERSONA_CHANGED, (persona) => {
    onPersonaChanged(persona);
    clearCacheForCharacter(persona);
    updatePersonasStyleSheet();
  });
  expEventSource.on(exp_event_type.PERSONA_ADDED, (persona) => {
    clearCacheForCharacter(persona);
    updatePersonasStyleSheet();
  });
  expEventSource.on(exp_event_type.PERSONA_REMOVED, (persona) => {
    clearCacheForCharacter(persona);
    updatePersonasStyleSheet();
  });

  eventSource.once(event_types.APP_READY, () => {
    onPersonaChanged(getCurrentPersona()); // Initialize color inputs with starting values.
    addAuthorUidToExistingMessages();
    updateCharactersStyleSheet();
    updatePersonasStyleSheet();
    updateNamesStyleSheet();
  });

  // Watch for persona changes in the Persona Management panel (#PersonaManagement)
  // The avatar containers get a "selected" class when clicked
  const personaManagementObserver = new MutationObserver(
    debounce(() => {
      onPersonaChanged(getCurrentPersona());
    }, 100)
  );

  // Try to observe immediately, and also set up a watcher in case the panel is created later
  function tryObservePersonaManagement() {
    const personaManagement = document.getElementById("PersonaManagement");
    if (personaManagement) {
      personaManagementObserver.observe(personaManagement, {
        subtree: true,
        attributes: true,
        attributeFilter: ["class"],
      });
      return true;
    }
    return false;
  }

  onDispose(() => personaManagementObserver.disconnect());

  if (!tryObservePersonaManagement()) {
    // Panel doesn't exist yet, watch for it to be created
    const panelWatcher = new MutationObserver(() => {
      if (tryObservePersonaManagement()) {
        panelWatcher.disconnect();
      }
    });
    panelWatcher.observe(document.body, { childList: true, subtree: true });
    onDispose(() => panelWatcher.disconnect());
  }

  // Watch for theme changes to update colors automatically
  let lastThemeIsLight = isLightTheme();
  const themeObserver = new MutationObserver(
    debounce(() => {
      // Check if the theme actually changed to avoid unnecessary updates
      const currentThemeIsLight = isLightTheme();
      if (currentThemeIsLight !== lastThemeIsLight) {
        lastThemeIsLight = currentThemeIsLight;
        updateCharactersStyleSheet();
        updatePersonasStyleSheet();
      }
    }, 500)
  );

  themeObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  onDispose(() => themeObserver.disconnect());

  // ---------------------------------------------------------------------
  // Dispose — removes injected DOM/observers so a hot-reload starts clean.
  // ---------------------------------------------------------------------
  window.__sdcDispose = function sdcDispose() {
    for (const task of cleanupTasks) {
      try {
        task();
      } catch (_) {
        /* noop — keep disposing the rest */
      }
    }
    // Remove injected DOM nodes.
    [
      "sdc-extension-settings",
      "sdc-extensions-menu-button",
      "sdc-chars_style_sheet",
      "sdc-personas_style_sheet",
      "sdc-names_style_sheet",
      "sdc-char_color_override",
      "sdc-persona_color_override",
    ].forEach((id) => document.getElementById(id)?.remove());
    window.__sdcInitialized = false;
  };
});

//#endregion Initialization
