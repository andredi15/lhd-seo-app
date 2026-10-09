# Lighthouse SEO launcher

This is a standalone static waiting page for the public website review. It must be hosted separately from the sleeping Render web service so it can wake the service before redirecting visitors.

## Render Static Site settings

- Repository: the same GitHub repository as the SEO application
- Branch: `master`
- Root directory: `launcher`
- Build command: leave blank
- Publish directory: `.`

After deployment, use the static site's URL for the website button that currently links directly to the audit tool.

The page requests `https://lhd-seo-app.onrender.com/public-api/config`, waits for a successful response, and then redirects to `https://lhd-seo-app.onrender.com/audit`.
