# Palette Talk - Changes Summary

## 🆕 Version 3.0.0 - "Palette Talk" Fork (Nufahi)

**Renamed to Palette Talk.** This fork of
`b4bysw0rld/SillyTavern-Smart-Dialogue-Colorizer` adds an eyedropper, live
preview, NPC name colors, mobile support and a hot-reload guard, and restyles
the settings panel.

> The internal name is now `SillyTavern-Palette-Talk`, so settings are stored
> separately and Palette Talk can coexist with the original extension.

### 🧹 Changes
- **Removed the wand (Extensions) menu button.** It was buggy in the original
  (hung in the wand menu / didn't open settings) and redundant — Palette Talk
  has no window of its own, all settings live in the Extensions panel. The
  settings drawer header now shows a palette icon like every other extension.
- **Restyled settings panel** into a rounded card (soft surfaces, pill sections,
  accent-highlighted toggle rows) matching my other extensions.

### ✨ New features
- **Eyedropper (color picker pipette).** Pick a dialogue color straight from a
  character avatar. Uses the native `EyeDropper` API where available (sample any
  pixel on screen), with a click-on-avatar fallback that samples the pixel via
  canvas for browsers without it.
- **Live dialogue preview.** The per-character / persona override UI now shows a
  sample quote in the chosen color so you can judge readability before saving.
  When no override is set, it previews the auto-detected avatar color.
- **Send As / NPC colors by name (fixes upstream Issue #1).** A new settings
  section lets you map a character *name* to a color. "Send As" NPC messages —
  which have no resolvable avatar — are now colored by name. Message author
  resolution no longer hard-fails for these messages.
- **Mobile adaptation.** Bigger touch targets, wrapping controls, and 16px inputs
  to stop iOS Safari zoom. Uses `@media (max-width: 768px), (pointer: coarse)`.
- **Hot-reload guard + dispose.** Re-installing/updating without a full reload no
  longer leaves duplicate buttons, observers or style sheets behind.

---

## Version 1.1.0 - New Features (November 2025)

### Global Color Adjustments
- **Saturation Boost Slider**: Increase color vibrancy with a 0-10 range
- **Brightness Boost Slider**: Make colors brighter with a 0-10 range
- These adjustments apply globally to all colors extracted from avatars in "Avatar Smart" mode
- Separate adjustment controls for both Character and Persona settings
- Cache invalidation ensures adjustments take effect immediately
- Incremental increases only (no negative values) to prevent grey/washed out colors

### Character Name Coloring
- **New Option**: Apply color to character names in addition to dialogue quotes
- Separate toggle checkbox for Character and Persona settings
- Uses the same color source and adjustments as dialogue coloring
- Colors the `.name_text` element in SillyTavern messages

## 🎯 What Was Built

This is an improved version of the Dialogue Colorizer Plus extension with enhanced reliability, better color extraction, and a simplified user interface.

## 🔧 Key Improvements

### 1. Smart Color Extraction (`color-utils.js`)
- **New Function**: `getSmartAvatarColor()`
  - Tries multiple extraction methods: Vibrant → DarkVibrant → LightVibrant → Muted → DarkMuted → LightMuted
  - Falls back to average color if no good swatch is found
- **Quality Filtering**: `isColorQualityGood()`
  - Rejects colors that are too dark (luminance < 0.15)
  - Rejects colors that are too light (luminance > 0.95)
  - Rejects colors that are too desaturated (saturation < 0.2)
- **Average Color Fallback**: `getAverageColorFromSwatches()`
  - Calculates weighted average when vibrant colors fail

### 2. Better Contrast Algorithm (`index.js`)
- Improved `makeBetterContrast()` function:
  - Boosts saturation for dull colors (minimum 0.4)
  - Ensures luminance is in readable range (0.65-0.8)
  - Preserves hue while optimizing visibility

### 3. Simplified UI
- **Removed**:
  - Chat bubble color settings
  - Color target dropdown (quotes only now)
  - Chat bubble lightness slider
- **Kept**:
  - Character dialogue settings
  - Persona dialogue settings
  - Per-character color overrides
  - Static color fallback

### 4. Updated Color Source Options
- **Avatar Smart** (new default) - Intelligent multi-fallback extraction
- **Static Color** - Use one color for all
- **Per-Character Only** - Only use manual overrides
- **Disabled** - Turn off coloring

### 5. Code Refactoring
- Renamed all `xdc-` prefixes to `sdc-` (Smart Dialogue Colorizer)
- Removed unused functions (chat bubble related)
- Improved error messages and logging
- Better code documentation

## 📁 Files Modified

1. **manifest.json** - Updated extension name, author, version
2. **color-utils.js** - Added smart color extraction with quality filtering
3. **index.js** - Removed bubble code, improved contrast, updated to use new color system
4. **dialogue-colorizer.html** - Simplified UI, removed bubble settings
5. **element-creators.js** - Updated dropdown options, removed bubble target
6. **style.css** - Scoped styles to `.sdc-extension-settings`
7. **README.md** - Complete documentation rewrite

## 🔄 Breaking Changes

None! The extension uses a new internal name (`Smart-Dialogue-Colorizer`) so it won't conflict with the original extension. Settings are stored separately.

## 🚀 Usage

### Installation
Place this folder in: `SillyTavern/public/scripts/extensions/third-party/Smart-Dialogue-Colorizer/`

Or use ST's extension installer with your repository URL.

### Configuration
1. Open Extensions panel
2. Find "Smart Dialogue Colorizer"
3. Set Color Source to "Avatar Smart" (recommended)
4. Optionally set per-character colors in Character Editor

## 🎨 CSS Variable

The extension sets `--character-color` on each message element:
```css
.mes[sdc-author_uid="..."] {
    --character-color: #ff6b6b;
}
```

You can use this in custom CSS:
```css
div.mes .mesAvatarWrapper .avatar {
    border: 2px solid var(--character-color);
}
```

## 🧪 Testing Checklist

- [ ] Extension loads without errors
- [ ] Character colors appear on quoted text
- [ ] Persona colors work separately from character colors
- [ ] Per-character overrides work in character editor
- [ ] Colors are readable on dark backgrounds
- [ ] Colors change when switching characters/personas
- [ ] Static color fallback works
- [ ] Settings persist after reload

## 📝 Future Enhancement Ideas

- Add hue shift option for variety
- Add saturation/luminance adjustment sliders
- Add color palette preview
- Add "reset to auto" button for overrides
- Add import/export for color schemes

