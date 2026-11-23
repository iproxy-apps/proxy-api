import { matchServedCity } from './served-cities'

describe('matchServedCity', () => {
  it.each([
    ['São Paulo', 'SP', 'São Paulo'],
    ['sao paulo', 'sp', 'São Paulo'],
    ['  SÃO   PAULO ', undefined, 'São Paulo'],
    ['Rio de Janeiro', 'Rio de Janeiro', 'Rio de Janeiro'],
    ['Belo Horizonte', 'minas gerais', 'Belo Horizonte'],
    ['São Paulo', 'RJ', null],
    ['Curitiba', 'PR', null],
    ['Niterói', 'RJ', null],
    ['', undefined, null],
  ])('matchServedCity(%p, %p) → %p', (city, state, expected) => {
    expect(matchServedCity(city, state)?.city ?? null).toBe(expected)
  })
})
