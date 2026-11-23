import { hash } from 'bcryptjs'

export const BCRYPT_COST = 10

export const hashPassword = (plain: string): Promise<string> =>
  hash(plain, BCRYPT_COST)

// Real bcrypt hash (cost 10) of a random string nobody knows; used to equalise
// timing when the account does not exist.
export const DUMMY_PASSWORD_HASH: string =
  '$2b$10$.qQeKaqxBknKsr2a7wDPOuPTNBSYosuvjUGSHGof0lbf2PMIcAZ0G'
