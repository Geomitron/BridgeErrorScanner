import { DriveMap, DriveFile, Source } from '../ScanDataInterface'
import { readDriveFolder, readDriveFile } from './DriveAdapter'
import { createHash } from 'crypto'
import { green, magentaBright, yellow } from 'cli-color'
import { appearsToBeChartFolder, driveLink, lower } from '../util'
import { DriveFileResponse, DriveFolderResponse, DriveShortcutResponse } from '../Templates'
import { NamedFolderID, scanSettings } from '../ScanSettings'
import { keyInYNStrict } from 'readline-sync'

interface DrivePair {
  id: string
  name: string
}

interface StackItem {
  isFile: boolean
  self: DrivePair
  parent: DrivePair
  source: Source
  isSource?: boolean
  isShortcut?: boolean
}

const MIME_TYPES = {
  shortcut: 'application/vnd.google-apps.shortcut',
  folder: 'application/vnd.google-apps.folder'
}

export async function generateSources(namedFolderIDs: NamedFolderID[]) {
  console.log(`Reading ${namedFolderIDs.length} Google Drive folder${namedFolderIDs.length == 1 ? '' : 's'}.`)
  let errorOccurred = false
  const sources: Source[] = []
  for (const namedFolderID of namedFolderIDs) {
    try {
      const result = await readDriveFile(namedFolderID.driveID, 'folder')
      sources.push({
        driveID: namedFolderID.driveID,
        ownerName: namedFolderID.ownerName ?? result.name,
        isFileSource: result.mimeType !== MIME_TYPES.folder
      })
    } catch (err) {
      errorOccurred = true
    }
  }

  if (errorOccurred) {
    console.log(`Errors occured when scanning Google Drive, and some folders couldn't be accessed.`)
    if (!keyInYNStrict(`Continue downloading the remaining charts?`)) { throw 'Scan cancelled.' }
  }

  return sources
}

export class DriveScanner {
  private errorOccurred = false
  private scanStack: StackItem[] = []
  private results: DriveMap = {}

  private visitedDriveIDs: Set<string> = new Set()
  private sourceDriveIDs: Set<string>

  constructor(private sources: Source[]) {
    this.sourceDriveIDs = new Set(sources.map(source => source.driveID))

    for (const source of sources) {
      this.scanStack.push({
        isFile: source.isFileSource,
        self: { id: source.driveID, name: source.ownerName },
        parent: { id: source.driveID, name: source.ownerName },
        source: source,
        isSource: true
      })
    }
  }

  /**
   * Scans all Google Drive folders in `sources`.
   * @returns a `DriveMap` of all the chart files in those sources.
   */
  async scanDrive() {
    let sourceCounter = 1

    while (this.scanStack.length > 0) {
      const stackItem = this.scanStack.pop()!

      // Avoid scanning IDs multiple times (could cause loops and duplicates; this line ensures no two sources have the same `filesHash`es)
      if (stackItem.isShortcut && this.visitedDriveIDs.has(stackItem.self.id)) { continue }

      if (stackItem.isSource) {
        console.log(`${yellow(`[${sourceCounter++}/${this.sources.length}]`)} Scanning [${green(stackItem.source.ownerName)}]...`)
        this.results[stackItem.source.driveID] = {}
      }

      this.visitedDriveIDs.add(stackItem.self.id)

      const items = await this.readItems(stackItem)

      const potentialChartFiles: DriveFileResponse[] = []
      for (const item of items) {
        if (!stackItem.source.isFileSource && this.sourceDriveIDs.has(item.id)) { continue } // Avoid scanning nested folder sources
        if (this.sourceDriveIDs.has(item.id)) { continue } // Avoid scanning nested sources
        this.visitedDriveIDs.add(item.id) // Protects against multiple shortcuts pointing to the same file
        const nextStackItem: StackItem = {
          isFile: false,
          self: { id: item.id, name: item.name },
          parent: stackItem.self,
          source: stackItem.source
        }

        if (!this.isFile(item)) { // Add subfolders to the top of the scan stack
          this.scanStack.push(nextStackItem)
        } else if (item.size && scanSettings.maxDownloadSizeMB > -1 && Number(item.size) > scanSettings.maxDownloadSizeMB) {
          console.log(`${yellow('WARNING:')} [${item.name}] in [${driveLink(stackItem.self.id)}] is too large to download`)
        } else if (this.isShortcut(item)) { // Add shortcut targets to the bottom of the scan stack (lower priority)
          nextStackItem.isFile = item.shortcutDetails.targetMimeType != MIME_TYPES.folder
          nextStackItem.self.id = item.shortcutDetails.targetId
          nextStackItem.isShortcut = true
          this.scanStack.unshift(nextStackItem)
        } else if (item.fullFileExtension && ['zip', 'rar', '7z'].includes(lower(item.fullFileExtension))) { // Add archive files to results
          console.log(`[${green(stackItem.source.ownerName)}] Archive: ${magentaBright(item.name)}`)
          const filesHash = this.getFilesHash([item])
          this.results[stackItem.source.driveID][filesHash] = {
            source: stackItem.source,
            itemName: item.name,
            isArchive: true,
            downloadPath: null,
            folderName: stackItem.isFile ? stackItem.parent.name : stackItem.self.name,
            folderID: stackItem.isFile ? stackItem.parent.id : stackItem.self.id,
            filesHash: filesHash,
            files: [item]
          }
        } else if (item.fullFileExtension != undefined) { // Add regular files to `potentialChartFiles`
          potentialChartFiles.push(item)
        }
      }

      if (appearsToBeChartFolder(potentialChartFiles.map(file => file.fullFileExtension))) {
        console.log(`[${green(stackItem.source.ownerName)}] Chart folder [${
            stackItem.self.name}]: [${potentialChartFiles.map(file => magentaBright(file.name)).join(', ')}]`)

        const filesHash = this.getFilesHash(potentialChartFiles)
        this.results[stackItem.source.driveID][filesHash] = {
          source: stackItem.source,
          itemName: stackItem.self.name,
          isArchive: false,
          downloadPath: null,
          folderName: stackItem.self.name,
          folderID: stackItem.self.id,
          filesHash: filesHash,
          files: potentialChartFiles
        }
      }
    }

    if (this.errorOccurred) {
      console.log(`Errors occured when scanning Google Drive, and some charts couldn't be accessed.`)
      if (!keyInYNStrict(`Continue downloading the remaining charts?`)) { throw 'Scan cancelled.' }
    }
  
    return this.simplifyDriveMap(this.results)
  }

