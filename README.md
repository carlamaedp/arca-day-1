# Carma Studio — Landing Page

A single-page marketing site for **Carma Studio**, a design and operations studio built on the belief that intentional, high-quality work naturally creates successful results.

🌐 **Live site:** https://carma-studio-landing-page.vercel.app

## About

The page is a self-contained static site (one `index.html` file, no build step). Its design is based on the brand reference in `brand_assets/`, using a dark aubergine palette with purple accents, bold display type, and a script accent.

Sections:

- **Hero** — brand flourish, name, tagline, and call-to-action
- **What we do** — Visual Design, Brand Identity, Operations, and Tech Systems
- **Our process** — Discover → Design → Build → Deliver
- **Contact** — call-to-action and social links

## Structure

```
.
├── index.html                    # The entire landing page (HTML + inline CSS)
└── brand_assets/
    ├── brand.md                  # Brand name, tagline, and audience notes
    ├── brand_logo.png            # Original black-on-cream wordmark
    ├── brand_newlogo.png         # Light decorative flourish (used in the hero)
    └── brand_reference_image.jpg # Visual design reference
```

## Development

No dependencies or build tooling required. To preview locally:

```bash
# From the project root, start any static server, e.g.:
python -m http.server 8000
```

Then open http://localhost:8000 in your browser.

## Deployment

Deployed to [Vercel](https://vercel.com/) as a static site. To deploy an update:

```bash
vercel deploy --prod
```
