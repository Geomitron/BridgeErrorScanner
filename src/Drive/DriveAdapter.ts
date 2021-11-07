import { google } from 'googleapis'
import { drive_v3 } from 'googleapis/build/src/apis/drive/v3'
import Bottleneck from 'bottleneck'
import { Readable } from 'stream'
import { parse } from 'path'
import { DriveFileResponse, DriveFolderResponse, isObject, isObjectArray } from '../Templates'
import { redBright } from 'cli-color'
const drive = google.drive('v3')
const limiter = new Bottleneck({
  minTime: 6,      // Wait 6 ms between requests
  maxConcurrent: 3 // Have at most 3 Drive requests pending
})

const fieldList = 'id,mimeType,modifiedTime,name,originalFilename,fullFileExtension,md5Checksum,size,capabilities,shortcutDetails'

/**
 * @param folderID https://drive.google.com/open?id=<folderID>
 * @returns the list of `DriveFileResponse` objects inside the Google Drive folder with `folderID`.
 * @throws an exception if it failed to read the folder.
 */
export async function readDriveFolder(folderID: string): Promise<DriveFolderResponse[]> {
  return limiter.schedule(async () => _readDriveFolder(folderID))
}

async function _readDriveFolder(folderID: string, nextPageToken?: string, retryCount = 0): Promise<DriveFolderResponse[]> {
  let fileList: drive_v3.Schema$File[]
  try {
    const listResult = await drive.files.list({
      q: `'${folderID}' in parents`,
      fields: `nextPageToken, files(${fieldList})`,
      pageSize: 1000,
      pageToken: nextPageToken
    })
    if (!listResult.data.files) { throw 'Drive response failed to include a list of files.' }
    fileList = listResult.data.files
    nextPageToken = listResult.data.nextPageToken ?? undefined
  } catch (err) {
    const description = isObject(err, 'gaxiosError') ? `Error code ${err.code}` : typeof err == 'string' ? err : undefined
    driveFolderError(folderID, description, description == undefined ? err : undefined)
    if (retryCount >= 5) { throw undefined }

    console.log(`Retry n°${retryCount + 1}...`)
    return await _readDriveFolder(folderID, nextPageToken, retryCount + 1)
  }

  if (typeof nextPageToken === 'string') {
    fileList.push(...await limiter.schedule(() => _readDriveFolder(folderID, nextPageToken)))
  }
  fileList.forEach(file => file.name = getRealFilename(file.originalFilename ?? null, file.name ?? null))
  if (fileList.length == 0) { // Distinguish between an empty folder and an inaccessible folder
    try {
      await drive.files.get({
        fileId: folderID,
        fields: fieldList
      })
    } catch (err) {
      if (isObject(err, 'gaxiosError') && err.code == 404) {
        throw driveFolderError(folderID, `Your account doesn't have permission to view the folder.`)
      } else {
        throw driveFolderError(folderID, undefined, err)
      }
    }
  }
  if (isObjectArray(fileList, 'driveFolderResponse')) { // Folder properties are a subset of file properties
    return fileList
  } else {
    throw driveFolderError(folderID, 'Drive response failed to include some file metadata.', fileList)
  }
}
function driveFolderError(folderID: string, description?: string, err?: unknown) {
  console.log(redBright(`Unable to list files for folder with ID [${folderID}]${description ? ': ' + description : '' }`))
  if (err) { console.log(err) }
}

type DriveItem<T> = T extends 'file' ? DriveFileResponse : DriveFolderResponse
/**
 * @param fileID https://drive.google.com/open?id=<fileID>
 * @returns the `DriveFileResponse` object with `fileID`.
 * @throws an exception if the file was inaccessible or the network failed.
 */
