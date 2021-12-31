import { lower } from '../UtilFunctions'
import { Dirent } from 'fs'
import { parse } from 'path'
import { analyse } from 'chardet'

const ALLOWED_ENCODINGS = ['UTF-8', 'ISO-8859-1', 'ISO-8859-2', 'ISO-8859-9', 'windows-1252', 'UTF-16LE']

/**
 * @returns the most likely text encoding for text in `buffer`.
 */
 export function getEncoding(buffer: Buffer) {
  const matchingCharset = analyse(buffer).filter(match => ALLOWED_ENCODINGS.includes(match.name))[0]
  switch (matchingCharset.name) {
    case 'UTF-8': return 'utf8'
    case 'ISO-8859-1': return 'latin1'
    case 'ISO-8859-2': return 'latin1'
    case 'ISO-8859-9': return 'utf8'
    case 'windows-1252': return 'utf8'
    case 'UTF-16LE': return 'utf16le'
    default: return 'utf8'
  }
}

/**
 * @returns `true` if the list of filename `extensions` appears to be intended as a chart folder.
 */
export function appearsToBeChartFolder(extensions: string[]) {
  const ext = extensions.map(extension => lower(extension))
  const containsNotes = (ext.includes('chart') || ext.includes('mid'))
  const containsAudio = (ext.includes('ogg') || ext.includes('mp3') || ext.includes('wav') || ext.includes('opus'))
  return (containsNotes || containsAudio)
}

/**
 * @returns `true` if `name` has a valid chart audio file extension.
 */
export function hasAudioExtension(name: string) {
  return (['.ogg', '.mp3', '.wav', '.opus'].includes(parse(lower(name)).ext))
}

/**
 * @returns `true` if `name` has a valid chart audio filename.
 */
export function hasAudioName(name: string) {
  return (['song', 'guitar', 'bass', 'rhythm', 'keys', 'vocals', 'vocals_1', 'vocals_2',
    'drums', 'drums_1', 'drums_2', 'drums_3', 'drums_4', 'crowd', 'preview'].includes(parse(name).name))
    && (['.ogg', '.mp3', '.wav', '.opus'].includes(parse(name).ext))
}

/**
 * @returns `true` if `name` has a valid chart file extension.
 */
export function hasChartExtension(name: string) {
  return (['.chart', '.mid'].includes(parse(lower(name)).ext))
}

/**
 * @returns `true` if `name` has a .chart file extension.
 */
export function hasDotChartOnlyExtension(name: string) {
  return ('.chart' == parse(lower(name)).ext)
}

/**
 * @returns `true` if `name` is a valid chart filename.
 */
export function hasChartName(name: string) {
  return ['notes.chart', 'notes.mid'].includes(name)
}

/**
 * @returns the file that will be used by CH as the chart file, or `undefined` if none were found.
 * If there are multiple charts, CH prioritizes charts named correctly, then prioritizes .mid over .chart.
 */
export function getMainChart(files: Dirent[]) {
  let mainChart: Dirent | undefined
  let mainIsMid = false
  let mainIsNamedCorrectly = false

  for (const file of files) {
    const isNamedCorrectly = hasChartName(file.name)
    const isMid = parse(lower(file.name)).ext == '.mid'
    const isChart = parse(lower(file.name)).ext == '.chart'

    if (isChart && !mainIsMid && !isNamedCorrectly && !mainIsNamedCorrectly) {
      mainChart = file // "Song Title.chart"
    } else if (isMid && !isNamedCorrectly && !mainIsNamedCorrectly) {
      mainChart = file // "Song Title.mid"
      mainIsMid = true
    } else if (isChart && isNamedCorrectly && !mainIsMid) {
      mainChart = file // "notes.chart"
      mainIsNamedCorrectly = true
    } else if (isMid && isNamedCorrectly) {
      mainChart = file // "notes.mid"
      mainIsMid = true
      mainIsNamedCorrectly = true
    }
  }

  return mainChart
}

/**
 * @returns `true` if `name` has a valid ini file extension.
 */
export function hasIniExtension(name: string) {
  return ('.ini' == parse(lower(name)).ext)
}

/**
 * @returns `true` if `name` is a valid ini filename.
 */
export function hasIniName(name: string) {
  return name == 'song.ini'
}

/**
 * @returns `true` if `name` has a valid image file extension.
 */
export function hasImageExtension(name: string) {
  return (['.jpg', '.png'].includes(parse(lower(name)).ext))
}

/**
 * @returns `true` if `name` is a valid album filename.
 */
export function hasAlbumName(name: string) {
  return ['album.jpg', 'album.png'].includes(name)
}

/**
 * @returns `true` if `name` is a valid background filename.
 */
export function hasBackgroundName(name: string) {
  return (parse(name).name).startsWith('background') && (['.jpg', '.png'].includes(parse(name).ext))
}

/**
 * @returns `true` if `name` has a valid video file extension.
 */
export function hasVideoExtension(name: string) {
  return (['.mp4', '.avi', '.webm', '.ogv', '.mpeg'].includes(parse(lower(name)).ext))
}