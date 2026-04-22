import type { StripeService } from 'src/stripe/stripe.service'

export const createStripeServiceMock = (): jest.Mocked<StripeService> =>
  ({
    searchCustomer: jest.fn().mockResolvedValue({ data: [] }),
    createCustomer: jest.fn().mockResolvedValue({ id: 'cus_test_123' }),
    createPaymentMethod: jest.fn().mockResolvedValue({
      id: 'pm_test_123',
      card: { brand: 'visa', last4: '4242' },
    }),
    attachPaymentMethodToCustomer: jest
      .fn()
      .mockResolvedValue({ id: 'pm_test_123' }),
    createPaymentIntent: jest.fn().mockResolvedValue({
      id: 'pi_test_123',
      status: 'requires_confirmation',
    }),
    confirmPaymentIntent: jest.fn().mockResolvedValue({
      id: 'pi_test_123',
      status: 'succeeded',
    }),
    refundPayment: jest.fn().mockResolvedValue({ id: 're_test_123' }),
    createMerchantAccount: jest.fn().mockResolvedValue({ id: 'acct_test_123' }),
    linkMerchantAccount: jest
      .fn()
      .mockResolvedValue({ url: 'https://stripe.test/onboarding' }),
    createDashboardLoginLink: jest
      .fn()
      .mockResolvedValue({ url: 'https://stripe.test/dashboard' }),
    constructWebhookEvent: jest.fn(),
  }) as unknown as jest.Mocked<StripeService>
