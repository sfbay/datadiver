import { describe, it, expect } from 'vitest'
import { CITY_SELECTION_FIELDS } from './citySelections'

describe('CITY_SELECTION_FIELDS (cross-city reset contract)', () => {
  it('every selection field consumed by a view live in BOTH cities is listed', () => {
    // crime-incidents, 311-cases, parking-citations are live in sf AND oakland;
    // their selection fields must reset on a cross-city navigation. This pin
    // failed to exist in stage 3b and the switcher made the leak one click
    // deep (spec §B3). When a new view gains a second city, its field joins
    // this list — and CityChangeReset's Record<CitySelectionField, …> forces
    // the setter wiring at compile time.
    expect([...CITY_SELECTION_FIELDS].sort()).toEqual([
      'selected311Case',
      'selectedCitation',
      'selectedCrimeIncident',
      'selectedNeighborhood',
    ])
  })
})
