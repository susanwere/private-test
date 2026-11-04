# React starter

A minimal React + TypeScript application powered by Vite. The app displays “hello”, ready for new features.

## Get started

Use Node.js 22.12+ (Node.js 22 is used in CI) and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Start building in `src/App.tsx` and add global styles in `src/index.css`.

## Commands

- `npm run dev`: Start the development server.
- `npm run build`: Type-check and create the production bundle in `dist/`.
- `npm run preview`: Serve the production build locally.
- `npm run lint`: Check the source with ESLint.

## Structure

- `index.html`: HTML document and React mount point.
- `src/main.tsx`: React entry point, with StrictMode enabled.
- `src/App.tsx`: Application component displaying “hello”.
- `src/index.css`: Minimal global styles.
- `vite.config.ts`: Vite configuration with the React plugin.
- `.github/workflows/ci.yml`: Build check for pull requests targeting `main`.
