import { redBright } from 'cli-color'
import { scanSettings } from './ScanSettings'
import { keyInPause } from 'readline-sync'
import { googleAuth } from './Drive/GoogleAuth'
import { DriveScanner, generateSources } from './Drive/DriveScanner'
import { ChartsDownloader } from './Drive/ChartDownloader'
import { scanCharts } from './Chart/Construction/ChartsScanner'
import { DriveMap } from './Drive/DriveInterfaces'

void main()

async function main() {
  try {
    let driveMap: DriveMap = {}
    if (scanSettings.driveFolderIDs) {
      await googleAuth.authenticate()
      const sources = await generateSources(scanSettings.driveFolderIDs)
      driveMap = await new DriveScanner(sources).scanDrive()
      await new ChartsDownloader().downloadCharts(driveMap)
    }

    await scanCharts(driveMap)

    // TODO: check for errors in charts during the scan process
    // TODO: generate standalone .html file that looks like the website to display the generated errors
    //  (replace the drive folder link with a button to copy the path to the folder)
  } catch (err) {
    console.log(redBright(err))
  }
  if (!process.argv[2]) {
    keyInPause('Press any key to close this window.', { guide: false })
  }
}