export async function readDriveFile<T extends 'file' | 'folder' = 'file'>(fileID: string, type = 'file' as T): Promise<DriveItem<T>> {
  return limiter.schedule(async () => _readDriveFile(fileID, type))
}
async function _readDriveFile<T extends 'file' | 'folder' = 'file'>(fileID: string, type = 'file' as T, retryCount = 0): Promise<DriveItem<T>> {
  let file: drive_v3.Schema$File
  try {
    const fileResult = await drive.files.get({
      fileId: fileID,
      fields: fieldList
    })
    if (!fileResult.data) { throw `Drive response failed to include the ${type}.` }
    file = fileResult.data
  } catch (err) {
    if (isObject(err, 'gaxiosError')) {
      if (err.code == 404) {
        throw driveFileError(fileID, type, `Your account doesn't have permission to view the ${type}.`)
      } else {
        driveFileError(fileID, type, `Error code ${err.code}`)
      }
    } else {
      driveFileError(fileID, type, undefined, err)
    }

    if (retryCount >= 5) { throw undefined }

    console.log(`Retry n°${retryCount + 1}...`)
    return await limiter.schedule(() => _readDriveFile(fileID, type, retryCount + 1))
  }

  file.name = getRealFilename(file.originalFilename ?? null, file.name ?? null)
  if (type == 'file' && isObject(file, 'driveFileResponse')) {
    return file
  } else if (type == 'folder' && isObject(file, 'driveFolderResponse')) {
    return file as DriveItem<'file'> // Necessary until this is resolved: https://github.com/microsoft/TypeScript/issues/33912
  } else {
    throw driveFileError(fileID, type, `Drive response failed to include some ${type} metadata.`, file)
  }
}
function driveFileError(fileID: string, type: string, description?: string, err?: unknown) {
  console.log(redBright(`Unable to get ${type} with ID [${fileID}]${description ? ': ' + description : '' }`))
  if (err) { console.log(err) }
}

/**
 * Note: await this function and finish the download before starting another download to avoid exceeding the Google rate limit.
 * @param fileID https://drive.google.com/open?id=<fileID>
 * @returns a `PassThrough` stream for a download of the object with `fileID`.
 * @throws an exception if it failed to create the stream.
 */
export async function getDownloadStream(fileID: string): Promise<Readable> {
  return limiter.schedule(async () => _getDownloadStream(fileID))
}

async function _getDownloadStream(fileID: string, retryCount = 0): Promise<Readable> {
  try {
    const streamResult = await drive.files.get({
      fileId: fileID,
      alt: 'media'
    }, {
      responseType: 'stream'
    })

    return streamResult.data
  } catch (err) {
    if (isObject(err, 'gaxiosError')) {
      if (err.code == 404) {
        throw driveStreamError(fileID, `This file was deleted or public access permission was revoked.`)
      } else {
        driveStreamError(fileID, `Error code ${err.code}`)
      }
    } else {
      driveStreamError(fileID, undefined, err)
    }

    if (retryCount >= 10) { throw undefined }

    const delay = Math.pow(4, retryCount + 1)
    console.log(`Retry n°${retryCount + 1}... (${delay}s)`)
    await new Promise<void>(resolve => setTimeout(() => resolve(), 1000 * delay))
    return await limiter.schedule(() => _getDownloadStream(fileID, retryCount + 1))
  }
}
function driveStreamError(fileID: string, description?: string, err?: unknown) {
  console.log(redBright(`Unable to download file with ID [${fileID}]${description ? ': ' + description : '' }`))
  if (err) { console.log(err) }
}

function getRealFilename(originalFilename: string | null, name: string | null) {
  if (originalFilename == null && name == null) {
    console.log(redBright('ERROR: Drive returned an unnamed file.'))
    return 'NAME_UNDEFINED'
  }

  if (originalFilename == null) { return name! }
  if (name == null) { return originalFilename }

  const ext = parse(name).ext
  const originalExt = parse(originalFilename).ext
  if (originalExt == '' || ext == originalExt) {
    return name
  } else {
    return name + originalExt
  }
}
