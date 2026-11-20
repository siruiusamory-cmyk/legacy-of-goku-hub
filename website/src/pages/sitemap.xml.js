import {catalog, href, projectURL} from '../lib/catalog.js';

export const GET = ({site}) => new Response(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['', 'how-to-patch/', 'submit/', 'ratings-privacy/'].map(href).map(url => `<url><loc>${new URL(url, site)}</loc></url>`).join('\n')}
${catalog.projects.map(project => `<url><loc>${new URL(projectURL(project), site)}</loc><lastmod>${project.last_updated}</lastmod></url>`).join('\n')}
</urlset>
`, {headers: {'Content-Type': 'application/xml'}});
