import {catalog, href, names, projectURL} from '../lib/catalog.js';
import {projectSummary} from '../lib/summary.js';

// One character outside the XML 1.0 Char range, such as U+FFFE, makes the whole feed unreadable.
const text = value => String(value).replace(/[^\t\n\r\x20-퟿-�\u{10000}-\u{10FFFF}]/gu, '').replace(/[<>&"']/g, c => `&#${c.charCodeAt(0)};`);
// The catalogue has no "first listed" date, so an edited listing moves to the top; its guid never changes.
const newest = [...catalog.projects].sort((a, b) => Date.parse(b.last_updated) - Date.parse(a.last_updated) || a.id.localeCompare(b.id)).slice(0, 50);

export const GET = ({site}) => new Response(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>Legacy of Goku Hub</title>
<link>${new URL(href(''), site)}</link>
<description>ROM hacks, translations, fan projects and tools for the Legacy of Goku trilogy.</description>
<language>en</language>
<atom:link href="${new URL(href('rss.xml'), site)}" rel="self" type="application/rss+xml"/>
${newest.map(project => `<item><title>${text(project.title)}</title><link>${new URL(projectURL(project), site)}</link><guid>${new URL(projectURL(project), site)}</guid><category>${text(names[project.category])}</category><pubDate>${new Date(project.last_updated).toUTCString()}</pubDate><description>${text(projectSummary(project.description) || project.description)}</description></item>`).join('\n')}
</channel></rss>
`, {headers: {'Content-Type': 'application/rss+xml'}});
