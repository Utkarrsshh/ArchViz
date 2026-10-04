/** Environment package served from public/. All manifest paths resolve relative to baseUrl. */
export interface EnvironmentConfig {
  readonly baseUrl: string
  readonly manifestFile: string
}

/**
 * Folder under public/environments/ that holds this project's Blender-generated package
 * (layout.json, scene/, data/). Set VITE_ENVIRONMENT_ID (see .env.example) or edit the default.
 */
export const ENVIRONMENT_ID: string = import.meta.env.VITE_ENVIRONMENT_ID || 'main'

export const ENVIRONMENT_CONFIG: EnvironmentConfig = {
  baseUrl: `${import.meta.env.BASE_URL}environments/${ENVIRONMENT_ID}/`,
  manifestFile: 'layout.json',
}
