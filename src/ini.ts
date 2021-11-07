export const $Errors: unique symbol = Symbol('Parsing Errors')
export const $NoSection: unique symbol = Symbol('Lines before any sections')

export interface IParseConfig {
  comment?: string
  delimiter?: string
  removeQuotes?: boolean
}

export interface IStringifyConfig {
  delimiter?: string
  blankLine?: boolean
  spaceBefore?: boolean
  spaceAfter?: boolean
  keyOrder?: string[]
}

export interface IIniObject {
  [$NoSection]?: IIniObjectSection
  [section: string]: IIniObjectSection
  [$Errors]?: Error[]
}

export interface IIniObjectSection {
  [key: string]: IniValue
}

export type IniValue = string | number | boolean

const createParseError = (line: string) => new Error(`Unsupported type of line: "${line}"`)
const sectionNameRegex = /\[(.+)]$/

export function decode(data: string, params?: IParseConfig) {
  const {
    delimiter = '=',
    comment = ';',
    removeQuotes = false,
  } = { ...params }

  const lines = data.split(/\r?\n/g)
  let currentSection = ''
  const result: IIniObject = {}

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if ((line.length === 0) || (line.startsWith(comment))) { continue }

    if (line[0].startsWith('[')) {
      const match = sectionNameRegex.exec(line)
      if (match !== null) {
        currentSection = match[1].trim()
      } else {
        (result[$Errors] ??= []).push(createParseError(line))
      }
    } else if (line.includes(delimiter)) {
      const delimeterPos = line.indexOf(delimiter)
      const key = line.slice(0, delimeterPos).trim()
      let value = line.slice(delimeterPos + 1).trim()
      if (removeQuotes) value = value.toString().replace(/^"(.*)"$/, '$1')
      const convertedValue = convertType(value)

      if (currentSection !== '') {
        (result[currentSection] ??= {})[key] = convertedValue
      } else {
        (result[$NoSection] ??= {})[key] = convertedValue
      }
    } else {
      (result[$Errors] ??= []).push(createParseError(line))
    }
  }

  return result
}

export function encode(iniObject: IIniObject, params?: IStringifyConfig) {
  const {
    delimiter = '=',
    blankLine = true,
    spaceBefore = false,
    spaceAfter = false,
    keyOrder = [],
  } = { ...params }
  keyOrder.reverse()
  const chunks: string[] = []

  const addSectionChunks = (section: IIniObjectSection) => {
    for (const key of Object.keys(section).sort((a, b) => (keyOrder.indexOf(b) - keyOrder.indexOf(a)) * -1)) {
      chunks.push(`${key}${spaceBefore ? ' ' : ''}${delimiter}${spaceAfter ? ' ' : ''}${section[key].toString()}`)
    }
  }

  const noSection = iniObject[$NoSection]
  if (noSection !== undefined) { addSectionChunks(noSection) }

  let isFirstSection = true
  for (const section of Object.keys(iniObject)) {
    if (blankLine && !isFirstSection) { chunks.push('') }
    isFirstSection = false
    chunks.push(`[${section}]`)
    addSectionChunks(iniObject[section])
  }

  return chunks.join('\n')
}

function convertType(value: string): IniValue {
  if (value === 'true' || value === 'false') {
    return value === 'true'
  }
  if (value === '') {
    return true
  }
  if (!isNaN(parseFloat(value))) {
    return parseFloat(value)
  }
  return value
}
