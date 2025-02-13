import dotenv from 'dotenv'
import http from 'node:http'
import crypto from 'crypto'
import querystring from 'querystring'

import URLSearchParams from 'node:url'

const env = dotenv.config()
if (env.error) {
	console.log(env.error.message)
}

const clientId = env.parsed.CLIENT_ID
const clientSecret = env.parsed.CLIENT_SECRET
const redirectUri = env.parsed.REDIRECT_URI

let token = null
let state = null

const handleLogin = (req, res) => {
	state = crypto.randomBytes(16).toString('hex').slice(0, 16)
	const scope = 'user-read-private user-read-email'

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

const handleGetToken = async (req, res) => {
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

	if (queryParams.state !== state) {
		res.writeHead(400, `Invalid state: ${queryParams.state}`)
		res.end()
		return
	}

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

	token = tokenJson.access_token
	console.log(token)
	res.writeHead(301, {
		Location: 'http://localhost:5173/profile',
	})
	res.end()
}

const handleGetProfile = async (req, res) => {
	const result = await fetch('https://api.spotify.com/v1/me', {
		method: 'GET',
		headers: { Authorization: `Bearer ${token}` },
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

// TODO Filter doamins so only react app and spotify api can send requests here
const requestHandler = (req, res) => {
	res.setHeader('Access-Control-Allow-Origin', '*')
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

	if (req.method === 'OPTIONS') {
		res.writeHead(204)
		res.end()
		return
	}
	// TODO add try-catch to all async handlers
	switch (req.url.split('?')[0]) {
		// TODO Add security rn anyone can call this and get info
		// Called from react app only
		case '/api/login':
			handleLogin(req, res)
			break
		// Called from spotify api only, react doesn't need this
		case '/api/getToken':
			handleGetToken(req, res)
			break
		// Need some session token (like jwt to prove that client is calling this)
		case '/api/getProfile':
			handleGetProfile(req, res)
			break
		default:
			res.writeHead(404, `Requested endpoint: ${req.url} is not suppored`)
			res.end()
			break
	}
}

const server = http.createServer(requestHandler)

server.listen(8000)
