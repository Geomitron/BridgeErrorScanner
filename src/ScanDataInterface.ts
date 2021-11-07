import { NamedFolderID } from './ScanSettings'

export interface DriveMap {
  [driveID: string]: ChartMap
}

export interface ChartMap {
  [filesHash: string]: DriveChart
}

export interface DriveChart {

  /** The Google Drive source folder where this chart is hosted. */
  source: Source

  /** If `isArchive`, the name of the archive. If not `isArchive`, this is equal to `folderName`. */
  itemName: string

  /** `true` if this chart was stored as an archive in its source. `false` if it was stored as an uncompressed folder. */
  isArchive: boolean

  /** The filepath where the downloaded copy of this chart is stored, or `null` if it hasn't been downloaded yet. */
  downloadPath: string | null

  /** A hash of this chart's file contents, filenames, and file IDs. If the chart changes, this hash changes. */
  filesHash: string

  /** The name of the Google Drive folder where this chart is hosted. */
  folderName: string

  /** The unique id of the Google Drive folder where this chart is hosted. */
  folderID: string

  /** An array of metadata for each file in this chart. */
  files: DriveFile[]
}

export interface Source extends NamedFolderID {

  /** The name of the link's owner, or the name of the source folder if it wasn't specified */
  ownerName: string

  /** If this source is a Google Drive file, rather than a folder */
  isFileSource: boolean
}

export interface DriveFile {

  /** The unique id of this Google Drive file. */
  id: string

  /** The name of this Google Drive file, including the file extension. */
  name: string

  /** Google's description of this file's type. */
  mimeType: string

  /** The time the latest version of this file was uploaded to Google Drive. (RFC 3339 date-time) */
  modifiedTime: string

  /** The MD5 checksum for the content of this file, calculated by Google Drive. */
  md5Checksum: string

  /** The size of this file's content. (in bytes) */
  size: string
}
