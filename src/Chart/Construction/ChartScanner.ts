import { createHash } from 'crypto'
import * as fs from 'fs'
import { promisify } from 'util'
import { ChartData } from '../ChartInterfaces'
import { getEncoding } from '../ChartUtils'

const readFile = promisify(fs.readFile)

type TempoMap = { index: number, bpm: number }[]
type Section = { index: number; section: string }
type BrokenNote = { index: number, section: Section, time: number }
type TrackNotes = { [index: number]: string }
type AllNotes = { [trackName: string]: TrackNotes }
type NoteCounts = { [instrument: string]: { [difficulty: string]: number } }

const trackMap = {
  '[ExpertSingle]': 'guitar.x',
  '[HardSingle]': 'guitar.h',
  '[MediumSingle]': 'guitar.m',
  '[EasySingle]': 'guitar.e',

  '[ExpertDoubleBass]': 'bass.x',
  '[HardDoubleBass]': 'bass.h',
  '[MediumDoubleBass]': 'bass.m',
  '[EasyDoubleBass]': 'bass.e',

  '[ExpertDoubleRhythm]': 'rhythm.x',
  '[HardDoubleRhythm]': 'rhythm.h',
  '[MediumDoubleRhythm]': 'rhythm.m',
  '[EasyDoubleRhythm]': 'rhythm.e',

  '[ExpertDrums]': 'drums.x',
  '[HardDrums]': 'drums.h',
  '[MediumDrums]': 'drums.m',
  '[EasyDrums]': 'drums.e',

  '[ExpertKeyboard]': 'keys.x',
  '[HardKeyboard]': 'keys.h',
  '[MediumKeyboard]': 'keys.m',
  '[EasyKeyboard]': 'keys.e',

  '[ExpertGHLGuitar]': 'guitarghl.x',
  '[HardGHLGuitar]': 'guitarghl.h',
  '[MediumGHLGuitar]': 'guitarghl.m',
  '[EasyGHLGuitar]': 'guitarghl.e',

  '[ExpertGHLBass]': 'bassghl.x',
  '[HardGHLBass]': 'bassghl.h',
  '[MediumGHLBass]': 'bassghl.m',
  '[EasyGHLBass]': 'bassghl.e',
}
const trackNames = Object.keys(trackMap)

/**
 * Scans the .chart file at `filepath`.
 * @returns a `ChartData` object for that .chart file.
 * @throws an exception if the chart file could not be read or was formatted incorrectly.
 */
export async function parseChartFile(filepath: string): Promise<ChartData> {
  const chartBuffer = await readFile(filepath)
  const lines = chartBuffer.toString(getEncoding(chartBuffer)).split('\n').map(line => line.trim())
  const noteSectionLines = getNoteSectionLines(lines)

  const metadata = getMetadata(lines)
  const { sections, hasLyrics } = scanEvents(lines)
  const { hasForced, hasTap, hasSoloSections, hasStarPower, hasOpen } = scanNotes(noteSectionLines)
  const brokenNotes = getBrokenNotes(noteSectionLines, sections)
  const { is120, length, effectiveLength } = getTempomapProperties(metadata.resolution, lines, noteSectionLines, brokenNotes)
  const { noteCounts, hasDuplicateTracks } = getNoteCounts(noteSectionLines)

  return {
    metadata, hasSections: sections.length > 0,
    hasStarPower, hasForced, hasTap, hasOpen,
    hasSoloSections, hasLyrics, is120, brokenNotes,
    hasDuplicateTracks, noteCounts, length, effectiveLength
  }
}

/**
 * @returns the subset of `lines` that only includes the track sections.
 */
function getNoteSectionLines(lines: string[]) {
  const lineNum = lines.findIndex(line => trackNames.includes(line))
  if (lineNum == -1) { throw 'Chart does not contain any instruments.' }
  return lines.slice(lineNum)
}

/**
 * Scans the `[Song]` section to check for provided metadata.
 * @throws an exception if the resolution was not found.
 */
 function getMetadata(lines: string[]): ChartData['metadata'] {
  if (lines.find(line => line.includes('[Song]')) == undefined) { throw 'Chart did not contain a [Song] section.' }
  const metadata: ChartData['metadata'] = { resolution: NaN }

  for (let i = 2; i < lines.length && !lines[i].includes('}'); i++) {
    const [param, rawValue] = lines[i].split(' = ').map(line => line.trim())
    const value = rawValue.startsWith('"') ? rawValue.slice(1, -1).trim() : rawValue
    if (value.length == 0) { continue }

    switch(param) {
      case 'Name': metadata.name = value; break
      case 'Artist': metadata.artist = value; break
      case 'Album': metadata.album = value; break
      case 'Genre': metadata.genre = value; break
      case 'Year': metadata.year = value.startsWith(', ') ? value.substr(2) : value; break // Blame GHTCP for this
      case 'Charter': metadata.charter = value; break
      case 'Offset': metadata.offset = Number(value); break
      case 'Resolution': metadata.resolution = Number(value); break
    }
  }

  if (isNaN(metadata.resolution)) {
    throw 'Chart did not specify a "Resolution" value.'
  }

  if (metadata.offset !== undefined && isNaN(metadata.offset)) {
    throw 'Chart did not specify a valid "Offset" value.'
  }

  return metadata
}

