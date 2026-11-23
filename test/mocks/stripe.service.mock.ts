import type { StripeService } from 'src/stripe/stripe.service'

export const createStripeServiceMock = (): jest.Mocked<StripeService> =>
  ({
    searchCustomer: jest.fn().mockResolvedValue({ data: [] }),
    createCustomer: jest.fn().mockResolvedValue({ id: 'cus_test_123' }),
    retrievePaymentMethod: jest.fn().mockResolvedValue({
      id: 'pm_test_123',
      customer: 'cus_test_default',
      card: { brand: 'visa', last4: '4242' },
    }),
    createSetupIntent: jest.fn().mockResolvedValue({
      id: 'seti_test_123',
      client_secret: 'seti_test_123_secret_abc',
    }),
    chargeSavedCard: jest.fn().mockResolvedValue({
      id: 'pi_test_123',
      status: 'succeeded',
      latest_charge: 'ch_test_123',
    }),
    refundPaymentIntent: jest
      .fn()
      .mockResolvedValue({ id: 're_test_123', status: 'succeeded' }),
    createTransferFromCharge: jest.fn().mockResolvedValue({ id: 'tr_test_123' }),
    detachPaymentMethod: jest.fn().mockResolvedValue({ id: 'pm_test_123' }),
    reverseTransfer: jest.fn().mockResolvedValue({ id: 'trr_test_123' }),
    listPayoutTransactions: jest.fn().mockResolvedValue({ data: [] }),
    createMerchantAccount: jest.fn().mockResolvedValue({ id: 'acct_test_123' }),
    linkMerchantAccount: jest
      .fn()
      .mockResolvedValue({ url: 'https://stripe.test/onboarding' }),
    createDashboardLoginLink: jest
      .fn()
      .mockResolvedValue({ url: 'https://stripe.test/dashboard' }),
    constructWebhookEvent: jest.fn(),
  }) as unknown as jest.Mocked<StripeService>
