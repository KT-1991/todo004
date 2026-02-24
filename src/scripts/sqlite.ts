import type { DbId, PromiserMethods } from '@sqlite.org/sqlite-wasm'
import { sqlite3Worker1Promiser } from '@sqlite.org/sqlite-wasm'
import { ref } from 'vue'

type DbPromiser = ReturnType<typeof sqlite3Worker1Promiser>
type CategoryType = 'dated' | 'plain'

const DB_FILENAME = 'mydb.sqlite3'
const DB_URI = `file:${DB_FILENAME}?vfs=opfs`
const EXPORT_FILENAME = 'todo004.sqlite3'
const SCHEMA_VERSION = '2'

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ms_category (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_type TEXT NOT NULL CHECK(category_type IN ('dated', 'plain')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS tr_todo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_category INTEGER NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  do_at TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (id_category) REFERENCES ms_category(id)
);

CREATE INDEX IF NOT EXISTS idx_todo_category_doat ON tr_todo(id_category, do_at);
CREATE INDEX IF NOT EXISTS idx_todo_category_completed ON tr_todo(id_category, completed_at);
CREATE INDEX IF NOT EXISTS idx_category_type ON ms_category(category_type);
`

type LegacyCategory = {
  id: number
  name: string
}

type LegacyTodo = {
  id: number
  idCategory: number
  title: string
  detail: string
  doAt: string
  createdAt: string
}

export function useSQLite() {
  const isLoading = ref(false)
  const error = ref<Error | null>(null)
  const isInitialized = ref(false)

  let promiser: DbPromiser | null = null
  let dbId: DbId = undefined

  function nowIso(): string {
    return new Date().toISOString()
  }

  async function ensurePromiser() {
    if (promiser) return

    const created = await new Promise<DbPromiser>((resolve) => {
      const createdPromiser = sqlite3Worker1Promiser({
        onready: () => resolve(createdPromiser),
      })
    })

    promiser = created
    await promiser('config-get', {})
  }

  async function openMainDb() {
    if (!promiser) throw new Error('SQLite promiser is not initialized')
    const response = await promiser('open', { filename: DB_URI })
    if (response.type === 'error') {
      throw new Error(response.result.message)
    }
    dbId = response.result.dbId
    await execSql('PRAGMA foreign_keys = ON;')
  }

  async function closeCurrentDb() {
    if (!promiser || !dbId) return
    try {
      await (promiser as any)('close', { dbId })
    }
    catch {
      // ignore close failures and continue
    }
    dbId = undefined
    isInitialized.value = false
  }

  async function execSql(sql: string, bind: unknown[] = [], targetDbId: DbId = dbId) {
    if (!promiser || !targetDbId) {
      throw new Error('Database is not ready')
    }
    const result = await promiser('exec', {
      dbId: targetDbId,
      sql,
      bind,
      returnValue: 'resultRows',
    })
    if (result.type === 'error') {
      throw new Error(result.result.message)
    }
    return result
  }

  async function tableExists(tableName: string): Promise<boolean> {
    const result = await execSql(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
      [tableName],
    )
    return (result.result.resultRows?.length ?? 0) > 0
  }

  async function getColumnNames(tableName: string): Promise<string[]> {
    const result = await execSql(`PRAGMA table_info(${tableName});`)
    return (result.result.resultRows ?? []).map((row) => String(row[1]))
  }

  function normalizeDateOnly(value: unknown): string | null {
    if (value == null) return null
    const raw = String(value).trim()
    if (!raw) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString().slice(0, 10)
  }

  function normalizeDateTime(value: unknown): string {
    if (value == null) return nowIso()
    const date = new Date(String(value))
    if (Number.isNaN(date.getTime())) return nowIso()
    return date.toISOString()
  }

  async function readLegacyCategories(): Promise<LegacyCategory[]> {
    const hasCategoryTable = await tableExists('ms_category')
    if (!hasCategoryTable) return []

    const hasDeletedCategoryTable = await tableExists('d_ms_category')
    const sql = hasDeletedCategoryTable
      ? `
        SELECT mc.id, mc.name
        FROM ms_category mc
        LEFT JOIN d_ms_category dc ON dc.id = mc.id
        WHERE dc.id IS NULL
        ORDER BY mc.id
      `
      : `
        SELECT id, name
        FROM ms_category
        ORDER BY id
      `

    const result = await execSql(sql)
    return (result.result.resultRows ?? []).map((row) => ({
      id: Number(row[0]),
      name: String(row[1] ?? ''),
    }))
  }

  async function readLegacyTodos(validCategoryIds: Set<number>): Promise<LegacyTodo[]> {
    const hasTodoTable = await tableExists('tr_todo')
    if (!hasTodoTable) return []

    const hasDeletedTodoTable = await tableExists('d_tr_todo')
    const sql = hasDeletedTodoTable
      ? `
        SELECT tt.id, tt.id_category, tt.title, tt.detail, tt.do_at, tt.created_at
        FROM tr_todo tt
        LEFT JOIN d_tr_todo dt ON dt.id = tt.id
        WHERE dt.id IS NULL
        ORDER BY tt.id
      `
      : `
        SELECT id, id_category, title, detail, do_at, created_at
        FROM tr_todo
        ORDER BY id
      `

    const result = await execSql(sql)
    const todos: LegacyTodo[] = []
    for (const row of result.result.resultRows ?? []) {
      const idCategory = Number(row[1])
      if (!validCategoryIds.has(idCategory)) continue

      const normalizedDoAt = normalizeDateOnly(row[4])
      if (!normalizedDoAt) continue

      todos.push({
        id: Number(row[0]),
        idCategory,
        title: String(row[2] ?? ''),
        detail: String(row[3] ?? ''),
        doAt: normalizedDoAt,
        createdAt: normalizeDateTime(row[5]),
      })
    }
    return todos
  }

  async function recreateV2Tables() {
    const sql = `
      BEGIN;
      DROP TABLE IF EXISTS tr_todo;
      DROP TABLE IF EXISTS ms_category;
      DROP TABLE IF EXISTS app_meta;
      DROP TABLE IF EXISTS d_tr_todo;
      DROP TABLE IF EXISTS d_ms_category;
      DROP TABLE IF EXISTS test_table;
      COMMIT;
    `
    await execSql(sql)
    await execSql(SCHEMA_SQL)
  }

  async function upsertMeta(key: string, value: string) {
    await execSql(
      `
      INSERT INTO app_meta(key, value)
      VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
      [key, value],
    )
  }

  async function seedDefaultCategoriesIfEmpty() {
    const result = await execSql(
      'SELECT COUNT(1) FROM ms_category WHERE deleted_at IS NULL;',
    )
    const count = Number(result.result.resultRows?.[0]?.[0] ?? 0)
    if (count > 0) return

    const now = nowIso()
    const defaults: Array<{ name: string; categoryType: CategoryType }> = [
      { name: 'General', categoryType: 'dated' },
      { name: 'Someday', categoryType: 'plain' },
    ]

    for (const [index, item] of defaults.entries()) {
      await execSql(
        `
        INSERT INTO ms_category(name, category_type, sort_order, created_at, deleted_at)
        VALUES(?, ?, ?, ?, NULL)
        `,
        [item.name, item.categoryType, index + 1, now],
      )
    }
  }

  async function migrateLegacyToV2() {
    const legacyCategories = await readLegacyCategories()
    const validCategoryIds = new Set<number>(legacyCategories.map((item) => item.id))
    const legacyTodos = await readLegacyTodos(validCategoryIds)

    await recreateV2Tables()
    const now = nowIso()

    if (legacyCategories.length > 0) {
      for (const [index, category] of legacyCategories.entries()) {
        await execSql(
          `
          INSERT INTO ms_category(id, name, category_type, sort_order, created_at, deleted_at)
          VALUES(?, ?, 'dated', ?, ?, NULL)
          `,
          [category.id, category.name, index + 1, now],
        )
      }
    }
    else {
      await seedDefaultCategoriesIfEmpty()
    }

    for (const todo of legacyTodos) {
      await execSql(
        `
        INSERT INTO tr_todo(id, id_category, title, detail, do_at, created_at, completed_at, deleted_at)
        VALUES(?, ?, ?, ?, ?, ?, NULL, NULL)
        `,
        [todo.id, todo.idCategory, todo.title, todo.detail, todo.doAt, todo.createdAt],
      )
    }

    await upsertMeta('schema_version', SCHEMA_VERSION)
  }

  async function ensureV2Schema() {
    const hasCategoryTable = await tableExists('ms_category')
    const hasTodoTable = await tableExists('tr_todo')

    if (!hasCategoryTable && !hasTodoTable) {
      await execSql(SCHEMA_SQL)
      await upsertMeta('schema_version', SCHEMA_VERSION)
      await seedDefaultCategoriesIfEmpty()
      return
    }

    if (!hasCategoryTable || !hasTodoTable) {
      await migrateLegacyToV2()
      return
    }

    const categoryColumns = await getColumnNames('ms_category')
    const todoColumns = await getColumnNames('tr_todo')
    const isV2 =
      categoryColumns.includes('category_type') &&
      categoryColumns.includes('sort_order') &&
      categoryColumns.includes('deleted_at') &&
      todoColumns.includes('completed_at') &&
      todoColumns.includes('deleted_at')

    if (!isV2) {
      await migrateLegacyToV2()
      return
    }

    await execSql(SCHEMA_SQL)
    await upsertMeta('schema_version', SCHEMA_VERSION)
    await seedDefaultCategoriesIfEmpty()
  }

  async function initialize() {
    if (isInitialized.value) return true

    isLoading.value = true
    error.value = null

    try {
      await ensurePromiser()
      await openMainDb()
      await ensureV2Schema()
      isInitialized.value = true
      return true
    }
    catch (err) {
      error.value = err instanceof Error ? err : new Error('Unknown error')
      throw error.value
    }
    finally {
      isLoading.value = false
    }
  }

  async function executeQuery(sql: string, params: unknown[] = []) {
    if (!dbId || !promiser || !isInitialized.value) {
      await initialize()
    }

    isLoading.value = true
    error.value = null

    try {
      return await execSql(sql, params)
    }
    catch (err) {
      error.value = err instanceof Error ? err : new Error('Query execution failed')
      throw error.value
    }
    finally {
      isLoading.value = false
    }
  }

  async function exportDB() {
    if (!dbId || !promiser || !isInitialized.value) {
      await initialize()
    }

    const response = await (promiser as any)('export' as keyof PromiserMethods, {
      dbId: dbId as never,
    })
    const blob = new Blob([(response.result as any).byteArray], {
      type: 'application/x-sqlite3',
    })

    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = EXPORT_FILENAME
    document.body.appendChild(anchor)
    anchor.addEventListener('click', () => {
      setTimeout(() => {
        URL.revokeObjectURL(anchor.href)
        anchor.remove()
      }, 500)
    })
    anchor.click()
  }

  async function openFileDialog(): Promise<File | null> {
    return await new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.sqlite,.sqlite3,.db,application/x-sqlite3'
      input.onchange = () => {
        const file = input.files?.[0] ?? null
        resolve(file)
      }
      input.click()
    })
  }

  async function writeBlobToOpfs(path: string, blob: Blob) {
    const root = await navigator.storage.getDirectory()
    const fileHandle = await root.getFileHandle(path, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(blob)
    await writable.close()
  }

  async function importDB() {
    if (!promiser || !dbId || !isInitialized.value) {
      await initialize()
    }

    isLoading.value = true
    error.value = null

    try {
      const importFile = await openFileDialog()
      if (!importFile) return

      let backupBlob: Blob | null = null
      if (promiser && dbId) {
        const backup = await (promiser as any)('export' as keyof PromiserMethods, {
          dbId: dbId as never,
        })
        backupBlob = new Blob([(backup.result as any).byteArray], {
          type: 'application/x-sqlite3',
        })
      }

      await closeCurrentDb()
      await writeBlobToOpfs(DB_FILENAME, importFile)
      await openMainDb()

      try {
        await ensureV2Schema()
        isInitialized.value = true
      }
      catch (schemaError) {
        if (backupBlob) {
          await writeBlobToOpfs(DB_FILENAME, backupBlob)
          await closeCurrentDb()
          await openMainDb()
          await ensureV2Schema()
          isInitialized.value = true
        }
        throw schemaError
      }
    }
    catch (err) {
      error.value = err instanceof Error ? err : new Error('Import failed')
      throw error.value
    }
    finally {
      isLoading.value = false
    }
  }

  return {
    isLoading,
    error,
    isInitialized,
    executeQuery,
    exportDB,
    importDB,
    initialize,
  }
}
