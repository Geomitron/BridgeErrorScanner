import { redBright } from 'cli-color'
import { scanSettings } from './ScanSettings'
import { keyInPause } from 'readline-sync'
import { googleAuth } from './Drive/GoogleAuth'
import { DriveScanner, generateSources } from './Drive/DriveScanner'

void main()

async function main() {
  try {
    if (scanSettings.driveFolderIDs) {
      await googleAuth.authenticate()
      const sources = await generateSources(scanSettings.driveFolderIDs)
      const driveMap = await new DriveScanner(sources).scanDrive()
      // TODO: download charts from `driveMap`
    }
    // TODO: scan `scanSettings.chartFolderPath` for charts
    // TODO: generate standalone .html file that looks like the website to display the generated errors
    //  (replace the drive folder link with a button to copy the path to the folder)
  } catch (err) {
    console.log(redBright(err))
  }
  if (!process.argv[2]) {
    keyInPause()
  }
}
