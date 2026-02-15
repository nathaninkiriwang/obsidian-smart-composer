import { SettingMigration } from '../setting.types'

export const migrateFrom17To18: SettingMigration['migrate'] = (data) => {
  const newData = { ...data }
  newData.version = 18

  const zotero = (newData.zotero ?? {}) as Record<string, unknown>
  zotero.pdfExtractionModelId = ''
  newData.zotero = zotero

  return newData
}
