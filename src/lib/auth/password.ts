import bcrypt from 'bcryptjs'

export const PASSWORD_ALGORITHM = 'bcrypt'
export const MIN_PASSWORD_LENGTH = 12
const BCRYPT_COST = 12

function assertPasswordAllowed(plaintextPassword: string) {
  if (!plaintextPassword || plaintextPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  }
}

export async function hashPassword(plaintextPassword: string): Promise<{ hash: string; algorithm: string }> {
  assertPasswordAllowed(plaintextPassword)
  return {
    hash: await bcrypt.hash(plaintextPassword, BCRYPT_COST),
    algorithm: PASSWORD_ALGORITHM,
  }
}

export async function verifyPassword(
  plaintextPassword: string,
  storedHash: string,
  algorithm: string,
): Promise<boolean> {
  if (algorithm !== PASSWORD_ALGORITHM) {
    throw new Error('Unsupported password hash algorithm.')
  }
  if (!plaintextPassword || !storedHash) return false
  return bcrypt.compare(plaintextPassword, storedHash)
}
