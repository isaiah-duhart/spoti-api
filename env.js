import dotenv from 'dotenv'

const env = dotenv.config()
if (env.error) {
	console.log(env.error.message)
}

export const clientId = env.parsed.CLIENT_ID
export const clientSecret = env.parsed.CLIENT_SECRET
export const redirectUri = env.parsed.REDIRECT_URI
export const jwtSecret = env.parsed.JWT_SECRET
