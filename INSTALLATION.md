# Installation Guide - Palette Talk

## 📦 Quick Install

### Method 1: Using SillyTavern's Extension Installer (Recommended)

1. Open SillyTavern
2. Click on the **Extensions** (puzzle piece) icon
3. Click **Install Extension**
4. Enter your repository URL (if hosted on GitHub)
5. Click **Save**
6. Refresh the page

### Method 2: Manual Installation

1. Navigate to your SillyTavern directory
2. Go to: `public/scripts/extensions/third-party/`
3. Create a folder named: `SillyTavern-Palette-Talk`
4. Copy all extension files into this folder:
   ```
   SillyTavern-Palette-Talk/
   ├── manifest.json
   ├── index.js
   ├── palette-talk.html
   ├── style.css
   ├── color-utils.js
   ├── element-creators.js
   ├── settings-utils.js
   ├── st-utils.js
   ├── STCharacter.js
   ├── ExColor.js
   ├── eyedropper.js
   ├── utils.js
   ├── ByRef.js
   ├── Vibrant.min.js
   ├── Vibrant.d.ts
   ├── types.d.ts
   ├── README.md
   └── LICENSE
   ```
5. Refresh SillyTavern (F5 or Ctrl+R)

## ⚙️ Initial Setup

1. Open the **Extensions** panel (puzzle piece icon)
2. Scroll down to find **Palette Talk**
3. Click to expand the settings

### Character Settings
- **Color Source**: Set to "Avatar Smart" (default, recommended)
- **Static Color**: Set a fallback color (default: #e18a24)

### Persona Settings
- **Color Source**: Set to "Avatar Smart" (default, recommended)
- **Static Color**: Set a fallback color for your persona

## 🎨 Setting Per-Character Colors (Optional)

### For Characters:
1. Open the **Character Editor** (edit any character)
2. Look for the **Dialogue Color** row (below avatar)
3. Pick a color one of three ways:
   - Click a **preset swatch**
   - Type a hex color (e.g., `#FF5733` or `F44`) / use the color box
   - Click the **eyedropper** to sample a color from the avatar
4. The **Preview** line shows how the color will look

### For NPCs voiced via "Send As":
1. Open the **Palette Talk** settings (Extensions panel)
2. Find the **Send As / NPC Colors** section
3. Type the NPC's name + a color, click **Add**

### For Personas:
1. Open **User Settings**
2. Go to **Persona** section
3. Look for **Dialogue Color** field
4. Enter a hex color
5. Save

## 🧪 Testing

1. Start or open a chat
2. Look at quoted text in messages (text between `"quotes"`)
3. Colors should automatically apply based on who's speaking
4. Try switching characters to see colors change
5. Send a message as yourself to test persona colors

## 🔧 Troubleshooting

### Colors Not Appearing
- Check if extension is enabled in Extensions panel
- Verify the extension loaded without errors (check browser console: F12)
- Make sure you're using quoted text in messages
- Try refreshing the page (F5)

### Colors Are Too Dark/Light
- The extension has built-in quality filtering
- If a color fails quality checks, it uses a fallback
- You can set per-character overrides for specific colors
- Or use "Static Color" mode for consistent results

### Extension Not Loading
- Check folder name is exactly: `SillyTavern-Palette-Talk`
- Verify all files are present (especially `manifest.json`)
- Check browser console (F12) for error messages
- Make sure SillyTavern is up to date

### Conflicts with Other Extensions
- This extension uses prefix `sdc-` to avoid conflicts
- It can coexist with the original Dialogue Colorizer
- If issues occur, try disabling other dialogue-related extensions

## 📊 Performance Notes

- Colors are cached per character for better performance
- Cache is cleared when avatars change
- Smart extraction runs once per character when first encountered
- Minimal performance impact on chat loading

## 🆘 Getting Help

If you encounter issues:
1. Check browser console (F12) for errors
2. Look for messages starting with `[Palette Talk]`
3. Verify extension version in manifest.json (should be 3.0.0)
4. Report issues with:
   - SillyTavern version
   - Browser and version
   - Error messages from console
   - Steps to reproduce

## 🔄 Updating

### From GitHub (if auto-update is enabled):
1. Extension will update automatically
2. Refresh SillyTavern to load new version

### Manual Update:
1. Backup your settings (export settings from ST)
2. Replace all extension files with new versions
3. Refresh SillyTavern
4. Settings should be preserved automatically

