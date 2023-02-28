import { DomainError } from '../../error/domainError'

export const Disc = {
  Empty: 0,
  Dark: 1,
  Light: 2,
  Wall: 3,
} as const

export type Disc = (typeof Disc)[keyof typeof Disc]
export function toDisc(value: any): Disc {
  if (!Object.values(Disc).includes(value))
    throw new DomainError('InvalidDiscValue', 'Invalued disc value')

  return value as Disc
}

export function isOppositeDisc(disc1: Disc, disc2: Disc): boolean {
  return (
    (disc1 === Disc.Dark && disc2 === Disc.Light) ||
    (disc1 === Disc.Light && disc2 === Disc.Dark)
  )
}
