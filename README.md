# InCheck360 MonitorCore Professional Logo / PWA Icon Assets

Use these files to replace the current temporary PWA icons.

Recommended project paths:

- `icons/icon-192.png`
- `icons/icon-512.png`
- `icons/maskable-icon-512.png`
- `icons/apple-touch-icon.png`
- `favicon.ico`
- `assets/incheck360-monitorcore-logo.png`

Manifest icon section:

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

Index head references:

```html
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="icon" href="/favicon.ico">
<meta name="theme-color" content="#ffffff">
```

Important:
- Keep only one PWA file structure if your app is a root static app.
- Prefer `/icons/...` in the repository root.
- Do not duplicate the same files under `/public` unless your final deployment actually serves from `/public`.
- After replacing icons, increment the service worker cache name, for example:
  `incheck360-monitorcore-static-v2`
