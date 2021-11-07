import * as fs from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import { cyan, yellow, green, redBright } from 'cli-color'
import childProcess from 'child_process'
import { DriveChart, DriveFile, DriveMap } from '../ScanDataInterface'
import { getDownloadStream } from './DriveAdapter'
import { Progress } from '../ProgressBar'
import { keyInPause, keyInYNStrict } from 'readline-sync'
import { sanitizeFilename } from '../UtilFunctions'
import * as mkdirp from 'mkdirp'
import { scanSettings } from '../ScanSettings'

const unlink = promisify(fs.unlink)
const open = promisify(fs.open)
const futimes = promisify(fs.futimes)
const close = promisify(fs.close)

export class ChartsDownloader {
  /**
   * Downloads `itemsToScan` to `scanSettings.downloadsFilepath`.
   */
  async downloadCharts(itemsToScan: DriveMap) {
    let currentCount = 0
    let totalCount = 0
    let skipCount = 0
    for (const driveID in itemsToScan) {
      const chartCount = Object.values(itemsToScan[driveID]).length
      totalCount += chartCount
      const firstChart = Object.values(itemsToScan[driveID])[0]
      if (firstChart) {
        const targetPath = join(scanSettings.chartFolderPath, sanitizeFilename(firstChart.source.ownerName))
        if (fs.existsSync(targetPath) && keyInYNStrict(`Download path already exists: [${green(targetPath)
            }].\nDelete it before continuing?`)) {
          console.log(`Deleting [${targetPath}]...`)
          fs.rmSync(targetPath, { recursive: true, force: true })
        }
      }
    }

    for (const driveID in itemsToScan) {
      for (const filesHash in itemsToScan[driveID]) {
        const chartToScan = itemsToScan[driveID][filesHash]
        currentCount++
        const srcText = chartToScan.source.ownerName
        const dirText = chartToScan.folderName
        
        try {
          const downloader = new ChartDownloader(chartToScan)
          if (!downloader.previouslyExists) {
            console.log(`Downloading chart ${green(`[${currentCount}/${totalCount}]`)}... ${
              cyan(`[${srcText}]${srcText != dirText ? `:[${dirText}]` : ''}`)}`)
            chartToScan.downloadPath = await downloader.download()
          } else {
            skipCount++
          }
        } catch (err) { continue }
      }
    }

    if (skipCount > 0) {
      console.log(yellow(`${skipCount} chart download${skipCount == 1 ? '' : 's'} were skipped because they had been previously downloaded.`))
    }
  }
}

/**
 * Downloads `itemToScan` to a subfolder of `scanSettings.downloadsFilepath`.
 */
class ChartDownloader {
  private destinationFolder: string
  previouslyExists: boolean

  constructor(private itemToScan: DriveChart) {
    try {
      const groupPath = join(scanSettings.chartFolderPath, sanitizeFilename(itemToScan.source.ownerName))
      mkdirp.sync(groupPath)

      this.destinationFolder = join(groupPath, `${sanitizeFilename(itemToScan.itemName)} [${itemToScan.filesHash.substr(0, 5)}]`)
      this.previouslyExists  = fs.existsSync(this.destinationFolder)

      if (!this.previouslyExists) { fs.mkdirSync(this.destinationFolder) }
    } catch (err) {
      console.log(redBright('Error: Failed to create download folder.'), err)
      throw undefined
    }
  }

  /**
   * Downloads all the files from `this.itemToScan.files` to `this.destinationFolder`.
   * @returns the path to the folder that contains the downloaded files.
   * @throws an exception if the download fails.
   */
  async download() {
    for (const file of this.itemToScan.files) {
      await this.requestDownload(file)
    }

    if (this.itemToScan.isArchive) {
      const filename = sanitizeFilename(this.itemToScan.files[0].name)
      try {
        await this.extractDownload(filename)
      } catch (err) {
        console.log(redBright(`Error: Failed to extract archive at [${join(this.destinationFolder, filename)}]`), err)
        keyInPause(`Please manually extract it to [${this.destinationFolder
          }], then press any key to continue. (don't delete the archive)`, { guide: false })
      }

      try {
        await unlink(join(this.destinationFolder, filename))
      } catch (err) {
        console.log(redBright(`Error: Failed to delete archive at [${join(this.destinationFolder, filename)}]`), err)
        throw undefined
      }
    }

    return this.destinationFolder
  }

  /**
   * Sends a request to download the file at `file.id`.
   * @throws an exception if the download fails.
   */
  private async requestDownload(file: DriveFile) {
    const progressBar = new Progress('Download', Number(file.size), false)

    const downloadStream = await getDownloadStream(file.id)

    const filePath = join(this.destinationFolder, sanitizeFilename(file.name))
    try {
      downloadStream.pipe(fs.createWriteStream(filePath))
    } catch (err) {
      console.log(redBright(`Error: Failed to write to [${filePath}]`, err))
      throw undefined
    }

    downloadStream.on('data', (chunk: Buffer) => {
      progressBar.increment(file.name, chunk.length)
    })

    return new Promise<void>((resolve, reject) => {
      downloadStream.once('error', (err) => {
        console.log(redBright(`Error: Failed to download chart to [${filePath}]`), err)
        reject()
      })

      downloadStream.once('end', () => {
        void this.modifyFileModifiedTime(filePath, new Date(file.modifiedTime)).then(() => resolve())
      })
    })
  }

  private async modifyFileModifiedTime(filePath: string, time: Date) {
    try {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 200)) // Delay for OS file processing
      const fd = await open(filePath, 'r+')
      await futimes(fd, time, time)
      await close(fd)
    } catch (err) {
      console.log(redBright(`Error: Failed to update the last modified time.`), err)
      throw undefined
    }
  }

  /**
   * Extracts the contents of `filename` from `this.destinationFolder` and puts the extracted files in `this.destinationFolder`.
   * @throws an exception if it fails to extract.
   */
  private async extractDownload(fileName: string) {
    const archivePath = join(this.destinationFolder, fileName)
    await new Promise<void>(resolve => setTimeout(() => resolve(), 200)) // Delay for OS file processing

    childProcess.execSync(`"${scanSettings.sevenZipPath}" x "${archivePath}" -o"${this.destinationFolder}"`)
  }
}
