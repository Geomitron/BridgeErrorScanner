import { redBright } from 'cli-color'
import { getInput } from './util'

void main()

async function main() {
  try {
    const input = await getInput()
    console.log(input)
  } catch (err) {
    console.log(redBright(err))
  }
}
