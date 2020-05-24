import { createHash } from 'crypto'
import { Request, RequestHandler, Response } from 'express'
import { getType } from 'mime'
import * as isBot from 'isbot'
import * as puppeteer from 'puppeteer'
import axios from 'axios'
import { gzip, ungzip } from 'node-gzip'

import { Config, Instance, GetPageDataResponse, Page, GetPageExpirationResponse } from '../types'
import { RENDERSTORE_USER_AGENT } from './constants'

export let browser: puppeteer.Browser | null = null

export const defaultConfig = (secret: string): Config => {
	if (!secret)
		throw new Error('RenderStore error: Your secret cannot be empty.')
	
	if (/\s|\/|\\|\./.test(secret))
		throw new Error('RenderStore error: Your secret cannot have spaces, slashes, or periods.')
	
	return {
		get: async hash => {
			const { data } = await axios.get(
				`https://render-store.web.app/api/page/data?secret=${secret}&hash=${hash}`
			)
			
			return data
		},
		getExpiration: async hash => {
			const { data } = await axios.get(
				`https://render-store.web.app/api/page/expiration?secret=${secret}&hash=${hash}`
			)
			
			return data
		},
		set: page => (
			axios.post('https://render-store.web.app/api/page', { secret, page })
		),
		remove: hash => (
			axios.delete(
				`https://render-store.web.app/api/page?secret=${secret}&hash=${hash}`
			)
		)
	}
}

export const createInstance = (
	{ handler, update, remove }: {
		handler: RequestHandler
		update: (url: string) => Promise<Page>
		remove: (url: string) => Promise<string>
	}
) => {
	;(handler as any).update = update // tslint:disable-line
	;(handler as any).remove = remove
	
	return handler as Instance
}

export const shouldRender = (req: Request) => {
	const userAgent = req.header('User-Agent')
	const type = getType(req.originalUrl)
	
	return Boolean(
		userAgent &&
		userAgent !== RENDERSTORE_USER_AGENT && // If equal, this is already a bot request
		isBot(userAgent) && // Make sure that this is a bot
		(!type || type === 'text/html') // Only render HTML pages
	)
}

export const urlToHash = (data: string) =>
	createHash('md5').update(data).digest('hex')

export const dataResponseToPage = async ({ hash, url, data }: {
	hash: string
	url: string
	data: NonNullable<GetPageDataResponse>
}): Promise<Page> => ({
	hash,
	url,
	expiration: null,
	data: typeof data === 'string'
		? (await axios.get(data, { responseType: 'arraybuffer' })).data
		: data
})

export const dataFromUrl = async (url: string) => {
	if (!browser)
		browser = await puppeteer.launch()
	
	const page = await browser.newPage()
	
	await page.setUserAgent(RENDERSTORE_USER_AGENT)
	await page.goto(url, { waitUntil: 'networkidle2' })
	
	const data = await page.evaluate(() => {
		document
			.querySelectorAll('script, iframe')
			.forEach(element => element.remove())
		
		return `<!DOCTYPE html>${
			document.documentElement.outerHTML
		}`
	})
	
	// No need to wait for this
	page.close()
	
	return gzip(data)
}

export const didExpire = ({ expiration }: Page) =>
	expiration === null
		? false
		: Date.now() >= expiration

export const sendPage = ({ req, res, page, getExpiration, update }: {
	req: Request
	res: Response
	page: Page
	getExpiration: (hash: string) => GetPageExpirationResponse | Promise<GetPageExpirationResponse>
	update: (url: string) => Promise<Page>
}) => {
	const promises: Promise<any>[] = []
	const supportsGzip = req.header('Accept-Encoding')?.includes('gzip') ?? false
	
	res.status(200).header('Content-Type', 'text/html')
	
	supportsGzip
		? res.header('Content-Encoding', 'gzip').send(page.data)
		: promises.push(
			ungzip(page.data).then(res.send.bind(res)) // Send the data un-gzipped
		)
	
	promises.push((async () => {
		const expiration = page.expiration ?? await getExpiration(page.hash)
		
		if (typeof expiration === 'number' && Date.now() >= expiration)
			await update(page.url)
	})())
	
	return Promise.all(promises)
}
