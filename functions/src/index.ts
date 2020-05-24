import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as express from 'express'
import * as cors from 'cors'

admin.initializeApp({
	storageBucket: 'render-store.appspot.com'
})

const app = express()
const firestore = admin.firestore()
const storage = admin.storage().bucket()

export const api = functions.https.onRequest(app)

app.use(cors())

app.get('/api/page/data', async ({ query: { secret, hash } }, res) => {
	try {
		if (!(typeof secret === 'string' && typeof hash === 'string')) {
			res.status(400).send('You must send "secret" and "hash" as query parameters')
			return
		}
		
		const [data] = await storage.file(`pages/${secret}${hash}`).download()
		
		if (!data)
			throw new Error('Page does not exist')
		
		res.send(data)
	} catch (error) {
		console.error(error)
		res.status(404).json(error)
	}
})

app.get('/api/page/expiration', async ({ query: { secret, hash } }, res) => {
	try {
		if (!(typeof secret === 'string' && typeof hash === 'string')) {
			res.status(400).send('You must send "secret" and "hash" as query parameters')
			return
		}
		
		const expiration = (
			await firestore.doc(`pages/${secret}${hash}`).get()
		).get('expiration')
		
		if (typeof expiration !== 'number')
			throw new Error('Page does not exist')
		
		res.send(expiration)
	} catch (error) {
		console.error(error)
		res.status(404).json(error)
	}
})

app.post('/api/page', async (
	{ body: { secret, page: { hash, url, expiration, data } } },
	res
) => {
	try {
		if (!(
			typeof secret === 'string' &&
			typeof hash === 'string' &&
			typeof url === 'string' &&
			typeof expiration === 'number' &&
			typeof data === 'object'
		)) {
			res.status(400).send('Invalid request body. Must include "secret" and "page".')
			return
		}
		
		await Promise.all([
			firestore.doc(`pages/${secret}${hash}`).set({ url, expiration }),
			storage.file(`pages/${secret}${hash}`).save(Buffer.from(data.data))
		])
		
		res.send()
	} catch (error) {
		console.error(error)
		res.status(500).json(error)
	}
})

app.delete('/api/page', async ({ query: { secret, hash } }, res) => {
	try {
		if (!(typeof secret === 'string' && typeof hash === 'string')) {
			res.status(400).send('You must send "secret" and "hash" as query parameters')
			return
		}
		
		await Promise.all([
			firestore.doc(`pages/${secret}${hash}`).delete(),
			storage.file(`pages/${secret}${hash}`).delete()
		])
		
		res.send()
	} catch (error) {
		console.error(error)
		res.status(500).json(error)
	}
})
