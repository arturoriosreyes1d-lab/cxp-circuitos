# 🚨 LEE ESTO ANTES DE INSTALAR 🚨

## El problema con la instalación anterior

Tu deploy falló porque al descomprimir el ZIP **encima** de tu repo, los archivos viejos `.js` (que contenían JSX y no compilan) siguieron presentes. Vite los detectó y rompió el build.

## Solución (elige UNA de las dos)

---

### ✅ Opción 1 — La más segura: borrar carpeta `src/` y reemplazar

Desde la raíz de tu repo local (donde está `package.json`):

```bash
# 1) Borra TODOS los archivos viejos en src/
git rm -r src/

# 2) Descomprime este ZIP encima
#    (asegúrate de que la carpeta src/ del ZIP reemplace todo)

# 3) Confirma que solo queden estos archivos en src/:
ls src/
```

Tu `src/` debe contener EXACTAMENTE estos 12 archivos:

```
App.jsx                  empresas.js     main.jsx
CxcView.jsx              ExportarReporteCxC.jsx   supabase.js
CxpApp.jsx               helpers.js
Login.jsx                components.jsx
db.js                    desktop.ini
```

**NO debe haber:** `App.js`, `Login.js`, `components.js`, `index.js` — si los ves, bórralos.

---

### ✅ Opción 2 — Solo borrar los 4 archivos problemáticos

Si prefieres no tocar el resto, desde la raíz de tu repo:

```bash
git rm -f src/App.js src/Login.js src/components.js src/index.js
```

Luego descomprime el ZIP encima (los archivos correctos ya están renombrados a `.jsx`).

---

## Después de cualquiera de las dos opciones

```bash
git add .
git commit -m "fix: rename .js with JSX to .jsx + sort meses cronológicamente"
git push
```

Vercel volverá a buildear y debería pasar ✓

---

## ¿Cómo verificar localmente antes de hacer push?

```bash
npm install
npm run build
```

Si ves `✓ built in Xs` sin errores rojos, está perfecto. Si no, mándame el log.
