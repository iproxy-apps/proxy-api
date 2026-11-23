import type { NotificationService } from 'src/notification/notification.service'

export const createNotificationServiceMock =
  (): jest.Mocked<NotificationService> =>
    ({
      sendEmail: jest.fn().mockResolvedValue(undefined),
      sendSms: jest.fn().mockResolvedValue(undefined),
      sendResetCodeByEmail: jest.fn().mockResolvedValue(undefined),
      sendResetCodeBySms: jest.fn().mockResolvedValue(undefined),
      sendCardChargeFailedEmail: jest.fn().mockResolvedValue(undefined),
    }) as unknown as jest.Mocked<NotificationService>
