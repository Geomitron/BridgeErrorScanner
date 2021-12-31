// Without a comprehensive MIDI chart spec, it would take way too long to refactor this.
// For now, it will be left as a block of black box spaghetti.  - Geo
/* eslint-disable @typescript-eslint/no-explicit-any */
//@ts-ignore
import * as MIDIFile from 'midifile'
import * as fs from 'fs'
import * as crypto from 'crypto'
import { promisify } from 'util'
import { ChartData } from '../ChartInterfaces'

const readFile = promisify(fs.readFile)

// 3/4ths of this is inspired by MoonScraper's MidReader
// https://github.com/FireFox2000000/Moonscraper-Chart-Editor/blob/master/Moonscraper%20Chart%20Editor/Assets/Scripts/Charts/IO/Midi/MidReader.cs

// The rest is pure, unadulterated reverse engineering (I mean who has time to check the specs anyway Kappa)

const getMD5 = (txt: any) => {
  const hash = crypto.createHash('md5');
  hash.update(txt);
  return hash.digest('hex');
};

const partMap: any = {
  'PART GUITAR': 'guitar',
  'PART BASS': 'bass',
  'PART RHYTHM': 'rhythm',
  'PART KEYS': 'keys',
  'PART DRUMS': 'drums',
  'PART VOCALS': 'vocals',
  'PART GUITAR GHL': 'guitarghl',
  'PART BASS GHL': 'bassghl'
};
const diffOffsets: any = { e: 59, m: 71, h: 83, x: 95 };
export async function parseMidiFile(filepath: string): Promise<ChartData> {
  const midiText = await readFile(filepath)

  const midi = new MIDIFile(midiText)

  let hasSections = false,
    hasSoloSections = false,
    hasStarPower = false,
    hasForced = false,
    hasTap = false,
    hasLyrics = false,
    brokenNotes: any[] = [],
    hasOpen: any = {};
  let isOpen = false;
  let firstNoteTime: any, lastNoteTime = 0;
  let previous: any;
  const tracks: any = {};
  const notes: any = {};
  // Detect 120 BPM charts because fuck that shit seriously
  const bpmEvents = midi.getTrackEvents(0).filter((obj: any) => obj.tempoBPM);
  const is120 = bpmEvents.length == 1 && bpmEvents[0].tempoBPM == 120;
  midi.getEvents().forEach((event: any) => {
    // data is a string attached to the MIDI event.
    // It generally denotes chart events (sections, lighting...)
    const data = event.data ? event.data.map((d: any) => String.fromCharCode(d)).join('') : null;
    // Let's hope I'm not wrong
    if (event.param1 == 103) hasSoloSections = true;
    // prc? different standards for .mids smh, that's most likely from RB though
    else if (data && data.match(/^\[(section|prc)/)) hasSections = true;
    else if (data && partMap[data]) {
      if (data.trim() == 'PART VOCALS') { hasLyrics = true; } // CH lyrics take from the vocals part
      tracks[event.track] = partMap[data]; 
    } else if (data == "PS\u0000\u0000ÿ\u0004\u0001÷") hasTap = true; // If that ain't black magic, I don't know what it is. But it works.
    else if (data == "PS\u0000\u0000\u0003\u0001\u0001÷") {
      hasOpen[tracks[event.track]] = true;
      isOpen = true;
    } else if (data == "PS\u0000\u0000\u0003\u0001\u0000÷") isOpen = false;

    // param1 is the note being played.
    // The interesting things happen here...
    if (event.param1 && event.param1 != 103) {
      if (event.param1 == 116) hasStarPower = true;
      else if ([65, 66, 77, 78, 89, 90, 101, 102].indexOf(event.param1) > -1) hasForced = true;
      else if (tracks[event.track] != 'guitarghl' && tracks[event.track] != 'bassghl') {
        // Detect which difficulty the note is on
        let diff;
        if (event.param1 >= 60 && event.param1 <= 64) diff = 'e';
        else if (event.param1 >= 72 && event.param1 <= 76) diff = 'm'
        else if (event.param1 >= 84 && event.param1 <= 88) diff = 'h';
        else if (event.param1 >= 96 && event.param1 <= 100) diff = 'x';
        // event.subtype == 9 is the note being on,
        // event.subtype == 8 is the note being off... I think?
        if (diff && event.subtype == 9) {
          // Broken note logic
          // Check chart.js for the logic behind broken notes,
          // I can't be bothered to copy/paste/adapt
          if (previous) {
            const distance = event.playTime - previous.time;
            if (distance > 0 && distance < 5) {
              brokenNotes.push({ time: previous.time, nextTime: event.playTime });
            }
          }
          if (!previous || previous.time != event.playTime) previous = { time: event.playTime };
          if (!firstNoteTime) firstNoteTime = event.playTime;
          if (event.playTime > lastNoteTime) lastNoteTime = event.playTime;
          if (!notes[`${tracks[event.track]}.${diff}`]) notes[`${tracks[event.track]}.${diff}`] = {};
          notes[`${tracks[event.track]}.${diff}`][event.playTime] = `${notes[`${tracks[event.track]}.${diff}`][event.playTime] || ''}${isOpen ? 7 : event.param1 - diffOffsets[diff]}`;
        }
      } else {
        // Detect which difficulty the note is on
        let diff;
        if (event.param1 >= 94) diff = 'x';
        else if (event.param1 >= 82) diff = 'h';
        else if (event.param1 >= 70) diff = 'm';
        else if (event.param1) diff = 'e';
        if (diff && event.subtype == 9) {
          if (previous) {
            const distance = event.playTime - previous.time;
            if (distance > 0 && distance < 5) {
              brokenNotes.push({ time: previous.time });
            }
          }
          if (!previous || previous.time != event.playTime) previous = { time: event.playTime };
          if (!firstNoteTime) firstNoteTime = event.playTime;
          if (event.playTime > lastNoteTime) lastNoteTime = event.playTime;
          if (!notes[`${tracks[event.track]}.${diff}`]) notes[`${tracks[event.track]}.${diff}`] = {};
          // GHL notes are offset by 2. If the ensuing result equals 0, it's an open note.
          notes[`${tracks[event.track]}.${diff}`][event.playTime] = `${notes[`${tracks[event.track]}.${diff}`][event.playTime] || ''}${+(event.param1 - diffOffsets[diff] + 1) || 7}`;
        }
      }
    }
  });

  // Compute the hash of the .mid itself first
  const hashes: any = { file: getMD5(midiText) };
  const hashList: any = []
  let hasDuplicateTracks = false
  const noteCounts:any = {};
  let earliestNote = +Infinity, latestNote = 0;
  for (let part in notes) {
    const [instrument, difficulty] = part.split('.');
    // We have to reorder the values by ascending index (Object.values gets by "alphabetical" order of index)
    const notesArray = Object.keys(notes[part]).sort((a, b) => +a < +b ? -1 : 1).map((index: any) => {
      index = +index;
      if (index < earliestNote) earliestNote = index;
      if (index > latestNote) latestNote = index;
      return notes[part][index];
    });
    // Ignore tracks with less than 10 notes
    if (notesArray.length < 10) continue;
    if (!hashes[instrument]) {
      hashes[instrument] = {};
      noteCounts[instrument] = {};
    }
    // Compute the hashes and note counts of individual difficulties/instruments
    noteCounts[instrument][difficulty] = notesArray.length;
    const hash = getMD5(notesArray.join(' '));
    hashes[instrument][difficulty] = hash
    if (hashList.includes(hash)) { hasDuplicateTracks = true }
    hashList.push(hash)
  }

  return {
    metadata: { resolution: NaN }, hasSections, hasStarPower, hasForced,
    hasTap, hasOpen, hasSoloSections, hasLyrics, is120, brokenNotes,
    hasDuplicateTracks, noteCounts, length: lastNoteTime / 1000 >> 0,
    effectiveLength: (lastNoteTime - firstNoteTime) / 1000 >> 0
  };
};
