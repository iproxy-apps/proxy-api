import { ResendMailAdapter } from './resend-mail.adapter'

const fetchMock = jest.spyOn(global, 'fetch')
const msg = { to: 'ana@test.io', subject: 'Oi', html: '<p>x</p>' }

describe('ResendMailAdapter', () => {
  afterEach(() => {
    fetchMock.mockReset()
  })

  it('posts to the Resend API with the key and sender', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 'em_1' }), { status: 200 }),
    )

    await new ResendMailAdapter(
      're_test_123',
      'Proxy <no-reply@proxy.test>',
    ).send(msg)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test_123',
        }),
      }),
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
      from: 'Proxy <no-reply@proxy.test>',
      to: ['ana@test.io'],
      subject: 'Oi',
      html: '<p>x</p>',
    })
  })

  it('bounds the request with an abort signal', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))

    await new ResendMailAdapter('re_test_123', 'x <x@x.io>').send(msg)

    expect(fetchMock.mock.calls[0][1]!.signal).toBeInstanceOf(AbortSignal)
  })

  it('throws on a non-2xx response', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"message":"invalid from"}', { status: 422 }),
    )

    await expect(
      new ResendMailAdapter('re_test_123', 'x <x@x.io>').send(msg),
    ).rejects.toThrow('Resend 422')
  })
})
