import type { Prisma } from '@prisma/client'

export class OwnerUnavailableError extends Error {
  constructor() {
    super('Owner account is missing or deleted')
  }
}

// Takes the per-user advisory lock (the one account deletion, password reset
// and refresh-token writes take) FIRST, then verifies the account is still
// live, so a write can never land after a concurrent deletion committed.
export const lockLiveOwner = async (
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`
  const owner = await tx.users.findUnique({
    where: { id: userId },
    select: { isDeleted: true },
  })
  if (!owner || owner.isDeleted) throw new OwnerUnavailableError()
}
