
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
 export function getSettings(settings: Partial<ScanSettings> = defaultSettings): ScanSettings {
  return Object.assign({}, defaultSettings, settings)
}