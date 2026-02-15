import { SettingMigration } from '../setting.types'

export const migrateFrom16To17: SettingMigration['migrate'] = (data) => {
  const newData = { ...data }
  newData.version = 17

  newData.zotero = {
    apiBaseUrl: 'http://localhost:23119',
    zoteroStoragePath: '',
    libraryVaultPath: 'Library',
    selectedCollection: '',
  }

  return newData
}
