# LEXA Brand UI System

## Brand intent

Make LEXA read as a confident, premium business operating system for sales, inventory and business management. The user-supplied wordmark is used in the primary sidebar lockup. The interface stays operationally clear and restrained; the logo's multicolour geometry is not repeated on every card.

## Design tokens

| Token | Value | Primary use |
|---|---|---|
| Midnight navy | `#06132F` | Sidebar, app identity, premium surfaces |
| Royal blue | `#075CF5` | Primary actions, active links, focus accents |
| Cyan | `#08BDEB` | Interactive highlights and secondary accents |
| Emerald | `#00BD83` | Positive/completed/healthy statuses |
| Gold | `#F5C84B` | Highlight and premium detail |
| Orange | `#FF9B18` | Attention accents; warnings continue to use semantic amber |
| Signal red | `#F52235` | Destructive/critical states |
| Cloud | `#F4F7FC` | Light workspace background |

These are proposed implementation token values visually matched to the provided image; they are not asserted as machine-sampled values from source design files.

## UI application

- Official logo replaces the placeholder lettermark and appears in the left navigation.
- Existing shared CSS tokens and components are overlaid by `src/styles/lexa-brand.css`, loaded after the project's current CSS entrypoints.
- Blue primary actions, dark-navy dashboard hero, cyan active-nav/focus accents, emerald positive state and gold attention accents are standardised.
- Purple accents are reduced to a brand-consistent blue treatment.
- A global theme toggle persists light/dark mode in browser `localStorage`; it is not an identity or authorization mechanism.
- Responsive overrides support the existing small-screen sidebar/header; reduced-motion preferences are respected.

## Constraints

The patch preserves React + TypeScript + Vite, the existing routes, data contracts and folder layout. It does not claim to have changed the deployed Vercel site: publish only after the existing ZIP extraction workflow, test suite, TypeScript build and Vercel build have succeeded.
