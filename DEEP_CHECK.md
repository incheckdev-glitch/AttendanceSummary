# Deep check playbook: `api.incheck360.com` + `websocket.incheck360.com`

## What this does
`deep-check.sh` performs a best-effort diagnostics sweep:
- DNS resolution
- HTTPS headers/body probe
- TLS handshake + certificate chain dump
- Basic WebSocket upgrade handshake over TLS

## Usage
```bash
chmod +x deep-check.sh
./deep-check.sh
```

Optional arguments:
```bash
./deep-check.sh <api_url> <ws_host> <ws_path> <output_dir>
```

Example:
```bash
./deep-check.sh https://api.incheck360.com/ websocket.incheck360.com / ./deep-check-output
```

## Notes
- Some environments block outbound 443 or require a corporate proxy. In that case, TLS probes may fail with networking errors (e.g., `Network is unreachable` or proxy `403`).
- WebSocket endpoints often require a specific path and auth token; if you get non-`101 Switching Protocols`, validate required path/headers.
