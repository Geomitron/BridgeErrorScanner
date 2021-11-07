import isValidPath from 'is-valid-path'
import { existsSync } from 'fs'
import { NamedFolderID } from './ScanSettings'

/**
 * @returns the Drive ID in `link`, or `null` if `link` wasn't a valid Google Drive link.
 */
export function parseDriveLink(link: string) {
  const result = (link.match(/(?:\/|\?id=)[01][a-zA-Z0-9_-]{10,}/ug) ?? [])[0]
  if (result) {
    return result.startsWith('?id=') ? result.substr(4) : result.substr(1)
  } else {
    return null
  }
}

/**
 * @returns `path`, or `null` if `path` wasn't a valid path or it wasn't accessible.
 */
export function parseFilepath(path: string) {
  if (isValidPath(path) && existsSync(path)) {
    return path
  } else {
    return null
  }
}

/**
 * @returns `num`, or `null` if `num` wasn't an integer.
 */
export function parseInt(num: number) {
  if (!isNaN(Number(num)) && Math.round(num) === num) {
    return num
  } else {
    return null
  }
}

/**
 * @returns an array of objects containing the Drive IDs and owner name from `clipboardText`.
 * @throws an exception if no Google Drive links were found in `clipboardText`.
 */
export function parseDriveLinksText(clipboardText: string) {
  const resultsWithSlash = clipboardText.match(/(?:\/|\?id=)[01][a-zA-Z0-9_-]{10,}/ug) ?? []
  const driveIDs = resultsWithSlash.map(result => result.startsWith('?id=') ? result.substr(4) : result.substr(1))
  const namedIDs = driveIDs.map(driveID => { return { driveID } as NamedFolderID })
  if (namedIDs.length == 0) { throw 'Input did not contain any valid Google Drive links.' }

  console.log(`${namedIDs.length} Google Drive link${namedIDs.length == 1 ? '' : 's'} detected.`)

  // Code specific to the Chorus Discord server to try to auto-detect link owners
  const contextFragments = clipboardText.split(/(?:\/|\?id=)[01]/)
  for (const namedID of namedIDs) {
    for (const fragment of contextFragments) {
      if (fragment.startsWith(namedID.driveID.substr(1))) {
        const result = fragment.match(/anything else convenient\.\s+([^\n]*)\s+/u)
        if (result != null && result[1].trim() != '') {
          namedID.ownerName = result[1].trim()
        }
      }
    }
  }

  return namedIDs
}

/**
 * @returns `true` if the list of filename `extensions` appears to be intended as a chart folder.
 */
export function appearsToBeChartFolder(extensions: string[]) {
  const ext = extensions.map(extension => lower(extension))
  const containsNotes = (ext.includes('chart') || ext.includes('mid'))
  const containsAudio = (ext.includes('ogg') || ext.includes('mp3') || ext.includes('wav') || ext.includes('opus'))
  return (containsNotes || containsAudio)
}

/**
 * @returns `https://drive.google.com/open?id=${fileID}`
 */
export function driveLink(fileID: string) {
  return `https://drive.google.com/open?id=${fileID}`
}

/**
 * @returns `text` converted to lower case.
 */
export function lower(text: string) {
  return text.toLowerCase()
}