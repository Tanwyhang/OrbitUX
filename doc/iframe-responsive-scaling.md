# OrbitUX - Responsive iframe Scaling Documentation

## Overview

The Hero component embeds the Framer-generated `index.html` in an iframe and makes it fully responsive to fit any viewport size without scrolling.

## Technical Implementation

### File Structure

```
OrbitUX/
├── public/
│   └── index.html          # Original Framer HTML (1680x1080)
├── components/
│   └── Hero.tsx           # Responsive iframe container
└── app/
    └── page.tsx            # Landing page
```

## Hero Component Logic

### 1. Responsive Scaling Algorithm

```typescript
const handleResize = () => {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  
  const targetWidth = 1680      // Original Framer design width
  const targetHeight = 1080     // Original Framer design height
  
  const widthScale = Math.min(viewportWidth / targetWidth, 1)
  
  const scaledWidth = Math.floor(viewportWidth)  // Always fill 100% width
  const scaledHeight = Math.floor(targetHeight * widthScale)  // Proportional height
}
```

### 2. Key Design Decisions

- **Width**: Always fills 100% of viewport width
- **Height**: Scaled proportionally to maintain aspect ratio
- **Max Scale**: Capped at 1.0 (never upscaled)
- **No Transform**: Direct pixel dimensions instead of CSS transform
- **Scrolling**: Disabled (`scrolling="no"`)

### 3. iframe Properties

```typescript
<iframe
  ref={iframeRef}
  src="/index.html"
  width={dimensions.width}
  height={dimensions.height}
  style={{ maxWidth: '100vw', maxHeight: '100vh' }}
  className="border-0"
  scrolling="no"
  title="OrbitUX Framer Site"
/>
```

## Cross-Origin Communication

### Navigation from iframe to Parent

The `index.html` script intercepts clicks on "Launch Orbit" buttons and communicates with the parent via `postMessage`:

```html
<script>
  window.addEventListener('load', () => {
    const handleLaunchOrbit = (e) => {
      if (e.target.closest('[data-framer-name*="Button"]') || 
          e.target.textContent.includes('Launch') || 
          e.target.textContent.includes('Orbit')) {
        window.parent.postMessage({ type: 'NAVIGATE_TO_SWAP' }, '*')
        e.preventDefault()
        e.stopPropagation()
      }
    }
    document.addEventListener('click', handleLaunchOrbit, true)
  })
</script>
```

### Parent Message Handler

```typescript
const handleMessage = (event: MessageEvent) => {
  if (event.data.type === 'NAVIGATE_TO_SWAP') {
    router.push('/swap')
  }
}
window.addEventListener('message', handleMessage)
```

## Responsive Behavior

### Desktop (>1680px wide)
- Width: 100% of viewport
- Height: Proportionally scaled (may be less than full viewport height)
- Centered vertically

### Mobile (<1680px wide)
- Width: 100% of viewport
- Height: Proportionally scaled to fit
- Fills entire viewport (no letterboxing)

### Portrait Mode
- Width: 100% of viewport
- Height: Scaled based on aspect ratio
- May not fill full height to prevent overflow

## Performance Considerations

1. **Event Listeners**: Cleaned up on unmount to prevent memory leaks
2. **Resize Debouncing**: Updates on every resize event (consider adding debounce for production)
3. **Pixel Rounding**: Uses `Math.floor()` for clean pixel values

## Common Issues & Solutions

### Issue: iframe still scrollable
- **Solution**: Ensure `scrolling="no"` attribute is set
- **Solution**: Add `overflow-hidden` to container div

### Issue: Content overflows viewport
- **Solution**: Add `maxWidth: '100vw'` and `maxHeight: '100vh'` to iframe style
- **Solution**: Verify scale calculation includes `Math.min(scale, 1)`

### Issue: Layout shifts on resize
- **Solution**: Ensure dimensions are set via ref directly, not just via React state
- **Solution**: Remove CSS transitions that cause visual jumps

## Future Improvements

1. Add debouncing to resize handler for better performance
2. Consider `IntersectionObserver` for lazy loading on scroll
3. Add error boundary for iframe loading failures
4. Implement proper type checking for postMessage origin security

## References

- [iframe MDN Documentation](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe)
- [postMessage MDN Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)
- [Next.js iframe best practices](https://nextjs.org/docs/app/api-reference/next/image#when-to-use-instead-of-an-img-tag)
