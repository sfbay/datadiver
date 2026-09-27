// src/views/Restaurants/violationFamilies.test.ts
//
// Real `violation_codes` text, fetched live from tvy3-wexg (2026-09-24):
// Golden Flower (permit 31974) closure of July 15, 2024 and Yarsa (permit
// 103413) closure of March 5, 2024.

import { describe, it, expect } from 'vitest'
import {
  ITEM_SPLITTER,
  VIOLATION_FAMILIES,
  familiesOfItem,
  familyLabel,
  parseViolationItems,
  violationFamilies,
  hasClosureNotice,
} from './violationFamilies'

const GOLDEN_FLOWER_2024_07_15 = "114123, 114197, 114328(o) - Eliminate sewage backflow into the facility. Clean and sanitize all areas contaminated with sewage with a bleach solution (1 cup bleach per 9 cups water).Hire a licensed plumbing contractor if necessary. All contaminated food items must be discarded. All items that cannot be properly sanitized must be discarded.,  - Food, equipment, or utensils that are found to be unsanitary or in disrepair may be Voluntarily Condemned and Destroyed by the person in charge., 113967, 113976, 113980, 113988, 113990, 114035, 114254.3, 113975 - Discard all contaminated/adulterated food immediately if it bears or contains any poisonous or deleterious substance that may render it impure or injurious to health., 114259, 114259.1, 114259.4, 114259.5 - Eliminate the infestation/activity of cockroaches/rodents/flies/vermin from the food facility by using only approved methods. Remove all evidence of the infestation and thoroughly clean and sanitize all affected surfaces. Construct, equip, maintain and operate the food facility so as to prevent the entrance and harborage of animals, birds and vermin including, but not limited to, rodents and insects., 113996, 113998, 114037, 114429, 114429.3, 114429.5 - Keep potentially hazardous foods (PHF) cold at 41°F or below or hot held at 135°F or above. Immediately discontinue storing PHF at room temperature.,  - IMMEDIATE HEALTH PERMIT SUSPENSION AND CLOSURE The permit to operate the above named food facility is hereby temporarily suspended, and the facility is ordered immediately closed under the authority of Sections 114405 and 114409 of Division 104, Part 7, Chapter 13, Article 3 of the California Health and Safety Code and/or City and County of San Francisco Health Code §§ 440 (j) and 440.1. The attached Inspection Report specifies the conditions that warrant this closure and the Sections of the law that are being violated. Any food facility for which the permit has been temporarily suspended shall cease all food handling, close and remain closed until all conditions warranting the closure are corrected and your permit has been reinstated by a representative of Environmental Health.   You are hereby notified that you have the right to request a hearing, within 15 calendar days after service of this Notice to show cause why the permit suspension is not warranted. Your failure to request a hearing within 15 calendar days shall be deemed a waiver of your right to a hearing.   An owner, manager or operator who fails to comply with this Closure Notice may be found guilty of a misdemeanor, with a possible fine of $1,000.00 and/or imprisonment for not more than six months for each offense. This Health Permit Suspension and Closure Notice is issued to you under the authority of the California Health and Safety Code, Division 104, Part 7, Chapter 13, Article 3. Copies of the Code Sections referred to herein may be reviewed at most public libraries, the Internet, or at Environmental Health. Contact this office at the number noted above, during normal days of business to request a re-inspection, or if you have any questions. If you are calling after 4:30 pm or on weekends, leave a message at (415) 252-3800 and an inspector/on call staff will call you back at their earliest convenience.   The CLOSED placard was issued and posted this date. The Closure placard shall not be removed, moved, blocked, or obstructed in any manner. The Closure placard shall only be removed by an inspector from this Department.,  - Submit additional documents as instructed."

