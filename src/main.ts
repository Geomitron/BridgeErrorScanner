import { redBright } from 'cli-color'
import { scanSettings } from './util'
import { keyInPause } from 'readline-sync'
import { googleAuth } from './GoogleAuth'

void main()

async function main() {
  try {
    if (scanSettings.driveFolderIDs) {
      await googleAuth.authenticate()
      // TODO: scan and download charts from `scanSettings.driveFolderIDs`
    }
    // TODO: scan `scanSettings.chartFolderPath` for charts
    // TODO: generate standalone .html file that looks like the website to display the generated errors
    //  (replace the drive folder link with a button to copy the path to the folder)
    console.log(scanSettings)
  } catch (err) {
    console.log(redBright(err))
  }
  if (!process.argv[2]) {
    keyInPause()
  }
}
