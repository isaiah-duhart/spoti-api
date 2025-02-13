import dotenv from 'dotenv'
import http from 'node:http'
import crypto from 'crypto'
import querystring from 'querystring'
import jwt from 'jsonwebtoken'

const env = dotenv.config()
if (env.error) {
	console.log(env.error.message)
}

const clientId = env.parsed.CLIENT_ID
const clientSecret = env.parsed.CLIENT_SECRET
const redirectUri = env.parsed.REDIRECT_URI
const jwtSecret = env.parsed.JWT_SECRET

// TODO Store tokens in object with jwt as key and token as value
let sessions = []

function generateAccessToken(state) {
	return jwt.sign({ state }, jwtSecret, { expiresIn: '1800s' })
}

function getSessionByParam(param, value) {
	return sessions.find((session) => session[param] === value)
}

function getSession(req) {
	const cookie = req.headers.cookie
	const cookieSplit = cookie.split('=')
	// Getting value of cookie (key=value)
	return (cookieSplit.length > 1) ? getSessionByParam('jwt', cookieSplit[1]) : null
}

function addSession(stateToAdd){
	const existingSession = sessions.find((session) => session.state === stateToAdd)
	if (existingSession === undefined){
		sessions.push({state: stateToAdd, jwt: null, token: null})
	}
}

const handleLogin = (_, res) => {
	const state = crypto.randomBytes(16).toString('hex').slice(0, 16)
	addSession(state)

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

	const session = getSessionByParam('state', queryParams.state)
	if (session === undefined){
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

const handleGetProfile = async (req, res) => {
	const session = getSession(req)

	if (session === null || session === undefined) {
		res.writeHead(400, `Invalid cookie ${req.headers.cookie}`)
		res.end()
		return
	}

	const result = await fetch('https://api.spotify.com/v1/me', {
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

// TODO Filter doamins so only react app and spotify api can send requests here
const requestHandler = (req, res) => {
	res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173')
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
	res.setHeader('Access-Control-Allow-Credentials', 'true')

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
