export const SERVED_CITIES = [
  { city: 'São Paulo', state: 'SP', stateName: 'São Paulo' },
  { city: 'Rio de Janeiro', state: 'RJ', stateName: 'Rio de Janeiro' },
  { city: 'Belo Horizonte', state: 'MG', stateName: 'Minas Gerais' },
] as const

export type ServedCity = (typeof SERVED_CITIES)[number]

export const foldPlaceName = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()

export const matchServedCity = (
  city: string,
  state?: string,
): ServedCity | null => {
  const foldedCity = foldPlaceName(city)
  if (!foldedCity) return null

  const served = SERVED_CITIES.find((c) => foldPlaceName(c.city) === foldedCity)
  if (!served) return null

  if (state === undefined) return served

  const foldedState = foldPlaceName(state)
  const stateMatches =
    foldedState === foldPlaceName(served.state) ||
    foldedState === foldPlaceName(served.stateName)

  return stateMatches ? served : null
}
