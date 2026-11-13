export function sitemapXml(origin: string, paths: readonly string[]): string {
	const urls = paths
		.map((path) => `\t<url><loc>${new URL(path, origin).href}</loc></url>`)
		.join('\n');
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robotsTxt(origin: string): string {
	return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`;
}

/** Pages anyone can visit. Listed in the sitemap. */
export const PUBLIC_PATHS = ['/', '/privacy', '/terms'] as const;
