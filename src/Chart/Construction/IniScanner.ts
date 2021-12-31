import { Dirent, readFileSync } from 'fs'
import{ join } from 'path'
import { decode, $Errors, IIniObject } from '../../ini'
import { getEncoding, hasIniExtension, hasIniName } from '../ChartUtils'
import { lower, removeStyleTags, isArray } from '../../UtilFunctions'
import { DriveChart } from '../../Drive/DriveInterfaces'
import { CInputMetaBooleanKey, CInputMetaNumberKey, CInputMetaStringKey, CMetaBooleanKey, CMetaNumberKey, CMetaStringKey, defaultMetadata } from '../ChartInterfaces'
import { redBright } from 'cli-color'
import { ChartFolder } from './ChartsScanner'

/**
 * Constructs a `ChartMetadata` object.
 */
export class IniScanner {

  /** The ini object with parsed data from the song.ini file, or the notes.chart file if an ini doesn't exist */
  iniFile: IIniObject

  /** Contains the metadata from the song.ini file */
  metadata = Object.assign({}, defaultMetadata)

  /**
   * @returns a `ChartMetadata` object for the the chart in `chartFolder` (or `null` if the operation failed).
   */
  static construct(chartFolder: ChartFolder, driveChart: DriveChart | undefined) {
    try {
      const iniScanner = new IniScanner(chartFolder, driveChart)
      iniScanner.setChartMetadata()
      return iniScanner.metadata
    } catch (err) {
      return null
    }
  }

  private constructor(private chartFolder: ChartFolder, private driveChart: DriveChart | undefined) {
    this.iniFile = this.getIniAtFilepath(this.getIniFile())
  }

  private addError(errorID: string, description: string) {
    // TODO: addIncompleteError(this.driveChart, errorID, this.filepath, description)
  }

  /**
   * @returns the path to the .ini file in this chart.
   * @throws an exception if no .ini file was found.
   */
  private getIniFile() {
    let iniCount = 0
    let bestIniPath: string | null = null
    let lastIniPath: string | null = null

    for (const file of this.chartFolder.files) {
      if (hasIniExtension(file.name)) {
        iniCount++
        lastIniPath = join(this.chartFolder.path, file.name)
        if (!hasIniName(file.name)) {
          this.addError('invalidIni', `"${file.name}" is not named "song.ini"`)
        } else {
          bestIniPath = join(this.chartFolder.path, file.name)
        }
      }
    }

    if (iniCount > 1) {
      this.addError('multipleIniFiles', `This chart has more than one .ini file.`)
    }

    if (bestIniPath !== null) {
      return bestIniPath
    } else if (lastIniPath !== null) {
      return lastIniPath
    } else {
      this.addError('noMetadata', `This chart doesn't have a "song.ini" file.`)
      throw new Error()
    }
  }

  /**
   * @returns an `IIniObject` derived from the .ini file at `fullPath`.
   */
  private getIniAtFilepath(fullPath: string) {
    let buffer: Buffer
    try {
      buffer = readFileSync(fullPath)
    } catch (err) {
      console.log(redBright(`Error: Failed to read file at [${fullPath}]`, err))
      throw new Error()
    }

    const iniFile = decode(buffer.toString(getEncoding(buffer)))

    const errors = iniFile[$Errors]
    if (errors !== undefined) {
      for (const err of errors.slice(-5)) { // Limit this if there are too many errors
        const line = err.substr(0, 200) // Limit this if the line is excessively long
        this.addError(`invalidIniLine:` + line, `"song.ini" has an invalid .ini line: ${line}`)
      }
    }

    return iniFile
  }

  /**
   * Sets `this.metadata` to the metadata provided in `this.chartFolder` (either from song.ini or notes.chart).
   */
   private setChartMetadata() {

    this.iniFile.song = this.iniFile.song || this.iniFile.Song || this.iniFile.SONG

    if (this.iniFile.song === undefined) {
      this.addError('invalidMetadata', `"song.ini" doesn't have a "[Song]" section.`)
      throw new Error()
    }

    this.extractIniMetadata()
    this.extractIniMetadata('ignored_') // Any ignored_ fields will be used for md5 calculation (CH ignores them, not this code)
  }

