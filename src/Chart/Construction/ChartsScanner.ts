import * as fs from 'fs'
import { join, parse, basename } from 'path'
import { ChartFactory } from './ChartFactory'
import { Chart } from '../Chart'
import { appearsToBeChartFolder } from '../ChartUtils'
import { driveLink, readFolder } from '../../UtilFunctions'
import { DriveMap, DriveChart } from '../../Drive/DriveInterfaces'
import { cyan, green, redBright } from 'cli-color'
import { Progress } from '../../ProgressBar'
import { scanSettings } from '../../ScanSettings'

export interface ChartFolder {
  path: string
  files: fs.Dirent[]
}

/**
 * Scans all charts under `scanSettings.chartFolderPath`, grouped into sources.
 * Each source is a direct subfolder in `scanSettings.chartFolderPath` containing more than one chart.
 * One other source is also created for each chart folder in `scanSettings.chartFolderPath`.
 * If a chart or pack was downloaded, it is given the correspoinding `DriveChart` object.
 * @returns an array of `Chart` objects.
 */
export async function scanCharts(downloadedCharts: DriveMap) {
  const downloadsMap: { [path: string]: DriveChart } = {}
  for (const driveID in downloadedCharts) {
    for (const filesHash in downloadedCharts[driveID]) {
      const downloadPath = downloadedCharts[driveID][filesHash].downloadPath
      if (downloadPath) { downloadsMap[downloadPath] = downloadedCharts[driveID][filesHash] }
    }
  }

  const chartFolderMap: { [sourceName: string]: ChartFolder[] } = {}
  const sources = await getSources()

  for (const sourceName in sources) {
    const bar = new Progress(`Finding chart folders [${green(sourceName)}]`, undefined, true)
    const sourceCharts: ChartFolder[] = []
    bar.log(sourceName + '...');;;
    for (const path of sources[sourceName]) {
      sourceCharts.push(...await getChartFiles(path, bar))
    }
    chartFolderMap[sourceName] = sourceCharts
    bar.terminate()
  }

  let totalCount = 0
  for (const sourceName in chartFolderMap) {
    totalCount += chartFolderMap[sourceName].length
  }
  const bar = new Progress('Scanning Charts', totalCount)
  const scannedCharts: Chart[] = []
  for (const sourceName in chartFolderMap) {
    for (const chartFolder of chartFolderMap[sourceName]) {
      bar.increment(basename(chartFolder.path))
      const packPath = Object.keys(downloadsMap).find(path => chartFolder.path.startsWith(path))
      const driveChart = packPath ? downloadsMap[packPath] : undefined // Defined if this chart was downloaded
      try {
        scannedCharts.push(await ChartFactory.construct(chartFolder, driveChart, sourceName))
      } catch (err) {
        if (typeof err === 'string') {
          bar.log(`[${cyan(driveChart ? driveChart.source.ownerName : sourceName)}] ` + redBright('Failed to parse chart:'))
          bar.log(err)
          bar.log(driveChart ? driveLink(driveChart.folderID) : chartFolder.path + '\n')
        } else {
          throw err
        }
      }
    }
  }

  return scannedCharts
}

/**
 * @returns an object containing all the sources in `scanSettings.chartFolderPath` that should be scanned.
 */
async function getSources() {
  const sources: { [sourceName: string]: string[] } = {}

  let files = await readFolder(scanSettings.chartFolderPath)

  for (const file of files) {
    try {
      const source = await getSource(join(scanSettings.chartFolderPath, file.name))
      if (source === null) {
        (sources[basename(scanSettings.chartFolderPath)] ??= []).push(join(scanSettings.chartFolderPath, file.name))
      } else if (source !== undefined) {
        sources[file.name] = source
      }
    } catch (err) { }
  }

  return sources
}

/**
 * @returns an array of direct subfolders of `sourcePath` to be scanned as a single source.
 * @returns `null` if `sourcePath` contains a chart.
 * @returns `undefined` if the folder has no subfolder.
 * @throws an exception if it couldn't be scanned.
 */
async function getSource(sourcePath: string) {
  let files = await readFolder(sourcePath)

  if (appearsToBeChartFolder(files.map(file => parse(file.name).ext.substr(1)))) {
    return null
  } else if (files.some(file => file.isDirectory())) {
    return files.filter(file => file.isDirectory()).map(file => join(sourcePath, file.name))
  } else {
    return undefined
  }
}

/**
 * @returns valid charts in `path` and all its subdirectories.
 */
async function getChartFiles(path: string, bar: Progress) {
  const chartFolders: ChartFolder[] = []

  // Load folder contents
  let files: fs.Dirent[]
  try {
    files = await readFolder(path)
  } catch (err) {
    return []
  }

  // Check for empty folder
  if (files.length == 0) {
    // TODO: addIncompleteError(driveChart, 'emptyFolder', path, 'There are no files in this folder.')
    return []
  }

  // Determine folder structure
  let [hasFolders, hasFiles] = [false, false]
  const isChartFolder = appearsToBeChartFolder(files.map(file => parse(file.name).ext.substr(1)))
  const promises: Promise<ChartFolder[]>[] = []
  for (const file of files) {
    if (file.isDirectory()) {
      hasFolders = true
      if (file.name != '__MACOSX') { // Apple should follow the principle of least astonishment (smh)
        promises.push(getChartFiles(join(path, file.name), bar))
      }
    } else {
      hasFiles = true
    }
  }
  chartFolders.push(...(await Promise.all(promises)).flat())

  if (isChartFolder) {
    if (hasFolders && hasFiles) {
      // TODO: addIncompleteError(driveChart, 'filesFolders', path, `There are subfolders in this chart folder.`)
    }
    chartFolders.push({ path, files })
    bar.log(basename(path));;;
    bar.increment(basename(path))
  }

  return chartFolders
}
