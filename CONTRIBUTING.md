<!-- eslint-disable markdown/no-html -->

# Contributing to PeteZahGames

Thanks for your interest in contributing! This document outlines the conventions
and rules for working in this repository. Please follow these guidelines to keep
changes safe, consistent, and easy to review.

---

## Commit Message Conventions

Use clear prefixes in your commit messages to describe the type of change:

- **Add:** for new features, routes, or pages _Example:
  `Add: new /api/profile endpoint`_

- **Fix:** for bug fixes or patches _Example:
  `Fix: session token not persisting in /api/signin`_

- **Update:** for dependency bumps, config changes, or non-breaking improvements
  _Example: `Update: pnpm-lock.yaml with latest @mercuryworkshop packages`_

- **Docs:** for documentation-only changes _Example:
  `Docs: expand README with deployment notes`_

- **Chore:** for maintenance tasks (linting, formatting, CI/CD tweaks) _Example:
  `Chore: add .gitpod.yml for dev environments`_

Keep messages short but descriptive. Use the imperative mood (“Add”, not
“Added”).

---

## Development Workflow

0. **Open in your IDE**
   - First you will want to open your IDE, if you can not get to an IDE right
     now use on of the following buttons
     <a href="https://codespaces.new/PeteZah-Games/petezahgames"><img src="https://github.com/codespaces/badge.svg" height="32" alt="Open in GitHub Codespaces"><a href="https://gitpod.io/#https://github.com/PeteZah-Games/petezahgames"><img src="https://gitpod.io/button/open-in-gitpod.svg" height="32" alt="Open in Gitpod"></a><a href="https://app.codeanywhere.com/#https://github.com/PeteZah-Games/petezahgames"><img src="https://codeanywhere.com/img/open-in-codeanywhere-btn.svg" height="32" alt="Open in Codenywhere"></a>

   - Next if you haven't already install Node.js and pnpm by going to
     [the node.js download page](https://nodejs.org/en/download) and having an
     option be to install pnpm

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Build the project**

   ```bash
   pnpm build
   ```

3. **Run locally**

   ```bash
   pnpm start
   ```

   Then visit [localhost:3000](https://localhost:3000).

4. **Environment variables**
   - Required: `SUPABASE_URL`, `SUPABASE_KEY`, `SESSION_SECRET`, `Port`
   - Use `.env.development` for local testing.
   - **Never commit real secrets** use placeholders in configs.

---

## Project Conventions

- **Static-first**: UI changes should go in `public/` (HTML, CSS, JS).
- **API routes**: Add new handlers under `server/api/` and wire them in
  `server.js`.
- **Proxy logic**: If you touch `/bare/`, `/scram/`, or service worker code
  (`public/sw.js`), update both server and client sides together.
- **Auth/session**: Preserve `req.session.user` and `req.session.access_token`
  semantics.

---

## Safe Contribution Practices

- Keep edits **small and scoped**. Avoid sweeping refactors.
- Test locally before opening a PR.
- Do not assume a `build` script exists — the app runs directly with
  `node server.js`.
- Respect deployment templates (`Dockerfile`, `railway.manifest.json`,
  `render.yaml`, etc.).

---

## Don’ts

- Don’t commit secrets or Supabase keys.
- Don’t break service worker ↔ bare route coupling.
- Don’t remove or rename static paths without updating `server.js`.

---

## How to Contribute

1. Fork the repo and create a feature branch.
2. Make your changes following the rules above.
3. Commit with the proper prefix (`Add:`, `Fix:`, etc.).
4. Open a Pull Request with a clear description of your change.

---

By following these conventions, you help keep PeteZahGames stable, secure, and
fun to work on. Thanks for contributing!
