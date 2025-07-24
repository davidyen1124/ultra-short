export interface Env {
	LINKS: KVNamespace;
}

export interface UrlMapping {
	dest: string;
	created: string;
}

export interface UrlMeta {
	clicks: number;
	last: string;
}
