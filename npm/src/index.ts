import { format as formatUrl } from 'url'

import { PageCache, Page, Config, GetPageDataResponse } from '../types'
import { DEFAULT_EXPIRATION_OFFSET } from './constants'
import {
	createInstance,
	shouldRender,
	urlToHash,
	dataResponseToPage,
	dataFromUrl,
	sendPage,
	defaultConfig,
	didExpire
} from './utils'

const cache: PageCache = {}

module.exports = (config: Config | string) => {
	const {
		expirationOffset,
		get,
		getExpiration,
		set,
		remove: _remove
	} = typeof config === 'object'
		? config
		: defaultConfig(config)
	
	const update = async (url: string) => {
		const page: Page = {
			hash: urlToHash(url),
			url,
			expiration: Date.now() + (expirationOffset ?? DEFAULT_EXPIRATION_OFFSET),
			data: await dataFromUrl(url)
		}
		
		await set(cache[page.hash] = page)
		
		return page
	}
	
	const remove = async (url: string) => {
		const hash = urlToHash(url)
		
		await _remove(hash)
		delete cache[hash]
		
		return hash
	}
	
	return createInstance({
		handler: async (req, res, next) => {
			if (shouldRender(req))
				try {
					const url = formatUrl({
						protocol: req.protocol,
						host: req.header('Host'),
						pathname: req.originalUrl
					})
					
					const hash = urlToHash(url)
					
					if (hash in cache) {
						await sendPage({
							req,
							res,
							page: cache[hash],
							getExpiration,
							update
						})
						
						return
					}
					
					let dataResponse: GetPageDataResponse | null = null
					
					try {
						dataResponse = await get(hash)
					} catch (error) {
						// Log the error but keep going
						console.error(`RenderStore error: ${error}`)
					}
					
					if (dataResponse)
						try {
							const page = await dataResponseToPage({
								hash,
								url,
								data: dataResponse
							})
							
							await sendPage({
								req,
								res,
								page: cache[hash] = page,
								getExpiration,
								update
							})
							
							return
						} catch (error) {
							// Log the error but keep going
							console.error(`RenderStore error: ${error}`)
						}
					
					const page: Page = {
						hash,
						url,
						expiration: Date.now() + (expirationOffset ?? DEFAULT_EXPIRATION_OFFSET),
						data: await dataFromUrl(url)
					}
					
					cache[hash] = page
					
					await Promise.all([
						sendPage({ req, res, page, getExpiration, update }),
						set(page)
					])
					
					return
				} catch (error) {
					// Log the error but keep going
					console.error(`RenderStore error: ${error}`)
				}
			
			next()
		},
		update,
		remove
	})
}

module.exports.cache = cache
module.exports.defaultExpirationOffset = DEFAULT_EXPIRATION_OFFSET

module.exports.urlToHash = urlToHash
module.exports.didExpire = didExpire
module.exports.defaultConfig = defaultConfig
