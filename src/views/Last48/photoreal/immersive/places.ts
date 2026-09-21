// src/views/Last48/photoreal/immersive/places.ts
//
// PLACES — the authored half of the rail's presets (Round B §2). Eight
// landmarks a visitor would name, each with its own camera: where the
// camera looks FROM is as authored as where it looks AT (the Painted
// Ladies face east, so the camera stands east of them). Zero-import, so the
// test can pin every row without a DOM. Conventions match cameraPose.ts:
// heading clockwise from north, pitch negative looking down, range metres
// from the target to the camera.
//
// The rail shows the first PLACES_SHOWN and a "More places" turn-down for
// the rest; order here IS display order.

export interface Place {
  id: string
  name: string
  /** ≤ PLACE_CAPTION_MAX characters, plain words. */
  caption: string
  lng: number
  lat: number
  headingDeg: number
  pitchDeg: number
  rangeM: number
}

export const PLACES_SHOWN = 4
export const PLACE_CAPTION_MAX = 26

export const PLACES: readonly Place[] = [
  { id: 'golden-gate-bridge', name: 'Golden Gate Bridge', caption: 'The south anchorage',
    lng: -122.4757, lat: 37.8085, headingDeg: 330, pitchDeg: -25, rangeM: 900 },
  { id: 'coit-tower', name: 'Coit Tower', caption: 'Telegraph Hill',
    lng: -122.4058, lat: 37.8024, headingDeg: 200, pitchDeg: -30, rangeM: 500 },
  { id: 'ferry-building', name: 'Ferry Building', caption: 'Foot of Market Street',
    lng: -122.3937, lat: 37.7955, headingDeg: 60, pitchDeg: -30, rangeM: 500 },
  { id: 'painted-ladies', name: 'Painted Ladies', caption: 'Alamo Square',
    lng: -122.4330, lat: 37.7762, headingDeg: 270, pitchDeg: -25, rangeM: 350 },
  { id: 'twin-peaks', name: 'Twin Peaks', caption: 'The city from its middle',
    lng: -122.4477, lat: 37.7544, headingDeg: 45, pitchDeg: -20, rangeM: 800 },
  { id: 'palace-of-fine-arts', name: 'Palace of Fine Arts', caption: 'Rotunda and lagoon',
    lng: -122.4484, lat: 37.8029, headingDeg: 315, pitchDeg: -30, rangeM: 450 },
  { id: 'oracle-park', name: 'Oracle Park', caption: 'Ballpark on McCovey Cove',
    lng: -122.3893, lat: 37.7786, headingDeg: 90, pitchDeg: -35, rangeM: 600 },
  { id: 'lombard-street', name: 'Lombard Street', caption: 'The crooked block',
    lng: -122.4187, lat: 37.8021, headingDeg: 270, pitchDeg: -30, rangeM: 350 },
]
