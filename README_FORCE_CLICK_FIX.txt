Apply these two files:
- agreements.js
- styles.css

This force-fixes the internal E-Agreement SFC/GM sign buttons by:
1. Adding inline onpointerdown/onclick fallback on the buttons.
2. Adding direct button bindings after the dynamic panel renders.
3. Adding global delegated pointerdown/mousedown/click listeners.
4. Preventing agreement read-only mode from disabling internal signature buttons.
5. Rendering/binding the internal signature panel after the form lock logic runs.

After replacing files, redeploy frontend and hard refresh/incognito.