/**
 * Scans the `[Events]` section to check for sections and lyrics.
 */
function scanEvents(lines: string[]) {
  const sections: Section[] = []
  let hasLyrics = false

  const eventsIndex = lines.indexOf('[Events]')
  if (eventsIndex == -1) { throw 'Chart did not contain an [Events] section.' }
  for (let i = eventsIndex; i < lines.length && !lines[i].includes('}'); i++) {
    if (isLineLyric(lines[i])) {
      hasLyrics = true
    } else if (isLineSection(lines[i])) {
      const [ index, ...rest ] = lines[i].split(' = ')
      if (!index || rest.length == 0) { throw 'Chart has an invalid section at line ' + i + 1 }
      sections.push({
        index: Number(index.trim()),
        section: rest.join(' = ')
      })
    }
  }

  return { sections, hasLyrics }
}

function isLineSection(line: string) { return line.includes('"section ') }
function isLineLyric(line: string)   { return line.includes('"lyric ') }

/**
 * Scans all the sections that contain notes to check for forcing, taps, solo sections, star power, and open notes.
 */
function scanNotes(lines: string[]) {
  let hasForced = false
  let hasTap = false
  let hasSoloSections = false
  let hasStarPower = false
  const hasOpen: { [instrument: string]: boolean } = {}
  let currentInstrument: string | undefined

  for(const line of lines) {
    if (trackNames.includes(line)) {
      currentInstrument = trackMap[line as keyof typeof trackMap].split('.')[0]
    } else if (isLineForced(line)) {
      hasForced = true
    } else if (isLineTap(line)) {
      hasTap = true
    } else if (isLineSolo(line)) {
      hasSoloSections = true
    } else if (isLineStarPower(line)) {
      hasStarPower = true
    } else if (isLineOpen(line)) {
      if (!currentInstrument) { throw 'Chart contains notes before the first track section.' }
      hasOpen[currentInstrument] = true
    }
  }

  return { hasForced, hasTap, hasSoloSections, hasStarPower, hasOpen }
}

function isLineForced(line: string)    { return line.includes('N 5 ') }
function isLineTap(line: string)       { return line.includes('N 6 ') }
function isLineSolo(line: string)      { return line.includes('E solo') }
function isLineStarPower(line: string) { return line.includes('S 2') }
function isLineOpen(line: string)      { return line.includes('N 7 ') }

/**
 * Scans all the sections that contain notes to check for broken notes.
 * (Broken notes are notes that are so close together that this is very likely a mistake.)
 */
function getBrokenNotes(lines: string[], sections: Section[]) {
  const brokenNotes: BrokenNote[] = []
  let previousIndex = Number.MIN_SAFE_INTEGER

  for (const line of lines) {
    const index = Number(/(\d+) = N ([0-4]|7|8) /.exec(line)?.[1])

    if (index) {
      const distance = index - previousIndex
      if (distance > 0 && distance < 5) {
        brokenNotes.push({
          index: previousIndex,
          section: sections[sections.findIndex(section => section.index > previousIndex) - 1],
          time: 0
        })
      }
      if (previousIndex != index) { previousIndex = index }
    }
  }

  return brokenNotes
}

/**
 * Scans all the sections that contain notes in the context of the tempo map to determine if the chart has default BPM,
 * the length and effectiveLength of the chart, and the temporal positions of any broken notes.
 */