const YARSA_2024_03_05 = "114171, 114189.1, 114190, 114192, 114193, 114193.1, 114199, 114201, 114269 - Protect the potable water supply with a backflow protection device, as required by applicable plumbing codes. All plumbing, plumbing fixtures, and grease interceptors shall be installed in compliance with local plumbing ordinances, shall be maintained so as to prevent any contamination, and shall be kept clean, fully operative, and in good repair. Any hose used for conveying potable water shall be of approved materials, labeled, properly stored, and used for no other purpose., 114018, 114020 - Discontinue thawing potentially hazardous foods at room temperature or in standing water. Use one of the following approved methods:  - Under potable running water of sufficient velocity to wash away loose food particles using water no greater than 70°F for no more than 2 hours.  - In a refrigeration unit at 41°F or below  - In a microwave  - As part of the cooking process,  - Submit additional documents as instructed., 114135, 114185.1 114185.3 [d-e] - Store wiping cloths used to wipe service counters, scales, or other surfaces that may come into contact with food in clean water with sanitizer or use only once; separate sanitizing containers shall be provided for wiping cloths used with raw animal foods., 114259, 114259.1, 114259.4, 114259.5 - Eliminate the infestation/activity of cockroaches/rodents/flies/vermin from the food facility by using only approved methods. Remove all evidence of the infestation and thoroughly clean and sanitize all affected surfaces. Construct, equip, maintain and operate the food facility so as to prevent the entrance and harborage of animals, birds and vermin including, but not limited to, rodents and insects., 113952, 113953.3, 113953.4, 113961, 113973 - Properly wash hands with hand soap and warm water for a minimum of 10 seconds at the hand washing station when beginning work; before handling food/equipment/utensils; as often as necessary during food preparation to remove soil and contamination; switching from working with raw to ready-to-eat foods; after touching body parts; after using toilet room; contamination of hands occurs. Food employees shall minimize contact with exposed, ready-to-eat food with their bare hands and shall use suitable utensils, gloves, or dispensing equipment., 113984(d), 114097, 114099.1, 114099.4, 114099.6, 114101(b, c, d), 114105, 114109, 114111, 114113, 11415 (a, b, D), 114117, 114125(b), 114141 - Properly wash, rinse and sanitize all food contact surfaces. Make a 100 ppm bleach sanitizing solution or a 200 ppm quaternary ammonia solution for the third compartment.,  - IMMEDIATE HEALTH PERMIT SUSPENSION AND CLOSURE The permit to operate the above named food facility is hereby temporarily suspended, and the facility is ordered immediately closed under the authority of Sections 114405 and 114409 of Division 104, Part 7, Chapter 13, Article 3 of the California Health and Safety Code and/or City and County of San Francisco Health Code §§ 440 (j) and 440.1. The attached Inspection Report specifies the conditions that warrant this closure and the Sections of the law that are being violated. Any food facility for which the permit has been temporarily suspended shall cease all food handling, close and remain closed until all conditions warranting the closure are corrected and your permit has been reinstated by a representative of Environmental Health.   You are hereby notified that you have the right to request a hearing, within 15 calendar days after service of this Notice to show cause why the permit suspension is not warranted. Your failure to request a hearing within 15 calendar days shall be deemed a waiver of your right to a hearing.   An owner, manager or operator who fails to comply with this Closure Notice may be found guilty of a misdemeanor, with a possible fine of $1,000.00 and/or imprisonment for not more than six months for each offense. This Health Permit Suspension and Closure Notice is issued to you under the authority of the California Health and Safety Code, Division 104, Part 7, Chapter 13, Article 3. Copies of the Code Sections referred to herein may be reviewed at most public libraries, the Internet, or at Environmental Health. Contact this office at the number noted above, during normal days of business to request a re-inspection, or if you have any questions. If you are calling after 4:30 pm or on weekends, leave a message at (415) 252-3800 and an inspector/on call staff will call you back at their earliest convenience.   The CLOSED placard was issued and posted this date. The Closure placard shall not be removed, moved, blocked, or obstructed in any manner. The Closure placard shall only be removed by an inspector from this Department., 114130-114130.5, 114132, 114133, 114137, 114139, 114153, 114163, 114165, 114167, 114169, 114175, 114177, 114180, 114182 - Ensure all equipment is approved, properly installed, clean, and maintained in good repair. Ensure all appliances are NSF-approved, commercial grade, durable, and easily cleanable."

describe('violationFamilies', () => {
  it('splits on the spec splitter exactly', () => {
    expect(ITEM_SPLITTER.source).toBe('\\.,\\s+')
    expect(parseViolationItems('a - one., b - two., - three.')).toHaveLength(3)
    expect(parseViolationItems(null)).toEqual([])
    expect(parseViolationItems('')).toEqual([])
  })

  it('separates the citation list from the instruction text', () => {
    const [first, condemned] = parseViolationItems(GOLDEN_FLOWER_2024_07_15)
    expect(first.codes).toBe('114123, 114197, 114328(o)')
    expect(first.text.startsWith('Eliminate sewage backflow')).toBe(true)
    expect(condemned.codes).toBe('')
    expect(condemned.text.startsWith('Food, equipment, or utensils')).toBe(true)
  })

  it('Golden Flower July 2024: sewage, discarded food, vermin, temperature, the notice', () => {
    expect(violationFamilies(GOLDEN_FLOWER_2024_07_15)).toEqual([
      'vermin',
      'temperature',
      'water-sewage',
      'food-protection',
      'paperwork',
      'closure-notice',
    ])
    expect(hasClosureNotice(GOLDEN_FLOWER_2024_07_15)).toBe(true)
  })

  it('Yarsa March 2024: each item lands in its own family', () => {
    const fams = parseViolationItems(YARSA_2024_03_05).map((i) => i.families)
    expect(fams).toEqual([
      ['water-sewage'], // backflow
      ['temperature', 'paperwork'], // thawing — the item carries "Submit additional documents" inside it
      ['sanitizing'], // wiping cloths
      ['vermin'], // 114259 infestation
      ['handwashing'], // "after using toilet room" must NOT read as a building item
      ['sanitizing'], // wash, rinse, sanitize food contact surfaces
      ['closure-notice'], // exclusive — its "permit to operate" is not paperwork
      ['facility'], // equipment approved and in repair
    ])
  })

  it('the four families the spec cites match their anchor items', () => {
    expect(familiesOfItem('114259, 114259.1 - Eliminate the infestation/activity of cockroaches/rodents/flies/vermin')).toEqual(['vermin'])
    expect(familiesOfItem('113953, 113953.1 - Provide soap and single-use towels in dispensers at each handwash sink')).toEqual(['handwashing'])
    expect(familiesOfItem('113996, 113998 - Keep potentially hazardous foods (PHF) cold at 41°F or below')).toEqual(['temperature'])
    expect(familiesOfItem('114123, 114197 - Eliminate sewage backflow into the facility')).toEqual(['water-sewage'])
  })

  it('"Signs of vermin" never claims pest-PROOFING construction or pesticide use', () => {
    const proofing =
      '114266, 114257, 114257.1, 114259 - A food facility shall at all times be constructed, equipped, and maintained, and operated as to prevent the entrance and harborage of animals, birds, and vermin'
    expect(familiesOfItem(proofing)).not.toContain('vermin')
    expect(familiesOfItem('114254-114254.2 - Administer all pesticides through a state licensed pest control operator')).not.toContain('vermin')
  })

  it('unknown text is "other", never dropped; every family has a label', () => {
    expect(familiesOfItem('Item 2 - No person shall produce music on commercial property')).toEqual(['other'])
    for (const f of VIOLATION_FAMILIES) expect(familyLabel(f.id)).toBe(f.label)
    expect(familyLabel('vermin')).toBe('Signs of vermin')
  })
})