  /**
   * @returns `true` if `file` is a Google Drive shortcut.
   */
  private isShortcut(file: DriveFolderResponse): file is DriveShortcutResponse {
    return file.mimeType == MIME_TYPES.shortcut
  }

  private isFile(file: DriveFolderResponse): file is DriveFileResponse {
    return file.mimeType != MIME_TYPES.folder
  }

  /**
   * @returns a `DriveFileResponse` array, or `[]` if an error was encoutered when reading the item.
   */
  private async readItems(item: StackItem, itemID = item.self.id, itemIsFile = item.isFile) {
    try {
      const responseItems = itemIsFile ? [await readDriveFile(itemID)] : await readDriveFolder(itemID)
  
      // Resolve shortcuts to files that belong inside a chart folder
      for (let i = 0; i < responseItems.length; i++) {
        const responseItem = responseItems[i]
        if (this.isShortcut(responseItem) && responseItem.shortcutDetails.targetMimeType != MIME_TYPES.folder) {
          if (this.visitedDriveIDs.has(responseItem.shortcutDetails.targetId)) { continue }
          if (responseItem.fullFileExtension && !['zip', 'rar', '7z'].includes(lower(responseItem.fullFileExtension))) {
            responseItems[i] = (await this.readItems(item, responseItem.shortcutDetails.targetId, true))[0]
          }
        }
      }
      return responseItems
    } catch (err) {
      this.errorOccurred = true
      return []
    }
  }

  /**
   * @returns an MD5 hash of all the files in `files` (including the `id` and `name`).
   */
  private getFilesHash(files: DriveFileResponse[]) {
    const md5s = files.map(file => file.md5Checksum + file.id + file.name)
    return createHash('md5').update(md5s.sort().join()).digest('hex')
  }

  /**
   * @returns the same `driveMap` map, but only with the properties in `DriveMap`.
   */
  private simplifyDriveMap(driveMap: DriveMap) {
    for (const driveID of Object.keys(driveMap)) {
      for (const filesHash of Object.keys(driveMap[driveID])) {
        driveMap[driveID][filesHash].files = this.simplifyDriveFiles(driveMap[driveID][filesHash].files)
      }
    }

    return driveMap
  }

  /**
   * @returns the same `files` array, but only with the properties in `DriveFile`.
   */
  private simplifyDriveFiles(files: DriveFile[]) {
    const results: DriveFile[] = []
    for (const file of files) {
      results.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        modifiedTime: file.modifiedTime,
        md5Checksum: file.md5Checksum,
        size: file.size
      })
    }

    return results
  }
}