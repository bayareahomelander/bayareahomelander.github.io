# pacosun site

Personal site for Paco Sun. Plain HTML, CSS, and a little JavaScript, with no build step.

| File | What it holds |
| --- | --- |
| `index.html` | All page content |
| `styles.css` | Layout, colors (light and dark), and responsive rules |
| `script.js` | The speculative-decoding demo in the Onyx section |

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

- One-line description of Flint, once it's ready to share
- Add new Medium articles to the Writing list as they're published
