/** Environment package served from public/. All manifest paths resolve relative to baseUrl. */
export interface EnvironmentConfig {
  readonly baseUrl: string
  readonly manifestFile: string
}

export const ENVIRONMENT_CONFIG: EnvironmentConfig = {
  baseUrl: `${import.meta.env.BASE_URL}environments/polyhouse/`,
  manifestFile: 'layout.json',
}
