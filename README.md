# Panel de Reparación de Tarjetas — Proyecto GLP

Dashboard estático (HTML + CSS + JS puro, sin build ni backend) para visualizar los
indicadores de reparación de tarjetas del proyecto PHILO/GLP: tendencia mensual,
defectos más frecuentes, puntos de falla en la tarjeta, retrabajo por serial y
productividad por técnico y línea (T1/T2/T3).

Es 100% portable: no usa rutas locales (`C:\`, `file://`, etc.), solo rutas
relativas, y las librerías externas (Chart.js, Google Fonts) se cargan por CDN.
Funciona igual en tu computadora, en GitHub Pages o en cualquier hosting estático.

Incluye **filtro por rango de fechas** (fecha de inicio y fecha de fin) y por
línea/turno (T1/T2/T3/todas). Todos los paneles — KPIs, tendencia, defectos,
puntos de falla, retrabajo y técnicos — se recalculan en el navegador según el
periodo y la línea que elijas.

## Estructura del proyecto

```
Dashboard/
├── index.html            → página principal (ábrela solo vía servidor/GitHub Pages, no con doble clic)
├── style.css              → estilos (tema "placa de circuito")
├── script.js               → lógica: carga de datos, filtros, agregación en vivo, gráficos, tablas
├── data/
│   └── detalle.json       → un registro por reparación (fecha, línea, técnico, defecto, localidad, serial)
└── README.md
```

> **Nota sobre `assets/`:** esta versión del dashboard no usa imágenes propias
> (logo, fondos, íconos) — todo el diseño está hecho en CSS puro. Si más adelante
> quieres agregar un logo de la empresa, crea la carpeta `assets/` y referencia la
> imagen con una ruta relativa, por ejemplo `assets/logo.png`.

## 1. Crear un repositorio nuevo en GitHub

1. Entra a [github.com/new](https://github.com/new).
2. Ponle un nombre, por ejemplo `panel-reparaciones-glp`.
3. Selecciónalo como **público** (los repos privados también sirven con GitHub Pro/Enterprise, pero público es más simple).
4. No marques "Add a README" si vas a subir el que ya tienes (o simplemente sobrescríbelo después).
5. Haz clic en **Create repository**.

## 2. Subir los archivos

**Opción A — desde la web (más fácil, sin usar terminal):**

1. Dentro del repositorio recién creado, haz clic en **Add file → Upload files**.
2. Arrastra toda la carpeta `Dashboard/` (o su contenido: `index.html`, `style.css`, `script.js`, `README.md` y la carpeta `data/` completa).
3. Escribe un mensaje de commit, por ejemplo "Primera versión del dashboard".
4. Haz clic en **Commit changes**.

**Opción B — con Git en terminal:**

```bash
cd Dashboard
git init
git add .
git commit -m "Primera versión del dashboard"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/panel-reparaciones-glp.git
git push -u origin main
```

## 3. Activar GitHub Pages

1. Ve a tu repositorio → pestaña **Settings**.
2. En el menú lateral, entra a **Pages**.
3. En **Build and deployment → Source**, selecciona **Deploy from a branch**.
4. En **Branch**, elige `main` y la carpeta `/ (root)`.
5. Haz clic en **Save**.
6. Espera 1–2 minutos: GitHub construirá el sitio automáticamente.

## 4. Abrir el dashboard

GitHub te mostrará (y también aparecerá en Settings → Pages) una URL como:

```
https://TU-USUARIO.github.io/panel-reparaciones-glp/
```

Ábrela en cualquier navegador — no necesitas instalar nada ni tener el archivo en tu computadora.

## 5. Actualizar los datos más adelante

Los números del dashboard **no están escritos a mano en el HTML**: todo se lee
desde un solo archivo, `data/detalle.json`, con un renglón por cada reparación
registrada. El navegador recalcula KPIs, gráficos y tablas al vuelo según el
periodo y la línea que elijas — por eso el filtro de fechas funciona sin volver
a generar nada.

Cada renglón de `detalle.json` es un arreglo compacto con 6 valores, en este orden:

```
["2025-05-03", "T1", "Isaac", "Falla funcional", "U47", "GLBFLG251804051"]
 fecha           línea  técnico   defecto           localidad   serial
```

Para actualizar el panel con un Excel nuevo:

1. Pide que se regenere `detalle.json` a partir del `.xlsx` actualizado (puedes
   pedírmelo directamente, o reproducir el mismo proceso con pandas: un renglón
   por reparación, con esas 6 columnas en ese orden exacto).
2. Reemplaza `data/detalle.json` con el nuevo archivo (mismo nombre).
3. Sube el cambio a GitHub (arrastrando de nuevo en **Add file → Upload files**,
   o con `git add data/detalle.json && git commit -m "Actualiza datos" && git push`).
4. GitHub Pages se actualiza solo, normalmente en menos de un minuto — no hay que
   tocar `index.html`, `style.css` ni `script.js`.

**Nota técnica:** para mantener el archivo ligero, las categorías de "defecto"
y "localidad" muestran solo las ~40 más frecuentes de todo el histórico; el
resto queda agrupado como `"Otros"`. Si filtras un periodo muy corto donde
predominen defectos poco comunes, es posible que veas `"Otros"` como la
categoría más grande — eso es esperado, no un error.

## Probarlo en tu computadora antes de subirlo

Como el dashboard carga los JSON con `fetch()`, **no lo abras haciendo doble clic**
sobre `index.html` (eso usa `file://` y el navegador bloqueará la carga de los
JSON por seguridad, aunque el JSON esté ahí). En su lugar, levanta un servidor
local simple desde la carpeta del proyecto:

```bash
# con Python (ya viene instalado en la mayoría de sistemas)
cd Dashboard
python -m http.server 8080
# abre http://localhost:8080 en tu navegador
```

o con la extensión **Live Server** de VS Code, haciendo clic derecho sobre
`index.html → Open with Live Server`.

## Qué incluye el dashboard

- **KPIs**: reparaciones totales, tarjetas únicas, tarjetas en retrabajo, promedio
  de reparaciones por tarjeta, máximo de reparaciones en una sola tarjeta —
  todos recalculados según el periodo y línea filtrados.
- **Filtro de fechas** (inicio/fin) con botón para restablecer al periodo completo.
- **Filtro por línea** (T1 / T2 / T3 / todas), combinable con el filtro de fechas.
- **Tendencia mensual** de reparaciones dentro del periodo filtrado (gráfico de línea).
- **Top 15 defectos** normalizados (gráfico de barras).
- **Top 15 puntos de falla** por componente, agrupando variantes de un mismo diseñador (ej. `U44_0`, `U44_1`... → `U44`).
- **Distribución de retrabajo**: cuántas tarjetas se repararon 1, 2, 3... hasta 21+ veces.
- **Tabla de tarjetas con más retrabajo** (candidatas a análisis de causa raíz).
- **Tabla de técnicos** ordenable por columna y con buscador, desglosada por línea.

## Recursos que no se pudieron reconstruir automáticamente

- No existía un archivo HTML previo en esta conversación para "convertir": este
  dashboard se generó desde cero a partir del análisis del Excel `REPARACIONES_GLP.xlsx`.
  Si tenías otra versión con rutas locales, súbela y la adapto a esta misma estructura.
- No se generaron imágenes (logo, fondo, íconos) porque el diseño original no las
  usaba; todo el estilo visual está hecho con CSS. Si quieres un logo de empresa,
  agrégalo en `assets/logo.png` y lo conecto en el HTML.
- Los nombres de técnico y categorías de defecto se normalizaron automáticamente
  (mayúsculas, emojis, acentos, texto duplicado) para que los gráficos y tablas
  sean legibles; si necesitas los valores exactos tal como se capturaron en el
  Excel original, están disponibles en las hojas fuente, no en este dashboard.