function getTempomapProperties(resolution: number, lines: string[], noteSectionLines: string[], brokenNotes: BrokenNote[]) {
  const [ firstTempo, ...tempoMap ] = getTempoMap(lines)
  const { firstNoteIndex, lastNoteIndex } = getNoteIndexes(noteSectionLines)
  tempoMap.push({ index: lastNoteIndex, bpm: (tempoMap[tempoMap.length - 1] ?? firstTempo).bpm }) // Assume same bpm after the last marker
  let totalTime = 0 // Seconds
  let timeToFirstNote = 0, timeToLastNote = 0
  let { index: lastIndex, bpm } = firstTempo
  for (const { index: nextIndex, bpm: nextBpm } of tempoMap) { // Iterate through each tempo map region
    // the "Resolution" parameter is the number of ticks in each beat, so `bpm * resolution` is the ticks per minute
    const secondsPerTick = 60 / (bpm * resolution)

    totalTime += (nextIndex - lastIndex) * secondsPerTick

    if (firstNoteIndex > lastIndex) { // Calculate the timestamp of the first note
      timeToFirstNote += (Math.min(firstNoteIndex, nextIndex) - lastIndex) * secondsPerTick
    }

    if (lastNoteIndex > lastIndex) { // Calculate the timestamp of the last note
      timeToLastNote += (Math.min(lastNoteIndex, nextIndex) - lastIndex) * secondsPerTick
    }

    brokenNotes.forEach(note => { // Compute timestamp of broken notes
      if (note.index > lastIndex) {
        note.time += (Math.min(note.index, nextIndex) - lastIndex) * secondsPerTick
      }
    })

    lastIndex = nextIndex
    bpm = nextBpm
  }

  // If there is only one BPM marker and it is 120 ("B 120000"),
  // it's most likely cancer (not beat mapped) and has to be checked by physicians
  const is120 = (tempoMap.length == 1 && firstTempo.bpm == 120)
  const length = Math.floor(totalTime)
  const effectiveLength = Math.floor(timeToLastNote - timeToFirstNote)
  return { is120, length, effectiveLength }
}

/**
 * @returns an object containing all the BPM markers in the chart.
 */
function getTempoMap(lines: string[]) {
  const syncTrackIndexStart = lines.indexOf('[SyncTrack]')
  if (syncTrackIndexStart == -1) { throw 'Chart does not contain a [SyncTrack] section.' }
  const syncTrackIndexEnd = lines.indexOf('}', syncTrackIndexStart)
  const tempoMapSectionLines = lines.slice(syncTrackIndexStart, syncTrackIndexEnd)
  const tempoMap: TempoMap = []
  for (const line of tempoMapSectionLines) {
    const [, index, bpm] = /\s*(\d+) = B (\d+)/.exec(line) || []
    if (index) tempoMap.push({ index: +index, bpm: +bpm / 1000 })
  }
  if (tempoMap.length == 0) { throw 'Chart does not contain any BPM markers.' }
  return tempoMap
}

/**
 * @returns the indexes of the first and last notes in `noteSectionLines`.
 */
function getNoteIndexes(noteSectionLines: string[]) {
  let firstNoteIndex = 0, lastNoteIndex = 0

  for (const line of noteSectionLines) {
    const index = Number(/(\d+) = N ([0-4]|7|8) /.exec(line)?.[1])
    if (index) {
      if (firstNoteIndex == 0) { firstNoteIndex = index }
      if (index > lastNoteIndex) { lastNoteIndex = index }
    }
  }

  return { firstNoteIndex, lastNoteIndex }
}

/**
 * @returns an object containing the number of notes in each track and if there are duplicate tracks.
 * Duplicate tracks are not added to the object.
 */
function getNoteCounts(noteSectionLines: string[]) {
  const notes = getAllNotes(noteSectionLines)
  const noteCounts: NoteCounts = {}
  let hasDuplicateTracks = false
  const hashes: string[] = []
  for (const trackName in trackMap) { // Iterating over `trackMap` keys to ensure their order: earlier duplicates are preferred
    if (!notes[trackName]) { continue }
    const hash = getNotesHash(notes[trackName])
    if (hashes.includes(hash)) {
      hasDuplicateTracks = true
    } else {
      hashes.push(hash)
      const [instrument, difficulty] = trackName.split('.')
  
      const noteCount = Object.values(notes[trackName]).length
      if (noteCount >= 10) { // Ignore tracks with less than 10 notes
        (noteCounts[instrument] ??= {})[difficulty] = noteCount
      }
    }
  }

  return { noteCounts, hasDuplicateTracks }
}

/**
 * @returns an object containing all the notes in all the tracks in `noteSectionLines`. Chords are grouped into single items.
 */
function getAllNotes(noteSectionLines: string[]) {
  const notes: AllNotes = {}
  let currentTrack: string | undefined
  for (const line of noteSectionLines) {
    if (trackNames.includes(line)) { // Detect new difficulty
      currentTrack = trackMap[line as keyof typeof trackMap]
      notes[currentTrack] = {}
    } else if (currentTrack) { // Detect new notes
      const result = /(\d+) = N ([0-4]|7|8) /.exec(line)
      if (result) {
        const [index, note] = [ Number(result[1]), Number(result[2]) ]
        notes[currentTrack][index] = (notes[currentTrack][index] ?? '') + note // Group notes on the same index
      }
    }
  }

  return notes
}

/**
 * @returns a hash of the notes in `trackNotes`. The hash changes if notes are added, removed, or reordered.
 */
function getNotesHash(trackNotes: TrackNotes) {
  const noteList = Object.keys(trackNotes).sort((a, b) => +a < +b ? -1 : 1).map(index => trackNotes[Number(index)])
  return createHash('md5').update(noteList.join()).digest('hex')
}
