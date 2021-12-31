type TypedSubset<O, K extends keyof O, T> = O[K] extends T ? K : never
type StringProperties<O> = { [key in keyof O as TypedSubset<O, key, string>]: string }
type NumberProperties<O> = { [key in keyof O as TypedSubset<O, key, number>]: number }
type BooleanProperties<O> = { [key in keyof O as TypedSubset<O, key, boolean>]: boolean }

export type ChartMetadata = typeof defaultMetadata
export type CInputMetaStringKey = keyof StringProperties<InputChartMetadata>
export type CMetaStringKey = keyof StringProperties<ChartMetadata>
export type CInputMetaNumberKey = keyof NumberProperties<InputChartMetadata>
export type CMetaNumberKey = keyof NumberProperties<ChartMetadata>
export type CInputMetaBooleanKey = keyof BooleanProperties<InputChartMetadata>
export type CMetaBooleanKey = keyof BooleanProperties<ChartMetadata>

export type InputChartMetadata = ChartMetadata & {
  'frets': string
  'track': number
}
export const defaultMetadata = {
  'name': 'Unknown Name',
  'artist': 'Unknown Artist',
  'album': 'Unknown Album',
  'genre': 'Unknown Genre',
  'year': 'Unknown Year',
  'charter': 'Unknown Charter',
  'song_length': 0,
  'diff_band': -1,
  'diff_guitar': -1,
  'diff_rhythm': -1,
  'diff_bass': -1,
  'diff_drums': -1,
  'diff_keys': -1,
  'diff_guitarghl': -1,
  'diff_bassghl': -1,
  'preview_start_time': -1,
  'icon': '',
  'loading_phrase': '',
  'album_track': 16000,
  'playlist_track': 16000,
  'modchart': false,
  'delay': 0,
  'hopo_frequency': 0,
  'eighthnote_hopo': false,
  'multiplier_note': 0,
  'video_start_time': 0
}

export interface ChartData {
  metadata: {
    name?: string
    artist?: string
    album?: string
    genre?: string
    year?: string
    charter?: string
    offset?: number
    resolution: number
  }
  hasSections: boolean
  hasStarPower: boolean
  hasForced: boolean
  hasTap: boolean
  hasOpen: {
    [instrument: string]: boolean
  }
  hasSoloSections: boolean
  hasLyrics: boolean
  is120: boolean
  brokenNotes: {
    index: number,
    section: { index: number; section: string }
    time: number
  }[]
  hasDuplicateTracks: boolean
  noteCounts: {
    [instrument: string]: {
      [difficulty: string]: number
    }
  }
  /** number of seconds */
  length: number
  /** number of seconds */
  effectiveLength: number
}
