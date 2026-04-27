# InCheck360 MonitorCore PWA Icons

Place these files in your frontend public assets:

- `public/icons/icon-192.png`
- `public/icons/icon-512.png`
- `public/icons/maskable-icon-512.png`
- `public/icons/apple-touch-icon.png`
- `public/favicon.ico` or `public/icons/favicon.ico` depending on your current project structure.

Manifest icon entries:

```json
"icons": [
  {
    "src": "/icons/icon-192.png",
    "sizes": "192x192",
    "type": "image/png",
    "purpose": "any"
  },
  {
    "src": "/icons/icon-512.png",
    "sizes": "512x512",
    "type": "image/png",
    "purpose": "any"
  },
  {
    "src": "/icons/maskable-icon-512.png",
    "sizes": "512x512",
    "type": "image/png",
    "purpose": "maskable"
  }
]
```

HTML head entries:

```html
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="icon" href="/favicon.ico">
```
