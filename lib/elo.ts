/**
 * Standard Elo rating calculation.
 *
 * Expected score for player A against player B:
 *   E_a = 1 / (1 + 10 ^ ((R_b - R_a) / 400))
 *
 * New rating:
 *   R'_a = R_a + K * (S_a - E_a)
 *
 * where S_a is the actual score (1 win, 0.5 draw, 0 loss).
 */

export const DEFAULT_RATING = 1200

/** K-factor scales with experience: provisional players move faster. */
export function kFactor(gamesPlayed: number, rating: number): number {
  if (gamesPlayed < 30) return 40 // provisional
  if (rating >= 2400) return 10 // master
  return 20 // established
}

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))
}

export type EloResult = {
  ratingA: number
  ratingB: number
  deltaA: number
  deltaB: number
}

/**
 * Compute new ratings for a 1v1 match.
 * `scoreA` is 1 (A wins), 0.5 (draw), or 0 (A loses).
 */
export function computeElo(
  ratingA: number,
  ratingB: number,
  scoreA: 0 | 0.5 | 1,
  gamesA: number,
  gamesB: number,
): EloResult {
  const ea = expectedScore(ratingA, ratingB)
  const eb = expectedScore(ratingB, ratingA)
  const scoreB = (1 - scoreA) as 0 | 0.5 | 1

  const ka = kFactor(gamesA, ratingA)
  const kb = kFactor(gamesB, ratingB)

  const deltaA = Math.round(ka * (scoreA - ea))
  const deltaB = Math.round(kb * (scoreB - eb))

  return {
    ratingA: ratingA + deltaA,
    ratingB: ratingB + deltaB,
    deltaA,
    deltaB,
  }
}
