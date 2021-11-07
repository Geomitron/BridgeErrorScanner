import { green, red } from 'cli-color'
import ProgressBar from 'progress'

export class Progress {

  private progressBar: ProgressBar
  private baseWidth: number

  constructor(operation: string, total: number, showCount = true) {
    this.progressBar = new ProgressBar(`${operation} [:bar] :percent${showCount ? ' | :current/:total' : ''} | :name`, {
      total,
      width: 35,
      complete: green('='),
      incomplete: red('-')
    })

    this.baseWidth = `${operation} [====================================] 100%${showCount ? ` | ${total}/${total}` : ''} | `.length
  }

  increment(newText: string, amount = 1) {
    const maxNameLength = process.stdout.columns - 1 - this.baseWidth
    this.progressBar.tick(amount, { name: newText.length > maxNameLength ? newText.substr(0, maxNameLength - 3) + '...' : newText })
  }

  /**
   * Same logging functions as `log`, but works in the middle of the progress bar.
   */
  log(text: string) { this.progressBar.interrupt(text) }
}
