import * as fs from 'fs'
import { join } from 'path'
import sharp from 'sharp'
import { ChartMetadata, ChartData } from './ChartInterfaces'
import { hasAlbumName, hasImageExtension } from './ChartUtils'
import { DriveChart } from '../Drive/DriveInterfaces'
import { cyan, green } from 'cli-color'

export class Chart {

  constructor(
    /** The name of the source folder. This is either the name of `scanSettings.chartFolderPath` or one of its direct subfolders. */
    public sourceName: string,

    /** The path to the folder where this chart is stored */
    public filepath: string,

    /** An array of filenames that are included in `filepath` */
    public files: fs.Dirent[],

    /** The object that holds the chart's download links and Google Drive data */
    public driveData: DriveChart | undefined,

    /** Contains the metadata from the song.ini file (or notes.chart if song.ini doesn't exist) */
    public chartMetadata: ChartMetadata,

    /** Contains useful information derived from notes.chart or notes.mid */
    public chartData: ChartData,

    /** The most recent modification made to the chart files */
    public lastModified: Date | undefined
  ) { }

  /**
   * @returns an image buffer for the album art in the folder `this.filepath`,
   * resized to 500x500 with jpeg quality 75 (or `null` if the album art could not be loaded)
   */
  async getAlbumArt() {
    for (const file of this.files) {
      if (file.isFile() && hasAlbumName(file.name) && hasImageExtension(file.name)) {
        const albumPath = join(this.filepath, file.name)
        try {
          const image = sharp(albumPath)
          const metadata = await image.metadata()
          const heightWidth = `${metadata.height}x${metadata.width}`
          if (heightWidth != '500x500' && heightWidth != '512x512') {
            this.addError('albumSize', `This chart's album art is not 500x500 or 512x512.`)
          }

          return image
            .resize(500, 500)
            .jpeg({ quality: 75 }) // Note: reducing quality is more effective than reducing image size
            .toBuffer()
        } catch (err) {
          this.addError('badAlbum:' + file.name, `Failed to parse "${file.name}"; it may not be formatted correctly.`)
        }
      }
    }

    return null // No album art was able to be retrieved
  }

  /**
   * @returns a string representation of a summary of the chart's original metadata.
   */
   get summaryText() {
    return `"${this.chartMetadata.artist}" - "${this.chartMetadata.name}" (${this.chartMetadata.charter})`
  }

  /**
   * @returns a colorful string representation of a summary of the chart's most updated metadata. (trimmed to fit one line if necessary)
   */
  get cliSummaryText() {
    const [ artist, name, charter ] = [ this.chartMetadata.artist, this.chartMetadata.name, this.chartMetadata.charter ]
    return `"${green(artist.substr(0, 28))}" - "${green(name.substr(0, 28))}" (${cyan(charter.substr(0, 18))})`
  }

  /**
   * @returns a colorful string representation of a summary of the chart's most updated metadata.
   */
  get untrimmedCliSummaryText() {
    const [ artist, name, charter ] = [ this.chartMetadata.artist, this.chartMetadata.name, this.chartMetadata.charter ]
    return `"${green(artist)}" - "${green(name)}" (${cyan(charter)})`
  }

  /**
   * Adds a library issue to `Library.libraryIssues` for this version with `type` and `description`.
   */
  protected addError(errorID: string, errorDescription: string) {
    // TODO: addError(this, errorID, errorDescription)
  }
}
