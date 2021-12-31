import * as fs from 'fs'
import { ChartData, ChartMetadata } from '../ChartInterfaces'
import { Chart } from '../Chart'
import { hasChartExtension, hasChartName, hasAudioExtension, hasAudioName, getMainChart } from '../ChartUtils'
import { IniScanner } from './IniScanner'
import { basename, join, parse } from 'path'
import { parseChartFile } from './ChartScanner'
import { parseMidiFile } from './MidScanner'
import { DriveChart } from '../../Drive/DriveInterfaces'
import { lower } from '../../UtilFunctions'
import { ChartFolder } from './ChartsScanner'

/**
 * Constructs a `Chart` object.
 */
export class ChartFactory {

  private chartText: string

  /**
   * @returns a new `Chart` object from the chart `files` found at `filepath`, based on the scanned `driveChart`.
   * @throws a string error description if the chart was not able to be scanned.
   */
  static async construct(chartFolder: ChartFolder, driveChart: DriveChart | undefined, sourceName: string) {
    const newFactory = new ChartFactory(chartFolder, driveChart)

    const metadata = IniScanner.construct(chartFolder, driveChart)
    if (metadata == null) {
      throw `"${newFactory.chartText}" has missing metadata.`
    }
    newFactory.chartText = `"${metadata.artist}" - "${metadata.name}" (${metadata.charter})`

    const hasValidChart = newFactory.hasValidChart()
    newFactory.hasValidAudio()
    const chartData = await newFactory.getChartData()
    const lastModified = newFactory.getLastModified()

    if (!hasValidChart) {
      throw `${newFactory.chartText} has a missing chart file.`
    } else if (chartData == null) {
      throw `${newFactory.chartText} has an invalid chart file.`
    } else {
      return new Chart(sourceName, chartFolder.path, chartFolder.files, driveChart, metadata, chartData, lastModified)
    }
  }

  private constructor(private chartFolder: ChartFolder, private driveChart: DriveChart | undefined) {
    this.chartText = driveChart?.itemName || basename(chartFolder.path)
  }

  /**
   * Adds an error for this chart with `errorID` and `errorDescription`.
   */
  private addError(errorID: string, errorDescription: string) {
    console.log('added error:', errorID, errorDescription)
    // TODO: addIncompleteError(this.driveChart, errorID, this.filepath, errorDescription)
  }

  /**
   * Checks all files under `this.filepath` for any valid chart file(s).
   * Adds an error if no valid chart files were found.
   * @returns `true` if there is a valid chart file in `this.filepath`.
   */
  private hasValidChart() {
    let chartCount = 0

    for (const file of this.chartFolder.files) {
      if (hasChartExtension(file.name)) {
        chartCount++
        if (!hasChartName(file.name)) {
          this.addError('invalidChart:' + file.name, `"${file.name}" is not named "notes${lower(parse(file.name).ext)}".`)
        }
      }
    }

    if (chartCount == 0) {
      this.addError('noChart', `This chart doesn't have a chart file.`)
    }

    if (chartCount > 1) {
      this.addError('multipleCharts', `This chart has more than one chart file.`)
    }

    return (chartCount > 0)
  }

  /**
   * Checks for invalid or missing audio files.
   */
  private hasValidAudio() {
    let audioCount = 0

    for (const file of this.chartFolder.files) {

      if (hasAudioExtension(file.name)) {
        if (!['preview', 'crowd'].includes(parse(lower(file.name)).name)) {
          audioCount++
        }

        if (!hasAudioName(file.name)) {
          this.addError('invalidAudio:' + file.name, `"${file.name}" is not a valid audio stem name.`)
        }
      }
    }

    if (audioCount == 0) {
      this.addError('noAudio', `This chart doesn't have an audio file.`)
    }
  }

  /**
   * Scans the .chart/.mid files from `this.files`.
   * @returns a `ChartData` object for the .chart/.mid file that CH will use (or `null` if the scan failed).
   */
  private async getChartData() {
    const mainChart = getMainChart(this.chartFolder.files)
    let mainChartData: ChartData | null = null
    for (const file of this.chartFolder.files) {
      try {
        let newChartData: ChartData | null = null
        if (parse(lower(file.name)).ext == '.chart') {
          newChartData = await parseChartFile(join(this.chartFolder.path, file.name))
        } else if (parse(lower(file.name)).ext == '.mid') {
          newChartData = await parseMidiFile(join(this.chartFolder.path, file.name))
        }
        mainChartData = (mainChart == file ? newChartData : mainChartData)
      } catch(err) {
        console.log(err)
        this.addError('badChart:' + file.name, `Failed to parse "${file.name}"; it may not be formatted correctly.`)
      }
    }

    return mainChartData
  }

  /**
   * @returns the most recent modification date for any file in `this.driveChart.files`.
   */
  getLastModified() {
    if (!this.driveChart) { return undefined }

    const dates: Date[] = []
    for (const file of this.driveChart.files) {
      dates.push(new Date(file.modifiedTime))
    }

    return dates.reduce((a, b) => a > b ? a : b)
  }
}
