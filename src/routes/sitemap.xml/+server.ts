import { publicCache } from '#lib/server/cache.ts';
import { PUBLIC_PATHS, sitemapXml } from '#lib/server/seo.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url, setHeaders }) => {
	publicCache(setHeaders);
	return new Response(sitemapXml(url.origin, PUBLIC_PATHS), {
		headers: { 'content-type': 'application/xml' }
	});
};
