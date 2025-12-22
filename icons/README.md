# Commit Watch - Icon Generation

This folder contains the extension icons.

## Required Files
The extension needs the following PNG icons:
- `icon16.png` - 16x16 pixels (toolbar icon)
- `icon48.png` - 48x48 pixels (extension management)
- `icon128.png` - 128x128 pixels (Chrome Web Store)

## How to Generate Icons

### Option 1: Use the Generator Tool
1. Open `generate-icons.html` in your browser
2. Click "Download All Icons"
3. Save the downloaded files to this folder

### Option 2: Use an Online Tool
1. Open `icon.svg` in a browser or image editor
2. Export as PNG at 16x16, 48x48, and 128x128 sizes
3. Save to this folder with the appropriate names

### Option 3: Use Command Line (requires Inkscape)
```bash
inkscape icon.svg --export-type=png --export-filename=icon16.png -w 16 -h 16
inkscape icon.svg --export-type=png --export-filename=icon48.png -w 48 -h 48
inkscape icon.svg --export-type=png --export-filename=icon128.png -w 128 -h 128
```

### Option 4: Use ImageMagick
```bash
convert -background none icon.svg -resize 16x16 icon16.png
convert -background none icon.svg -resize 48x48 icon48.png
convert -background none icon.svg -resize 128x128 icon128.png
```

## Icon Design
The icon represents a commit node with branches extending in four directions:
- Green background (#2ea44f) - GitHub's primary action color
- White commit circle in the center
- White branch lines extending outward
