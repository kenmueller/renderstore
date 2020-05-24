import { RequestHandler } from 'express'

declare namespace RenderStore {
	interface Page {
		hash: string
		url: string
		expiration: number | null
		data: Buffer
	}
	
	type PageCache = Record<string, Page>
	
	type GetPageDataResponse = Buffer | string | null | undefined
	type GetPageExpirationResponse = number | null | undefined
	
	interface Config {
		expirationOffset?: number
		
		get(hash: string): GetPageDataResponse | Promise<GetPageDataResponse>
		getExpiration(hash: string): GetPageExpirationResponse | Promise<GetPageExpirationResponse>
		set(page: Page): void | Promise<void>
		remove(hash: string): void | Promise<void>
	}
	
	interface Instance extends RequestHandler {
		update(url: string): Promise<Page>
		remove(url: string): Promise<string>
	}
}

declare interface RenderStore {
	(config: RenderStore.Config): RenderStore.Instance
	(secret: string): RenderStore.Instance
	
	cache: RenderStore.PageCache
	defaultExpirationOffset: number
	
	urlToHash(url: string): string
	didExpire(page: RenderStore.Page): boolean
	defaultConfig(secret: string): RenderStore.Config
}

export = RenderStore
