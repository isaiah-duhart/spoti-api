import jwt from 'jsonwebtoken'
import { jwtSecret } from './env.js'

// TODO Store tokens in object with jwt as key and token as value
let sessions = []

export function generateAccessToken(state) {
	return jwt.sign({ state }, jwtSecret, { expiresIn: '1800s' })
}

export function getSessionByParam(param, value) {
	return sessions.find((session) => session[param] === value)
}

export function getSession(req) {
	const cookie = getPropValue(req, 'headers.cookie')
    if (cookie === undefined) return undefined
	const cookieSplit = cookie.split('=')
	// Getting value of cookie (key=value)
	return (cookieSplit.length > 1) ? getSessionByParam('jwt', cookieSplit[1]) : undefined
}

export function addSession(stateToAdd){
	const existingSession = sessions.find((session) => session.state === stateToAdd)
	if (existingSession === undefined){
		sessions.push({state: stateToAdd, jwt: null, token: null})
	}
}

const getPropValue = (object, path = '') =>
    path.split('.')
        .reduce((o, x) => o == undefined ? o : o[x]
        , object)