  /**
   * Stores all the metadata found in `this.iniFile` (which is a [Song] section) into `this.metadata` (leaves previous values if not found).
   * (Note: changing 'hopo_frequency', 'eighthnote_hopo', 'multiplier_note' will cause the score to be reset)
   * @param prefix a prefix to attach to each ini key.
   */
  private extractIniMetadata(prefix = '') {
    // Charter may be stored in `this.iniFile.song.frets`
    const strings = ['name', 'artist', 'album', 'genre', 'year', ['frets', 'charter'], 'icon', 'loading_phrase'] as const
    this.extractMetadataField<CInputMetaStringKey, CMetaStringKey>(this.extractMetadataString.bind(this), prefix, strings)
    this.metadata.icon = lower(this.metadata.icon) // Icons are interpreted as lowercase in CH
    if (this.metadata.icon === lower(this.metadata.charter)) { this.metadata.icon = '' } // Setting `icon` can be redundant

    // album_track may be stored in `this.iniFile.song.track`
    const integers = ['song_length', 'diff_band', 'diff_guitar', 'diff_rhythm', 'diff_bass', 'diff_drums', 'diff_keys', 'diff_guitarghl', 'diff_bassghl',
      'preview_start_time', ['track', 'album_track'], 'playlist_track', 'hopo_frequency', 'multiplier_note', 'video_start_time'] as const
    this.extractMetadataField<CInputMetaNumberKey, CMetaNumberKey>(this.extractMetadataInteger.bind(this), prefix, integers)

    const decimals = ['delay'] as const
    this.extractMetadataField<CInputMetaNumberKey, CMetaNumberKey>(this.extractMetadataDecimal.bind(this), prefix, decimals)

    const booleans = ['modchart', 'eighthnote_hopo'] as const
    this.extractMetadataField<CInputMetaBooleanKey, CMetaBooleanKey>(this.extractMetadataBoolean.bind(this), prefix, booleans)
  }

  /**
   * Extracts `fields` from `this.metadata` using `extractFunction`.
   * @param fields
   * An array of single keys and two key tuple arrays.
   * With a single key, the field will be extracted from the ini file at that key. It will then be saved in the metadata object at the same key.
   * With an array of two keys, the field will be extracted from the ini file at both keys. (If both are defined, the second field is used)
   * It will then be saved in the metadata object at the second key.
   */
  private extractMetadataField<I, K extends I>(
    extractFunction: ((prefix: string, metadataField: K, iniField?: Exclude<I, K>) => void),
    prefix = '',
    fields: readonly (K | readonly [Exclude<I, K>, K])[]
  ) {
    fields.forEach(value => {
      if (isArray(value)) {
        extractFunction(prefix, value[1], value[0])
        extractFunction(prefix, value[1])
      } else {
        extractFunction(prefix, value)
      }
    })
  }

  /**
   * Stores `this.iniFile.song[prefix + (iniField ?? metadataField)]` into `this.metadata[metadataField]` if that field has an actual string value.
   * Any style tags are removed from the string.
   */
  private extractMetadataString(prefix: string, metadataField: CMetaStringKey, iniField?: Exclude<CInputMetaStringKey, CMetaStringKey>): void {
    const value = this.iniFile.song[prefix + (iniField ?? metadataField)]
    if (typeof value === 'string' && !['', '0', '-1'].includes(value)) {
      this.metadata[metadataField] = removeStyleTags(value)
    }
  }

  /**
   * Stores `this.iniFile.song[prefix + (iniField ?? metadataField)]` into `this.metadata[metadataField]` if that field has an actual number value.
   * All numbers are rounded to the nearest integer.
   */
  private extractMetadataInteger(prefix: string, metadataField: CMetaNumberKey, iniField?: Exclude<CInputMetaNumberKey, CMetaNumberKey>): void {
    const value = this.iniFile.song[prefix + (iniField ?? metadataField)]
    if (typeof value === 'number' && value !== -1) {
      const int = Math.round(value)
      if (int !== value) {
        this.addError('invalidIniLine:' + prefix + iniField, `The "${prefix + iniField}" value in "song.ini" is "${value}", which is not an integer.`)
      }
      this.metadata[metadataField] = int
    }
  }

  /**
   * Stores `this.iniFile.song[prefix + (iniField ?? metadataField)]` into `this.metadata[metadataField]` if that field has an actual number value.
   */
  private extractMetadataDecimal(prefix: string, metadataField: CMetaNumberKey, iniField?: Exclude<CInputMetaNumberKey, CMetaNumberKey>): void {
    const value = this.iniFile.song[prefix + (iniField ?? metadataField)]
    if (typeof value === 'number' && value !== -1) {
      this.metadata[metadataField] = value
    }
  }

  /**
   * Stores `this.iniFile.song[prefix + (iniField ?? metadataField)]` into `this.metadata[metadataField]` if that field has an actual boolean value.
   */
  private extractMetadataBoolean(prefix: string, metadataField: CMetaBooleanKey, iniField?: Exclude<CInputMetaBooleanKey, CMetaBooleanKey>): void {
    const value = this.iniFile.song[prefix + (iniField ?? metadataField)]
    if (typeof value === 'boolean') {
      this.metadata[metadataField] = value
    }
  }
}
