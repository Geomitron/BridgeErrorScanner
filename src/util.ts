import { keyInPause } from 'readline-sync'
import isValidPath from 'is-valid-path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { redBright } from 'cli-color'
import childProcess from 'child_process'
import { getSettings, NamedFolderID, ScanSettings } from './ScanSettings'
import { $Errors, decode, IIniObject, IIniObjectSection } from './ini'
import { SETTINGS_PATH, SNAPSHOT_SETTINGS_PATH } from './paths'

export const scanSettings: ScanSettings = readSettings()

/**
 * Sets up the `scanSettings` object.
 * @throws an exception if the input is invalid.
 */
function readSettings() {

  if (process.argv[3]) {
    throw 'Error: Too many arguments were provided. If a filepath has spaces in it, the path must be surrounded by double quotes.'
  }

  if (process.argv[2]) {
    return getCommandLineArgsSettings()
  } else {
    return getIniSettings()
  }

}

/**
 * @returns `ScanSettings` that are determined using the command line argument
 */
function getCommandLineArgsSettings() {
  const arg = process.argv[2]
  const driveID = parseDriveLink(arg)
  const filepath = parseFilepath(arg)
  if (driveID) {
    return getSettings({ driveFolderIDs: [{ driveID }] })
  } else if (filepath) {
    return getSettings({ chartFolderPath: filepath })
  } else {
    throw `Error: "${arg.substr(0, 200) + (arg.length > 200 ? '...' : '')}" is not a valid Google Drive link or filepath.`
  }
}

/**
 * @returns `ScanSettings` that are determined using the settings.ini file, and possibly using the
 * clipboard if `clipboardLinksMode` is true.
 */
function getIniSettings() {
  if (!existsSync(SETTINGS_PATH)) {
    const settingsIni = readFileSync(SNAPSHOT_SETTINGS_PATH, { encoding: 'utf8' })
    writeFileSync(SETTINGS_PATH, settingsIni)
    console.log('Bridge Error Scanner supports scanning Google Drive folders and chart folders on your computer.')
    console.log('A "settings.ini" file has been created in this folder. Modify it to change the scan behavior.')
    keyInPause('After you have saved your desired settings, press any key to continue...', { guide: false })
  }

  const settingsIni = decode(readFileSync(SETTINGS_PATH, { encoding: 'utf8' }))
  if (settingsIni[$Errors]) {
    throw `Error: invalid "settings.ini" file:\n${settingsIni[$Errors]?.join('\n')}`
  }

  const validatedSettings = validateSettings(settingsIni)

  return getSettings(validatedSettings)
}

/**
 * Reads contents of `settingsIni` to get a `ScanSettings` object of all settings specified.
 * @throws an exception if any settings have invalid formatting.
 */
function validateSettings(settingsIni: IIniObject) {

  const allSections = Object.keys(settingsIni)
  const validSections = ['General Settings', 'Chorus Reviewer Settings']
  const invalidSection = allSections.find(section => !validSections.includes(section))
  if (invalidSection) {
    throw `Error: "settings.ini" contains an invalid section: "${invalidSection}"`
  }

  const generalSection = settingsIni['General Settings']
  const chorusSection = settingsIni['Chorus Reviewer Settings']
  if (!generalSection && !chorusSection) {
    throw `Error: No settings sections found in "settings.ini".`
  }

  const settings: Partial<ScanSettings> = {}

  const readGeneralProperty = getReadIniFunction(generalSection)
  const driveFolderID = readGeneralProperty('driveFolderLink', '', 'Google Drive link', parseDriveLink)
  settings.driveFolderIDs = driveFolderID ? [{ driveID: driveFolderID }] : undefined
  settings.chartFolderPath = readGeneralProperty('chartFolderPath', '', 'file path', parseFilepath)
  settings.fixErrors = readGeneralProperty('fixErrors', false, 'boolean value')
  settings.maxDownloadSizeMB = readGeneralProperty('maxDownloadSizeMB', 0, 'number', parseInt)

  const readChorusProperty = getReadIniFunction(chorusSection)
  settings.clipboardLinksMode = readChorusProperty('clipboardLinksMode', false, 'boolean value')
  settings.minimumChartCount = readChorusProperty('minimumChartCount', 0, 'integer', parseInt)
  settings.seriousErrorThreshold = readChorusProperty('seriousErrorThreshold', 0, 'integer', parseInt)
  settings.maxDownloadsPerDrive = readChorusProperty('maxDownloadsPerDrive', 0, 'integer', parseInt)

  if (settings.clipboardLinksMode) {
    while (true) {
      try {
        keyInPause('Copy text containing one or more Google Drive links to your clipboard, then press any key...', { guide: false })
        settings.driveFolderIDs = parseDriveLinksText(childProcess.execSync('powershell get-clipboard').toString().trim())
      } catch (err) {
        console.log(redBright(err))
      }
    }
  }

  return settings
}

/**
 * @returns the value retrieved from `section[property]`, which should be the same type as `typeExample`.
 * The value is parsed by `parseFunction` first if it's defined.
 * @throws an exception if the value is not the correct type or if `parseFunction` returns `null`.
 */
function getReadIniFunction(section: IIniObjectSection) {
  return <T>(property: string, typeExample: T, description: string, parseFunction?: (value: T) => T | null) => {
    const rawValue = section[property] as unknown as T
    if (typeof rawValue === typeof typeExample) {
      const value = parseFunction ? parseFunction(rawValue) : rawValue
      if (value === null) {
        throw `Error: "${property}" in "settings.ini" is not a valid ${description}.`
      }
      return value
    } else if (typeof rawValue !== 'undefined') {
      throw `Error: "${property}" in "settings.ini" is not a valid ${description}.`
    } else {
      return undefined
    }
  }
}

/**
 * @returns the Drive ID in `link`, or `null` if `link` wasn't a valid Google Drive link.
 */
function parseDriveLink(link: string) {
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
function parseFilepath(path: string) {
  if (isValidPath(path) && existsSync(path)) {
    return path
  } else {
    return null
  }
}

/**
 * @returns `num`, or `null` if `num` wasn't an integer.
 */
function parseInt(num: number) {
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
function parseDriveLinksText(clipboardText: string) {
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

export function isFileError(object: unknown): object is NodeJS.ErrnoException {
  return isObject(object, [ 'errno', 'code', 'path', 'syscall' ])
}

/**
 * @returns `true` if `object` is an object that has all the properties in `properties`.
 */
function isObject(object: unknown, properties: string[]) {
  return typeof object == 'object' && object != null && properties.every(key => key in object)
}
