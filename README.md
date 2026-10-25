# pacosun site

Personal site for Paco Sun. Plain HTML, CSS, and a little JavaScript, with no build step.

| Path | What it holds |
| --- | --- |
| `index.html` | Home: intro, project cards, latest writing, experience summary, contact |
| `onyx/` | Onyx project page and its interactive demos |
| `flint/` | Flint project page, its technique visualizers, and the home-card preview |
| `writing/` | The article series and its transformer map |
| `resume/` | Full resume, styled to print cleanly to PDF |
| `styles.css` | Shared layout, colors (light and dark), and components |
| `script.js` | The scripted speculative-decoding preview on the home page |

Each page folder keeps its own CSS and JS; only `styles.css` and `script.js` are shared.

## Preview locally

```sh
python -m http.server 4173
```

Then open http://localhost:4173.

## Publish on GitHub Pages (free)

1. On GitHub, create a **public** repository named `bayareahomelander.github.io`.
2. From this folder:
   ```sh
   git init -b main
   git add .
   git commit -m "First version of personal site"
   git remote add origin https://github.com/bayareahomelander/bayareahomelander.github.io.git
   git push -u origin main
   ```
3. In the repository, go to **Settings → Pages**, set **Source** to *Deploy from a branch*, and pick `main` / `(root)`.
4. The site goes live at https://bayareahomelander.github.io within a minute or two. Every later push redeploys it.

`.gitignore` keeps the source resume (it includes a phone number) and local tooling out of the repo.

A custom domain can be added later under **Settings → Pages → Custom domain**.

## Open TODOs

- Add new Medium articles to the Writing list as they're published
