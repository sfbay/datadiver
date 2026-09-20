import { describe, it, expect } from 'vitest'
import { carouselIndex, stepIndex, peekIds, queueIds, queueDiscIds, QUEUE_LEN, QUEUE_DISCS } from './carousel'

const order = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']

describe('carouselIndex', () => {
  it('resolves ?event= against the order; unknown or absent → the newest (0)', () => {
    expect(carouselIndex(order, 'c')).toBe(2)
    expect(carouselIndex(order, null)).toBe(0)
    expect(carouselIndex(order, 'zzz')).toBe(0)
  })
  it('empty order → -1', () => {
    expect(carouselIndex([], 'a')).toBe(-1)
    expect(carouselIndex([], null)).toBe(-1)
  })
})

describe('stepIndex', () => {
  it('wraps both ways', () => {
    expect(stepIndex(order, 0, -1)).toBe(8)
    expect(stepIndex(order, 8, 1)).toBe(0)
    expect(stepIndex(order, 3, 1)).toBe(4)
  })
  it('empty order → -1', () => {
    expect(stepIndex([], 0, 1)).toBe(-1)
  })
})

describe('peekIds', () => {
  it('previous and next around the active, wrapping', () => {
    expect(peekIds(order, 0)).toEqual({ prev: 'i', next: 'b' })
    expect(peekIds(order, 8)).toEqual({ prev: 'h', next: 'a' })
  })
  it('one stop: nothing to peek; two stops: next only (the same card must not appear twice)', () => {
    expect(peekIds(['a'], 0)).toEqual({ prev: null, next: null })
    expect(peekIds(['a', 'b'], 0)).toEqual({ prev: null, next: 'b' })
  })
})

describe('queueIds', () => {
  it('the next QUEUE_LEN stops after the active, wrapping, never the active itself', () => {
    expect(QUEUE_LEN).toBe(6)
    expect(queueIds(order, 6)).toEqual(['h', 'i', 'a', 'b', 'c', 'd'])
  })
  it('caps at order length − 1', () => {
    expect(queueIds(['a', 'b', 'c'], 1)).toEqual(['c', 'a'])
    expect(queueIds(['a'], 0)).toEqual([])
  })
  it('the first two are the map discs', () => {
    expect(QUEUE_DISCS).toBe(2)
    expect(queueDiscIds(order, 0)).toEqual(['b', 'c'])
  })
})
