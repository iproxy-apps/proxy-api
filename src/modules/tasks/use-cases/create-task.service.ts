import { Injectable } from '@nestjs/common'

import { computeCharge } from 'src/common/money'
import { matchServedCity } from 'src/common/served-cities'
import { AppException } from 'src/exception/app.exception'
import { TasksRepository } from '../repository/tasks.repository'
import { SaveCardService } from 'src/modules/cards/use-cases/save-card.service'
import { FetchUserCardService } from 'src/modules/cards/use-cases/fetch-user-card.service'
import { FetchUserDetailsService } from 'src/modules/auth/use-cases/fetch-user-details.service'

import { errorDictionary } from 'src/exception/error-dictionary'

import type { CreateTaskData } from '../types'

@Injectable()
export class CreateTaskService {
  constructor(
    private tasksRepository: TasksRepository,
    private saveCardService: SaveCardService,
    private fetchUserCardService: FetchUserCardService,
    private fetchUserDetailsService: FetchUserDetailsService,
  ) {}

  async execute(data: CreateTaskData): Promise<{ id: string }> {
    const {
      city,
      title,
      state,
      userId,
      street,
      zipCode,
      complement,
      formattedAddress,
      description,
      locationLat,
      locationLng,
      offeredPrice,
      savedCard,
      paymentMethodId,
    } = data

    const served = matchServedCity(city, state)

    if (!served) {
      throw new AppException(errorDictionary.tasks.cityNotServed)
    }

    const user = await this.fetchUserDetailsService.execute(userId)

    if (user.userType !== 'CLIENT') {
      throw new AppException(errorDictionary.user.notClient)
    }

    if (savedCard) {
      const card = await this.fetchUserCardService.execute(userId)

      if (card.stripeCardId !== savedCard) {
        throw new AppException(errorDictionary.card.noSavedCardFound)
      }
    } else if (paymentMethodId) {
      await this.saveCardService.execute({ userId, paymentMethodId })
    }

    const { platformFee, stripeFee, chargedAmount, proxyEarnings, ...rest } =
      computeCharge(offeredPrice)

    const locationAddress = formattedAddress
      ? complement
        ? `${formattedAddress} — ${complement}`
        : formattedAddress
      : `${street}, ${served.city} - ${served.state}, ${zipCode}`

    const task = await this.tasksRepository.createTask({
      title,
      userId,
      description,
      locationLat,
      locationLng,
      locationAddress,
      city: served.city,
      state: served.state,
      offeredPrice: rest.offeredPrice,
      platformFee,
      stripeFee,
      chargedAmount,
      proxyEarnings,
    })

    return { id: task.id }
  }
}
