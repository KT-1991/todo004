import { defineStore } from 'pinia'
import { CATEGORY_TYPE, type CategoryType } from '@/scripts/const'
import { useSQLite } from '@/scripts/sqlite'
import { toDateKey } from '@/scripts/utils'

const { executeQuery, exportDB, importDB, initialize } = useSQLite()

export type TodoCategory = {
  id: number
  name: string
  categoryType: CategoryType
  sortOrder: number
}

export type TodoItem = {
  id: number
  idCategory: number
  title: string
  detail: string
  doAt: string | null
  createAt: string
  completedAt: string | null
  deletedAt: string | null
}

function todayDateKey(): string {
  return toDateKey(new Date())
}

function normalizeDateValue(input: unknown): string | null {
  if (input == null) return null
  const raw = String(input).trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  return toDateKey(date)
}

function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&')
}

export const useTodoStore = defineStore('todo', {
  state: () => ({
    listCategory: [] as TodoCategory[],
    currentTodo: {} as Record<number, TodoItem[]>,
    completedTodo: {} as Record<number, TodoItem[]>,
    suggestions: [] as string[],
    isSortedByDateAsc: true,
    isSortedByTitleAsc: true,
  }),

  getters: {
    datedCategoryIds(): number[] {
      return this.listCategory
        .filter((category) => category.categoryType === CATEGORY_TYPE.DATED)
        .map((category) => category.id)
    },

    dateSpan(): string[] {
      const datedIdSet = new Set(this.datedCategoryIds)
      const dates = new Set<string>()

      for (const categoryId of Object.keys(this.currentTodo)) {
        const numericCategoryId = Number(categoryId)
        if (!datedIdSet.has(numericCategoryId)) continue

        for (const todo of this.currentTodo[numericCategoryId] ?? []) {
          if (todo.doAt) dates.add(todo.doAt)
        }
      }

      const sortedDates = Array.from(dates).sort()
      if (sortedDates.length === 0) return []

      const start = new Date(`${sortedDates[0]}T00:00:00`)
      const end = new Date(`${sortedDates[sortedDates.length - 1]}T00:00:00`)
      const result: string[] = []
      for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
        result.push(toDateKey(date))
      }
      return result
    },

    calendarTodo(): Record<string, Record<number, TodoItem[]>> {
      const calendar: Record<string, Record<number, TodoItem[]>> = {}
      const datedCategories = this.listCategory.filter(
        (category) => category.categoryType === CATEGORY_TYPE.DATED,
      )

      for (const date of this.dateSpan) {
        calendar[date] = {}
        for (const category of datedCategories) {
          calendar[date][category.id] = []
        }
      }

      for (const category of datedCategories) {
        for (const todo of this.currentTodo[category.id] ?? []) {
          const dateKey = todo.doAt
          if (!dateKey) continue

          if (!calendar[dateKey]) {
            calendar[dateKey] = {}
          }

          const dayBucket = calendar[dateKey]
          const list = dayBucket[category.id] ?? []
          list.push(todo)
          dayBucket[category.id] = list
        }
      }

      return calendar
    },
  },

  actions: {
    categoryTypeById(categoryId: number): CategoryType {
      const category = this.listCategory.find((item) => item.id === categoryId)
      return category?.categoryType ?? CATEGORY_TYPE.DATED
    },

    async init() {
      await initialize()
      await this.initListCategory()
      await this.initTodo(false, 0, 0)
    },

    async initWithCompletedData(limit: number, offset: number) {
      await initialize()
      await this.initListCategory()
      await this.initTodo(true, limit, offset)
    },

    async initListCategory() {
      const result = await executeQuery(
        `
        SELECT id, name, category_type, sort_order
        FROM ms_category
        WHERE deleted_at IS NULL
        ORDER BY sort_order ASC, id ASC
        `,
      )

      this.listCategory = (result.result.resultRows ?? []).map((row) => ({
        id: Number(row[0]),
        name: String(row[1]),
        categoryType: (row[2] as CategoryType) ?? CATEGORY_TYPE.DATED,
        sortOrder: Number(row[3] ?? 0),
      }))
    },

    async initTodo(hasCompletedData: boolean, limit: number, offset: number) {
      const nextCurrentTodo: Record<number, TodoItem[]> = {}
      const nextCompletedTodo: Record<number, TodoItem[]> = {}
      for (const category of this.listCategory) {
        nextCurrentTodo[category.id] = []
        nextCompletedTodo[category.id] = []
      }

      const activeRows = await executeQuery(
        `
        SELECT id, id_category, title, detail, do_at, created_at, completed_at, deleted_at
        FROM tr_todo
        WHERE deleted_at IS NULL
        ORDER BY
          CASE WHEN completed_at IS NULL THEN 0 ELSE 1 END,
          CASE WHEN do_at IS NULL THEN 1 ELSE 0 END,
          do_at ASC,
          created_at DESC
        `,
      )

      for (const row of activeRows.result.resultRows ?? []) {
        const categoryId = Number(row[1])
        if (!nextCurrentTodo[categoryId]) continue
        nextCurrentTodo[categoryId].push({
          id: Number(row[0]),
          idCategory: categoryId,
          title: String(row[2] ?? ''),
          detail: String(row[3] ?? ''),
          doAt: normalizeDateValue(row[4]),
          createAt: String(row[5] ?? new Date().toISOString()),
          completedAt: row[6] == null ? null : String(row[6]),
          deletedAt: row[7] == null ? null : String(row[7]),
        })
      }

      if (!hasCompletedData) {
        this.currentTodo = nextCurrentTodo
        this.completedTodo = nextCompletedTodo
        return
      }

      const pageSize = limit > 0 ? limit : 100
      const pageOffset = offset >= 0 ? offset : 0

      const completedRows = await executeQuery(
        `
        SELECT id, id_category, title, detail, do_at, created_at, completed_at, deleted_at
        FROM tr_todo
        WHERE completed_at IS NOT NULL
        ORDER BY completed_at DESC
        LIMIT ? OFFSET ?
        `,
        [pageSize, pageOffset],
      )

      for (const row of completedRows.result.resultRows ?? []) {
        const categoryId = Number(row[1])
        if (!nextCompletedTodo[categoryId]) continue
        nextCompletedTodo[categoryId].push({
          id: Number(row[0]),
          idCategory: categoryId,
          title: String(row[2] ?? ''),
          detail: String(row[3] ?? ''),
          doAt: normalizeDateValue(row[4]),
          createAt: String(row[5] ?? new Date().toISOString()),
          completedAt: row[6] == null ? null : String(row[6]),
          deletedAt: row[7] == null ? null : String(row[7]),
        })
      }

      this.currentTodo = nextCurrentTodo
      this.completedTodo = nextCompletedTodo
    },

    async addTodo(idCategory: number, title: string, detail: string, doAtInput: string | null) {
      const category = this.listCategory.find((item) => item.id === idCategory)
      if (!category) {
        throw new Error('Category not found')
      }

      const normalizedTitle = title.trim()
      if (!normalizedTitle) {
        throw new Error('Title is required')
      }

      const normalizedDoAt = normalizeDateValue(doAtInput)
      const doAt = category.categoryType === CATEGORY_TYPE.DATED ? normalizedDoAt : null

      if (category.categoryType === CATEGORY_TYPE.DATED && !doAt) {
        throw new Error('Date is required for dated category')
      }

      await executeQuery(
        `
        INSERT INTO tr_todo(id_category, title, detail, do_at, created_at, completed_at, deleted_at)
        VALUES(?, ?, ?, ?, ?, NULL, NULL)
        `,
        [idCategory, normalizedTitle, detail.trim(), doAt, new Date().toISOString()],
      )

      await this.initTodo(false, 0, 0)
    },

    async completeTodo(id: number) {
      await executeQuery(
        `
        UPDATE tr_todo
        SET completed_at = CASE
          WHEN completed_at IS NULL THEN ?
          ELSE NULL
        END
        WHERE id = ?
          AND deleted_at IS NULL
        `,
        [new Date().toISOString(), id],
      )
      await this.initTodo(false, 0, 0)
    },

    async deleteTodo(id: number) {
      await executeQuery(
        `
        UPDATE tr_todo
        SET deleted_at = ?
        WHERE id = ?
          AND deleted_at IS NULL
          AND completed_at IS NOT NULL
        `,
        [new Date().toISOString(), id],
      )
      await this.initTodo(false, 0, 0)
    },

    async cancelDeleteTodo(id: number) {
      await executeQuery(
        `
        UPDATE tr_todo
        SET completed_at = NULL,
            deleted_at = NULL
        WHERE id = ?
        `,
        [id],
      )
      await this.initTodo(false, 0, 0)
    },

    async cancelAddTodo(id: number) {
      await executeQuery('DELETE FROM tr_todo WHERE id = ?', [id])
      await this.initTodo(false, 0, 0)
    },

    async addCategory(name: string, categoryType: CategoryType) {
      const normalizedName = name.trim()
      if (!normalizedName) return

      const maxSortOrderResult = await executeQuery(
        'SELECT IFNULL(MAX(sort_order), 0) FROM ms_category WHERE deleted_at IS NULL',
      )
      const nextSortOrder = Number(maxSortOrderResult.result.resultRows?.[0]?.[0] ?? 0) + 1

      await executeQuery(
        `
        INSERT INTO ms_category(name, category_type, sort_order, created_at, deleted_at)
        VALUES(?, ?, ?, ?, NULL)
        `,
        [normalizedName, categoryType, nextSortOrder, new Date().toISOString()],
      )

      await this.initListCategory()
      await this.initTodo(false, 0, 0)
    },

    async updateCategoryType(id: number, categoryType: CategoryType) {
      await executeQuery(
        `
        UPDATE ms_category
        SET category_type = ?
        WHERE id = ?
          AND deleted_at IS NULL
        `,
        [categoryType, id],
      )

      if (categoryType === CATEGORY_TYPE.PLAIN) {
        await executeQuery(
          `
          UPDATE tr_todo
          SET do_at = NULL
          WHERE id_category = ?
            AND deleted_at IS NULL
            AND completed_at IS NULL
          `,
          [id],
        )
      }

      await this.init()
    },

    async deleteCategory(id: number) {
      const now = new Date().toISOString()
      await executeQuery(
        `
        UPDATE ms_category
        SET deleted_at = ?
        WHERE id = ?
          AND deleted_at IS NULL
        `,
        [now, id],
      )

      await executeQuery(
        `
        UPDATE tr_todo
        SET deleted_at = ?
        WHERE id_category = ?
          AND deleted_at IS NULL
        `,
        [now, id],
      )

      await this.initListCategory()
      await this.initTodo(false, 0, 0)
    },

    async reorderCategories(orderedCategoryIds: number[]) {
      const currentIds = this.listCategory.map((category) => category.id)
      if (orderedCategoryIds.length !== currentIds.length) {
        throw new Error('Invalid category order')
      }

      const uniqueIds = new Set(orderedCategoryIds)
      if (uniqueIds.size !== orderedCategoryIds.length) {
        throw new Error('Invalid category order')
      }

      for (const id of currentIds) {
        if (!uniqueIds.has(id)) {
          throw new Error('Invalid category order')
        }
      }

      for (const [index, id] of orderedCategoryIds.entries()) {
        await executeQuery(
          `
          UPDATE ms_category
          SET sort_order = ?
          WHERE id = ?
            AND deleted_at IS NULL
          `,
          [index + 1, id],
        )
      }

      await this.initListCategory()
    },

    async makeSuggestions(word: string) {
      this.suggestions = await this.fetchTitleSuggestions(word, 10)
    },

    async fetchTitleSuggestions(word: string, limit = 10): Promise<string[]> {
      const keyword = word.trim()
      if (!keyword || limit <= 0) return []

      const escaped = `${escapeLikePattern(keyword)}%`
      const result = await executeQuery(
        `
        SELECT title
        FROM (
          SELECT title, MAX(id) AS latest_id
          FROM tr_todo
          WHERE deleted_at IS NULL
            AND title LIKE ? ESCAPE '\\'
          GROUP BY title
        ) grouped
        ORDER BY latest_id DESC
        LIMIT ?
        `,
        [escaped, limit],
      )

      return (result.result.resultRows ?? []).map((row) => String(row[0]))
    },

    async export() {
      await exportDB()
    },

    async import() {
      await importDB()
      await this.init()
    },

    sortByDate(categoryId: number) {
      this.isSortedByDateAsc = !this.isSortedByDateAsc
      const sign = this.isSortedByDateAsc ? 1 : -1
      const categoryType = this.categoryTypeById(categoryId)

      this.currentTodo[categoryId]?.sort((a, b) => {
        if (categoryType === CATEGORY_TYPE.PLAIN) {
          if (a.createAt > b.createAt) return sign
          if (a.createAt < b.createAt) return -sign
          return a.title.localeCompare(b.title)
        }

        const aDate = a.doAt ?? todayDateKey()
        const bDate = b.doAt ?? todayDateKey()
        if (aDate > bDate) return sign
        if (aDate < bDate) return -sign
        return a.title.localeCompare(b.title)
      })
    },

    sortByTitle(categoryId: number) {
      this.isSortedByTitleAsc = !this.isSortedByTitleAsc
      const sign = this.isSortedByTitleAsc ? 1 : -1

      this.currentTodo[categoryId]?.sort((a, b) => {
        const compareTitle = a.title.localeCompare(b.title)
        if (compareTitle > 0) return sign
        if (compareTitle < 0) return -sign

        const aDate = a.doAt ?? a.createAt
        const bDate = b.doAt ?? b.createAt
        if (aDate > bDate) return sign
        if (aDate < bDate) return -sign
        return 0
      })
    },

    getMax(): number {
      let max = 0
      for (const category of this.listCategory) {
        const len = this.currentTodo[category.id]?.length ?? 0
        if (len > max) max = len
      }
      return max
    },
  },
})
