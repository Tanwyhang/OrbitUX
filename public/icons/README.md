# Extension Icons

Add your extension icons here:

- **icon16.png** - 16x16 pixels (for browser toolbar)
- **icon48.png** - 48x48 pixels (for extension management page)
- **icon128.png** - 128x128 pixels (for Chrome Web Store and extension page)

You can use the `/public/orbit.png` logo as a base and resize it to these dimensions.

For now, the extension may not load properly without these icons. You can:

1. Copy `/public/orbit.png` and resize to these dimensions
2. Use any image editing tool (Photoshop, GIMP, online tools)
3. Generate simple placeholder icons

Example command using ImageMagick (if installed):
```bash
cp /Users/hoshaomun/OrbitUX/public/orbit.png /Users/hoshaomun/OrbitUX/public/icons/icon128.png
convert /Users/hoshaomun/OrbitUX/public/orbit.png -resize 48x48 /Users/hoshaomun/OrbitUX/public/icons/icon48.png
convert /Users/hoshaomun/OrbitUX/public/orbit.png -resize 16x16 /Users/hoshaomun/OrbitUX/public/icons/icon16.png
```
