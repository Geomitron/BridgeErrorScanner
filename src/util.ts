import { keyInPause } from 'readline-sync'
import isValidPath from 'is-valid-path'
import { existsSync } from 'fs'
import { redBright } from 'cli-color'
import childProcess from 'child_process'

/**
 * @returns `{ input: string; type: 'driveLink' | 'filepath' }`
 * @throws an exception if the input is invalid.
 */
export async function getInput() {

  if (process.argv[3]) {
    throw 'Error: Too many arguments were provided. If a filepath has spaces in it, the path must be surrounded by double quotes.'
  }

  if (process.argv[2]) {
    // Input was given on the command line
    return validateInput(process.argv[2])
  } else {
    // Input was not provided
    console.log('Bridge Error Scanner supports scanning Google Drive folders and chart folders on your computer.')

    while (true) {
      try {
        keyInPause('Copy a Google Drive link or the path to a chart folder to your clipboard, then press any key...', { guide: false })
        return validateInput(childProcess.execSync('powershell get-clipboard').toString().trim())
      } catch (err) {
        console.log(redBright(err))
      }
    }
  }
}

/**
 * Checks that `input` is either a valid path to a folder or contains a valid google drive folder.
 * @returns `{ input: string; type: 'driveLink' | 'filepath' }`
 * @throws an exception if the input is not valid.
 */
function validateInput(input: string): { input: string; type: 'driveLink' | 'filepath' } {

  // Look for Drive link
  const result = (input.match(/(?:\/|\?id=)[01][a-zA-Z0-9_-]{10,}/ug) ?? [])[0]
  if (result) {
    return { input: result.startsWith('?id=') ? result.substr(4) : result.substr(1), type: 'driveLink' }
  }

  // Look for folder path
  if (!isValidPath(input) || !existsSync(input)) {
    throw `Error: "${input.substr(0, 200) + (input.length > 200 ? '...' : '')}" is not a valid Google Drive link or filepath.`
  } else {
    return { input, type: 'filepath' }
  }
}
