import { Prisma } from '@prisma/client'

import { makeTaskDetails } from '../test-utils/task.factory'
import { toTaskResponse } from './task-response'

describe('toTaskResponse', () => {
  it('turns Decimal money, coordinates and rating into numbers', () => {
    const response = toTaskResponse(
      makeTaskDetails({
        offeredPrice: new Prisma.Decimal('10.03'),
        stripeFee: new Prisma.Decimal('0.61'),
        locationLat: new Prisma.Decimal('-23.5505'),
      }),
    )

    expect(response.offeredPrice).toBe(10.03)
    expect(response.stripeFee).toBe(0.61)
    expect(response.locationLat).toBe(-23.5505)
    expect(response.proxyEarnings).toBeNull()
    expect(typeof response.ownerId.rating).toBe('number')
  })

  it('leaves dates and the public owner fields untouched', () => {
    const completedAt = new Date('2026-11-01T10:00:00Z')
    const response = toTaskResponse(makeTaskDetails({ completedAt }))

    expect(response.completedAt).toBe(completedAt)
    expect(response.canceledAt).toBeNull()
    expect(Object.keys(response.ownerId).sort()).toEqual([
      'avatarUrl',
      'id',
      'name',
      'rating',
      'totalTasksCreated',
    ])
  })
})
