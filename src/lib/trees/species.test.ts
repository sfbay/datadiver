// src/lib/trees/species.test.ts
import { describe, expect, it } from 'vitest'
import { classifyRow, parseSpecies, speciesLabel, unclassifiedNonTrees } from './species'

describe('parseSpecies — every form the two city datasets publish', () => {
  it('the normal "Latin :: Common" form', () => {
    expect(parseSpecies('Platanus x hispanica :: Sycamore, London Plane'))
      .toEqual({ latin: 'Platanus x hispanica', common: 'Sycamore, London Plane', recorded: true })
  })
  it('the removal-notice form uses ONE colon', () => {
    expect(parseSpecies('Olea europaea : Olive Tree'))
      .toEqual({ latin: 'Olea europaea', common: 'Olive Tree', recorded: true })
  })
  it('a Latin name with no separator is a recorded species', () => {
    expect(parseSpecies('Acer buergerianum')).toEqual({ latin: 'Acer buergerianum', common: null, recorded: true })
  })
  it('an empty common half is still recorded, under its Latin name', () => {
    const p = parseSpecies('patanus racemosa ::')
    expect(p).toEqual({ latin: 'patanus racemosa', common: null, recorded: true })
    expect(speciesLabel(p)).toBe('patanus racemosa')
  })
  it('placeholders and blanks are NOT recorded', () => {
    for (const raw of ['Tree(s) ::', ':: To Be Determine', '', '   ', null, undefined]) {
      expect(parseSpecies(raw).recorded, String(raw)).toBe(false)
    }
    expect(speciesLabel(parseSpecies('Tree(s) ::'))).toBe('Species not recorded')
  })
  it('a cultivar keeps its quotes; nothing is merged', () => {
    expect(parseSpecies("Prunus serrulata 'Kwanzan' :: Kwanzan Flowering Cherry").latin).toBe("Prunus serrulata 'Kwanzan'")
  })
})

describe('classifyRow — the inventory holds things that are not trees', () => {
  it('stumps', () => {
    for (const s of ['Stump :: Stump', 'Stump (use Grinder) :: Stump (use Grinder)', 'Stump (hand Remove) :: Stump (hand Remove)']) {
      expect(classifyRow(s), s).toBe('stump')
    }
  })
  it('empty planting sites, including rows whose Latin half names a future tree', () => {
    for (const s of [
      'Planting site :: Planting Site', 'Planting site (plant) :: Planting Site (plant)',
      'Planting site (cut) :: Planting Site (cut)', 'Planting site (pave) :: Planting Site (pave)',
      "Zelkova 'Village Green' (plant) :: Planting Site (plant)",
    ]) expect(classifyRow(s), s).toBe('site')
  })
  it('shrubs', () => {
    expect(classifyRow('Shrub :: Shrub')).toBe('shrub')
    expect(classifyRow('Private shrub :: Private Shrub')).toBe('shrub')
  })
  it('everything else is a tree, including unrecorded species', () => {
    expect(classifyRow('Magnolia grandiflora :: Southern Magnolia')).toBe('tree')
    expect(classifyRow('Tree(s) ::')).toBe('tree')
    expect(classifyRow(null)).toBe('tree')
  })
})

describe('unclassifiedNonTrees — the G0 tripwire', () => {
  it('passes every string measured on Sept. 30, 2026', () => {
    expect(unclassifiedNonTrees([
      'Stump :: Stump', 'Planting site (cut) :: Planting Site (cut)', 'Shrub :: Shrub', 'Acer rubrum :: Red Maple',
    ])).toEqual([])
  })
  it('flags a new non-tree word the list does not know', () => {
    expect(unclassifiedNonTrees(['Stump (new kind) :: Stump (new kind)', 'Vacant basin :: Vacant']))
      .toEqual(['Stump (new kind) :: Stump (new kind)', 'Vacant basin :: Vacant'])
  })
})
