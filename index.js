import http from 'node:http'
import { login, loginCallback, getProfile, getPlaylists } from './endpoints.js'

const server = http.createServer((req, res) => {
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
			login(req, res)
			break
		// Called from spotify api only, react doesn't need this
		case '/api/loginCallback':
			loginCallback(req, res)
			break
		// Need some session token (like jwt to prove that client is calling this)
		case '/api/profile':
			getProfile(req, res)
			break
		case '/api/playlists':
			getPlaylists(req, res)
			break
		default:
			res.writeHead(404, `Requested endpoint: ${req.url} is not suppored`)
			res.end()
			break
	}
})

server.listen(8000)
