import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library/build/src/auth/oauth2client'
import { Credentials } from 'google-auth-library/build/src/auth/credentials'
import * as needle from 'needle'
import { authServer } from './AuthServer'
import { REDIRECT_URI, serverURL } from '../paths'
import { readFileSync, writeFileSync } from 'jsonfile'
import childProcess from 'child_process'
import { isObject } from '../Templates'
import { green } from 'cli-color'

export class GoogleAuth {

  /**
   * Attempts to authenticate the `googleapis` library.
   * @throws an exception if authentication failed.
   */
  async authenticate() {

    // Get client info from server
    const oAuth2Client = await this.getOAuth2Client()

    // Get stored token
    const token = await this.getToken(oAuth2Client)

    // Use the oAuth2Client and token to authenticate the `googleapis` library
    oAuth2Client.setCredentials(token)
    google.options({ auth: oAuth2Client })
  }

  /**
   * @returns an `OAuth2Client` using Bridge's API to get client info.
   * @throws an exception if the connection failed.
   */
  private async getOAuth2Client() {
    return new Promise<OAuth2Client>((resolve, reject) => {
      needle.get(`${serverURL}/api/data/client`, (err, response) => {
        if (err != null) {
          reject('Error: Could not authenticate because client info could not be retrieved from the server: ' + err)
        } else {
          resolve(new google.auth.OAuth2(response.body.CLIENT_ID, response.body.CLIENT_SECRET, REDIRECT_URI))
        }
      })
    })
  }

  /**
   * @returns a previously stored auth token at `./savedGoogleLogin.json`, or create a new one if it doesn't exist.
   * @throws an exception if `./savedGoogleLogin.json` could not be read, or if the connection failed.
   */
  private async getToken(oAuth2Client: OAuth2Client): Promise<Credentials> {
    try {
      return readFileSync('./savedGoogleLogin.json')
    } catch (err) {
      if (!isObject(err, 'fileError') || err.code != 'ENOENT') { throw `savedGoogleLogin.json could not be accessed: ` + err }
    }

    return new Promise<Credentials>((resolve, reject) => {
      authServer.on('listening', () => {
        const authUrl = oAuth2Client.generateAuthUrl({
          access_type: 'offline',
          // This scope is too broad, but is the only one that will actually download files for some dumb reason.
          // If you want this fixed, please upvote/star my issue on the Google bug tracker so they will fix it faster:
          // https://issuetracker.google.com/issues/168687448
          scope: ['https://www.googleapis.com/auth/drive.readonly'],
          redirect_uri: REDIRECT_URI
        })

        // Open authUrl in default browser
        console.log(`\nIn order to download files, Google requires that you log in to a Google account.`)
        console.log(`This doesn't need to be an account that owns the files if those files are publicly shared.`)
        try {
          childProcess.execSync(`powershell start-process """${authUrl}"""`)
          console.log(`A browser window has been opened to allow you to log in.`)
        } catch (err) {
          console.log(`This application failed to open the default browser.`)
          console.log(`Authorize this app to download files by visiting ${authUrl}`)
        }
        console.log(`\nNote: it costs a lot of money to get an application verified to do this, which I haven't done.`)
        console.log(`Google will show you a security warning as a result.`)
        console.log(`A throwaway account will work just as well if you prefer that option.`)
      })

      authServer.on('authCode', async (authCode) => {
        if (authCode == null) {
          return reject('Error: authCode was null')
        }
        try {
          const token = (await oAuth2Client.getToken(authCode)).tokens
          try {
            writeFileSync('./savedGoogleLogin.json', token)
            console.log(green(`\nYour login token has been saved in this folder as "savedGoogleLogin.json".`))
            resolve(token)
          } catch (err) {
            reject('Error: Failed to write token to savedGoogleLogin.json: ' + err)
          }
        } catch (err) {
          reject('Error: Failed to get token using the auth code: ' + err)
        }
      })

      authServer.startServer()
    })
  }
}

export const googleAuth = new GoogleAuth()