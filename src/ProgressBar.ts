import { green, red } from 'cli-color'
import ProgressBar from 'progress'

export class Progress {

  private progressBar: ProgressBar
  private baseWidth: number

  constructor(operation: string, total?: number, showCount = true) {
    this.progressBar = new ProgressBar(`${operation}${total ? ' [:bar] :percent' : ''}${showCount ? ` | :current${total ? '/:total' : ''}` : ''} | :name`, {
      total: total || 1000000,
      width: 35,
      complete: green('='),
      incomplete: red('-')
    })

    this.baseWidth = `${operation}${total ? ' [====================================] 100%' : ''}${showCount ? ` | ${total || 1000}/${total || 1000}` : ''} | `.length
  }

  increment(newText: string, amount = 1) {
    const maxNameLength = process.stdout.columns - 1 - this.baseWidth
    const tokens = { name: newText.length > maxNameLength ? newText.substr(0, maxNameLength - 3) + '...' : newText }
    if (amount > 0) {
      this.progressBar.tick(amount, tokens)
    }
    this.progressBar.render(tokens, true)
  }

  terminate() {
    this.progressBar.terminate()
  }

  /**
   * Same logging functions as `log`, but works in the middle of the progress bar.
   */
  log(text: string) { this.progressBar.interrupt(text) }
}
