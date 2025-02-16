import crypto from 'crypto'
import querystring from 'querystring'
import {
	addSession,
	getSessionByParam,
	generateAccessToken,
    getSession,
} from './sessions.js'

import { clientId, clientSecret, redirectUri } from './env.js'

export const login = (_, res) => {
	const state = crypto.randomBytes(16).toString('hex').slice(0, 16)
	addSession(state)

	const scope = 'user-read-private user-read-email playlist-read-private'

	const params = new URLSearchParams({
		response_type: 'code',
		client_id: clientId,
		scope: scope,
		redirect_uri: redirectUri,
		state: state,
	})

	res.writeHead(200, {
		'Content-Type': 'application/json',
	})
	res.write(
		JSON.stringify({
			location: 'https://accounts.spotify.com/authorize?' + params.toString(),
		})
	)
	res.end()
}

export const loginCallback = async (req, res) => {
	const splitUrl = req.url.split('?')
	if (splitUrl.length < 2) {
		res.writeHead(
			400,
			`Must include code and status in query string: ${req.url}`
		)
		res.end()
		return
	}

	const queryString = splitUrl[1]
	const queryParams = querystring.parse(queryString)

	if (
		queryParams === null ||
		queryParams.code === null ||
		queryParams.state === null
	) {
		res.writeHead(
			400,
			`Missing required state and code fields in query string: ${req.url}`
		)
		res.end()
		return
	}

	const session = getSessionByParam('state', queryParams.state)
	if (session === undefined) {
		res.writeHead(400, `Invalid state ${queryParams.state}`)
		res.end()
		return
	}

	const cookie = generateAccessToken(session.state)
	session.jwt = cookie

	const authOptions = {
		method: 'POST',
		headers: {
			Authorization:
				'Basic ' +
				new Buffer.from(clientId + ':' + clientSecret).toString('base64'),
		},
		body: new URLSearchParams({
			code: queryParams.code,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code',
		}),
	}

	const result = await fetch(
		'https://accounts.spotify.com/api/token',
		authOptions
	)

	if (!result.ok) {
		res.writeHead(400, `Token response status: ${result.status}`)
		res.end()
		return
	}

	const tokenJson = await result.json()
	if (!tokenJson.access_token) {
		res.writeHead(400)
		res.end()
		return
	}

	session.token = tokenJson.access_token
	res.writeHead(301, {
		Location: 'http://localhost:5173/profile',
		// Try same site lax if this doesn't work (it'll send cookie when navigating to frontend from other site (like redirecting in handleGetToken))
		'Set-Cookie': `jwt=${cookie}; Secure; HttpOnly; SameSite=Strict`, // TODO find max-age of token we are getting from spotify and set here as well
	})
	res.end()
}

export const getPlaylists = async (req, res) => {
    await callEndpoint('https://api.spotify.com/v1/me/playlists', req, res)
}

export const getProfile = async (req, res) => {
    await callEndpoint('https://api.spotify.com/v1/me', req, res)
}

const callEndpoint = async (url, req, res) => {
    const session = getSession(req)

	if (session === undefined) {
		res.writeHead(400, 'Invalid cookie')
		res.end()
		return
	}

	const result = await fetch(url, {
		method: 'GET',
		headers: { Authorization: `Bearer ${session.token}` },
	})

	if (!result.ok) {
		res.writeHead(400, result.status)
		res.end()
		return
	}

	const resultJson = await result.json()

	res.writeHead(200, {
		'Content-Type': 'application/json',
	})
	res.write(JSON.stringify(resultJson))
	res.end()
}
