export async function resolveMockData<T>(data: T): Promise<T> {
  return structuredClone(data)
}

