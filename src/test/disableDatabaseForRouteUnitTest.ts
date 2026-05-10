export function disableDatabaseForRouteUnitTest() {
  const previousDatabaseUrl = process.env.DATABASE_URL
  delete process.env.DATABASE_URL

  return () => {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl
    }
  }
}
