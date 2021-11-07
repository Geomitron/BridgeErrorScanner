import { existsSync, readFileSync, writeFileSync } from 'fs'
import { green, redBright } from 'cli-color'
import childProcess from 'child_process'
import { keyInPause } from 'readline-sync'
import { $Errors, decode, IIniObject, IIniObjectSection } from './ini'
import { SETTINGS_PATH, SNAPSHOT_SETTINGS_PATH } from './paths'
import { parseDriveLink, parseDriveLinksText, parseFilepath, parseInt } from './util'
export const scanSettings: ScanSettings = readSettings()

export interface ScanSettings {

  /** The IDs of Google Drive folders containing charts to download and scan. If not specified, "chartFolderPath" will be scanned. */
  driveFolderIDs?: NamedFolderID[]

  /** The path to the folder that will be scanned. Any downloaded charts will be added to this folder first. */
  chartFolderPath: string

  /** If the charts in "chartFolderPath" should be automatically fixed if possible. */
  fixErrors: boolean

  /** Downloads for files will be skipped if they are larger than this. Set to -1 for no limit. */
  maxDownloadSizeMB: number

  /** Download the contents of multiple Google Drive folders. Drive links will be parsed from the clipboard. */
  clipboardLinksMode: boolean

  /** An error will be generated if a drive folder has fewer charts than this. */
  minimumChartCount: number

  /** Error files for drive folders will be added to a separate folder if they contain more errors than this. */
  seriousErrorThreshold: number

  /** The largest number of charts that will be downloaded from a single Google Drive folder. Set to -1 for no limit. */
  maxDownloadsPerDrive: number
}

export interface NamedFolderID {

  /** The ID part of a Google Drive link */
  driveID: string

  /** The name of the link's owner, if detected */
  ownerName?: string
}

const defaultSettings: ScanSettings = {
  chartFolderPath: '.',
  fixErrors: false,
  maxDownloadSizeMB: -1,
  clipboardLinksMode: false,
  minimumChartCount: 0,
  seriousErrorThreshold: -1,
  maxDownloadsPerDrive: -1
}

/**
 * @param settings An object containing a subset of the desired scan settings.
 * @returns a `ScanSettings` object containing those settings, or the default settings if a value wasn't provided.
 */
function getSettings(settings: Partial<ScanSettings> = defaultSettings): ScanSettings {
  (Object.keys(settings) as (keyof ScanSettings)[]).forEach(key => settings[key] === undefined && delete settings[key])
  return Object.assign({}, defaultSettings, settings)
}

/**
 * Sets up the `scanSettings` object.
 * @throws an exception if the input is invalid.
 */
function readSettings() {
  try {
    if (process.argv[3]) {
      throw 'Error: Too many arguments were provided. If a filepath has spaces in it, the path must be surrounded by double quotes.'
    }

    if (process.argv[2]) {
      return getCommandLineArgsSettings()
    } else {
      return getIniSettings()
    }
  } catch (err) {
    console.log(redBright(err))
    process.exit(1)
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
    keyInPause(green('After you have saved your desired settings, press any key to continue...'), { guide: false })
  }

  const settingsIni = decode(readFileSync(SETTINGS_PATH, { encoding: 'utf8' }), { removeQuotes: true })
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

  if (chorusSection) {
    const readChorusProperty = getReadIniFunction(chorusSection)
    settings.clipboardLinksMode = readChorusProperty('clipboardLinksMode', false, 'boolean value')
    settings.minimumChartCount = readChorusProperty('minimumChartCount', 0, 'integer', parseInt)
    settings.seriousErrorThreshold = readChorusProperty('seriousErrorThreshold', 0, 'integer', parseInt)
    settings.maxDownloadsPerDrive = readChorusProperty('maxDownloadsPerDrive', 0, 'integer', parseInt)
  }

  if (settings.clipboardLinksMode) {
    while (true) {
      try {
        keyInPause('Copy text containing one or more Google Drive links to your clipboard, then press any key...', { guide: false })
        settings.driveFolderIDs = parseDriveLinksText(childProcess.execSync('powershell get-clipboard').toString().trim())
        break
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
