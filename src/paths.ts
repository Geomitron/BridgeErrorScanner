import * as path from 'path'

// Settings
export const SNAPSHOT_SETTINGS_PATH = path.join(__dirname, 'settings.ini')
export const SETTINGS_PATH = './settings.ini'

// URL
export const serverURL = 'bridge-db.net'

// OAuth callback server
export const SERVER_PORT = 42813
export const REDIRECT_BASE = `http://127.0.0.1:${SERVER_PORT}`
export const REDIRECT_PATH = `/oauth2callback`
export const REDIRECT_URI = `${REDIRECT_BASE}${REDIRECT_PATH}`