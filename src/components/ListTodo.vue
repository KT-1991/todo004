<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CATEGORY_TYPE } from '@/scripts/const'
import { toDateKey } from '@/scripts/utils'
import { useTodoStore, type TodoCategory, type TodoItem } from '@/stores/todo'

const todoStore = useTodoStore()

const openedDetails = ref<Record<number, boolean>>({})
const morphArmed = ref<Record<number, boolean>>({})
const morphReady = ref<Record<number, boolean>>({})
const morphShiftPx = ref<Record<number, number>>({})
const completingTodo = ref<Record<number, boolean>>({})
const morphCleanupPending = ref<Record<number, boolean>>({})
const timerIds: number[] = []
const MORPH_GUARD_MS = 420
const MORPH_CLEANUP_DELAY_MS = 500

const columnWidths = ref<Record<number, number>>({})
const MIN_COLUMN_WIDTH = 220
const DEFAULT_COLUMN_WIDTH = 300
const COLUMN_WIDTH_STORAGE_KEY = 'taskboard:list-column-widths:v1'
const FALLBACK_SPLITTER_WIDTH = 10
const listColumnsRef = ref<HTMLElement | null>(null)
const hasInitializedColumnWidths = ref(false)

const sortPanelOpen = ref(false)
const sortKey = ref<'date' | 'title'>('date')
const sortDirection = ref<'asc' | 'desc'>('asc')

const addFormOpened = ref<Record<number, boolean>>({})
const addTitleInput = ref<Record<number, string>>({})
const addDetailInput = ref<Record<number, string>>({})
const addDateInput = ref<Record<number, string>>({})
const addFormError = ref<Record<number, string>>({})
const titleSuggestionsByCategory = ref<Record<number, string[]>>({})
const MAX_TITLE_SUGGESTIONS = 10

type ResizeState = {
  categoryId: number
  startX: number
  startWidth: number
}

const resizeState = ref<ResizeState | null>(null)
const todayKey = computed(() => toDateKey(new Date()))

onMounted(async () => {
  if (todoStore.listCategory.length === 0) {
    await todoStore.init()
  }
  await syncColumnWidths()
})

onBeforeUnmount(() => {
  persistColumnWidths()
  clearTimers()
  endResize()
})

watch(
  () => todoStore.currentTodo,
  () => {
    const activeIds = new Set<number>()
    for (const category of todoStore.listCategory) {
      for (const todo of todoStore.currentTodo[category.id] ?? []) {
        activeIds.add(todo.id)
        clearPendingMorphCleanup(todo.id)
        if (!todo.completedAt) clearMorphState(todo.id)
        if (todo.completedAt) delete completingTodo.value[todo.id]
      }
    }

    for (const idText of Object.keys(morphArmed.value)) {
      const id = Number(idText)
      if (!activeIds.has(id)) scheduleMorphCleanup(id)
    }

    for (const idText of Object.keys(completingTodo.value)) {
      const id = Number(idText)
      if (!activeIds.has(id)) scheduleMorphCleanup(id)
    }
  },
  { deep: true },
)

const categories = computed(() => todoStore.listCategory)

watch(
  () => categories.value.map((category) => category.id).join(','),
  () => {
    void syncColumnWidths()
  },
)

function isDatedCategory(category: TodoCategory): boolean {
  return category.categoryType === CATEGORY_TYPE.DATED
}

function parseDateParts(dateKey: string): { year: number; month: number; day: number } | null {
  const [yearText, monthText, dayText] = dateKey.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  if (!year || !month || !day) return null
  return { year, month, day }
}

function weekdayIndex(dateKey: string): number | null {
  const parts = parseDateParts(dateKey)
  if (!parts) return null
  return new Date(parts.year, parts.month - 1, parts.day).getDay()
}

function formatDateLabel(dateKey: string): string {
  const parts = parseDateParts(dateKey)
  if (!parts) return dateKey

  const weekdays = ['日', '月', '火', '水', '木', '金', '土'] as const
  const weekday = weekdays[new Date(parts.year, parts.month - 1, parts.day).getDay()] ?? '?'
  const mm = String(parts.month).padStart(2, '0')
  const dd = String(parts.day).padStart(2, '0')
  return `${mm}-${dd} (${weekday})`
}

function dateToneClass(dateKey: string): Record<string, boolean> {
  const day = weekdayIndex(dateKey)
  return {
    is_saturday: day === 6,
    is_sunday: day === 0,
  }
}

function categoryTypeLabel(category: TodoCategory): string {
  return category.categoryType === CATEGORY_TYPE.DATED ? '日付あり' : '日付なし'
}

function columnWidth(categoryId: number): number {
  return columnWidths.value[categoryId] ?? DEFAULT_COLUMN_WIDTH
}

function isValidColumnWidth(width: unknown): width is number {
  return typeof width === 'number' && Number.isFinite(width) && width >= MIN_COLUMN_WIDTH
}

function loadPersistedColumnWidths(): Record<number, number> {
  try {
    const raw = window.localStorage.getItem(COLUMN_WIDTH_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}

    const restored: Record<number, number> = {}
    for (const [idText, widthLike] of Object.entries(parsed as Record<string, unknown>)) {
      const id = Number(idText)
      const width = Number(widthLike)
      if (!Number.isInteger(id) || !isValidColumnWidth(width)) continue
      restored[id] = Math.round(width)
    }
    return restored
  }
  catch {
    return {}
  }
}

function persistColumnWidths() {
  try {
    const payload: Record<string, number> = {}
    for (const category of categories.value) {
      const width = columnWidths.value[category.id]
      if (!isValidColumnWidth(width)) continue
      payload[String(category.id)] = Math.round(width)
    }
    window.localStorage.setItem(COLUMN_WIDTH_STORAGE_KEY, JSON.stringify(payload))
  }
  catch {
    // Ignore persistence errors (e.g. private mode or storage quota)
  }
}

function listColumnsInnerWidth(): number {
  const element = listColumnsRef.value
  if (!element) return 0

  const style = window.getComputedStyle(element)
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0
  const paddingRight = Number.parseFloat(style.paddingRight) || 0
  return Math.max(0, element.clientWidth - paddingLeft - paddingRight)
}

function splitterTotalWidth(categoryCount: number): number {
  const element = listColumnsRef.value
  if (!element) return categoryCount * FALLBACK_SPLITTER_WIDTH

  const splitters = Array.from(element.querySelectorAll<HTMLElement>('.column_splitter'))
  if (splitters.length === 0) return categoryCount * FALLBACK_SPLITTER_WIDTH
  return splitters.reduce((sum, splitter) => sum + splitter.offsetWidth, 0)
}

function flexGapWidth(): number {
  const element = listColumnsRef.value
  if (!element) return 0

  const style = window.getComputedStyle(element)
  const gapText = style.columnGap && style.columnGap !== 'normal' ? style.columnGap : style.gap
  const gap = Number.parseFloat(gapText)
  return Number.isFinite(gap) ? gap : 0
}

function autoColumnWidths(categoryIds: number[]): Record<number, number> {
  const count = categoryIds.length
  if (count === 0) return {}

  const totalInnerWidth = listColumnsInnerWidth()
  const splitterWidth = splitterTotalWidth(count)
  const gapWidth = flexGapWidth()
  const totalItemCount = count * 2
  const totalGapWidth = Math.max(0, totalItemCount - 1) * gapWidth
  const availableWidth = Math.max(0, totalInnerWidth - splitterWidth - totalGapWidth)
  const minTotalWidth = MIN_COLUMN_WIDTH * count

  const nextWidths: Record<number, number> = {}
  if (availableWidth <= minTotalWidth) {
    for (const id of categoryIds) nextWidths[id] = MIN_COLUMN_WIDTH
    return nextWidths
  }

  const baseWidth = Math.floor(availableWidth / count)
  let remainder = Math.round(availableWidth - baseWidth * count)
  for (const id of categoryIds) {
    const width = baseWidth + (remainder > 0 ? 1 : 0)
    nextWidths[id] = Math.max(MIN_COLUMN_WIDTH, width)
    if (remainder > 0) remainder -= 1
  }
  return nextWidths
}

async function syncColumnWidths() {
  const categoryIds = categories.value.map((category) => category.id)
  if (categoryIds.length === 0) {
    columnWidths.value = {}
    hasInitializedColumnWidths.value = true
    persistColumnWidths()
    return
  }

  await nextTick()
  await waitNextFrame()

  if (!hasInitializedColumnWidths.value) {
    const restored = loadPersistedColumnWidths()
    const auto = autoColumnWidths(categoryIds)
    const merged: Record<number, number> = {}
    let hasRestored = false

    for (const id of categoryIds) {
      const width = restored[id]
      if (isValidColumnWidth(width)) {
        merged[id] = Math.round(width)
        hasRestored = true
      }
      else {
        merged[id] = auto[id] ?? DEFAULT_COLUMN_WIDTH
      }
    }

    columnWidths.value = merged
    hasInitializedColumnWidths.value = true
    if (!hasRestored) persistColumnWidths()
    return
  }

  const auto = autoColumnWidths(categoryIds)
  const nextWidths: Record<number, number> = {}
  let changed = Object.keys(columnWidths.value).length !== categoryIds.length

  for (const id of categoryIds) {
    const width = columnWidths.value[id]
    if (isValidColumnWidth(width)) {
      nextWidths[id] = Math.round(width)
    }
    else {
      nextWidths[id] = auto[id] ?? DEFAULT_COLUMN_WIDTH
      changed = true
    }
  }

  if (changed) {
    columnWidths.value = nextWidths
    persistColumnWidths()
  }
}

function categoryAccent(index: number): string {
  const accents = ['#4f46e5', '#0f766e', '#0369a1', '#b45309', '#6d28d9', '#166534']
  return accents[index % accents.length] ?? '#4f46e5'
}

function listItems(categoryId: number): TodoItem[] {
  const items = [...(todoStore.currentTodo[categoryId] ?? [])]
  const category = categories.value.find((item) => item.id === categoryId)
  const effectiveSortKey =
    sortKey.value === 'date' && category?.categoryType === CATEGORY_TYPE.DATED ? 'date' : 'title'

  return items.sort((a, b) => {
    if (effectiveSortKey === 'title') {
      const titleOrder = a.title.localeCompare(b.title, 'ja')
      if (titleOrder !== 0) {
        return sortDirection.value === 'asc' ? titleOrder : -titleOrder
      }

      const fallback = (a.doAt ?? a.createAt).localeCompare(b.doAt ?? b.createAt)
      return sortDirection.value === 'asc' ? fallback : -fallback
    }

    const dateOrder = (a.doAt ?? '').localeCompare(b.doAt ?? '')
    if (dateOrder !== 0) {
      return sortDirection.value === 'asc' ? dateOrder : -dateOrder
    }

    const titleOrder = a.title.localeCompare(b.title, 'ja')
    return sortDirection.value === 'asc' ? titleOrder : -titleOrder
  })
}

function isOpen(todoId: number): boolean {
  return !!openedDetails.value[todoId]
}

function toggleDetailsRaw(todoId: number) {
  openedDetails.value[todoId] = !openedDetails.value[todoId]
}

function isArmed(todoId: number): boolean {
  return !!morphArmed.value[todoId]
}

function isDeleteReady(todoId: number): boolean {
  return !!morphReady.value[todoId]
}

function isCompleting(todoId: number): boolean {
  return !!completingTodo.value[todoId]
}

function isVisuallyCompleted(todo: TodoItem): boolean {
  return !!todo.completedAt || isCompleting(todo.id)
}

function morphShift(todoId: number): number {
  return morphShiftPx.value[todoId] ?? 0
}

function runLater(callback: () => void, delay: number): number {
  const id = window.setTimeout(callback, delay)
  timerIds.push(id)
  return id
}

function clearTimers() {
  while (timerIds.length > 0) {
    const id = timerIds.pop()
    if (id !== undefined) window.clearTimeout(id)
  }
}

function clearMorphState(todoId: number) {
  delete morphArmed.value[todoId]
  delete morphReady.value[todoId]
  delete morphShiftPx.value[todoId]
}

function hasTodoById(todoId: number): boolean {
  return findTodoById(todoId) !== undefined
}

function clearPendingMorphCleanup(todoId: number) {
  delete morphCleanupPending.value[todoId]
}

function scheduleMorphCleanup(todoId: number) {
  if (morphCleanupPending.value[todoId]) return
  morphCleanupPending.value[todoId] = true
  runLater(() => {
    if (!morphCleanupPending.value[todoId]) return
    delete morphCleanupPending.value[todoId]
    if (hasTodoById(todoId)) return
    clearMorphState(todoId)
    delete completingTodo.value[todoId]
  }, MORPH_CLEANUP_DELAY_MS)
}

function waitNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    runLater(resolve, ms)
  })
}

function findTodoById(todoId: number): TodoItem | undefined {
  for (const category of categories.value) {
    const found = (todoStore.currentTodo[category.id] ?? []).find((todo) => todo.id === todoId)
    if (found) return found
  }
  return undefined
}

function onCardSurface(todoId: number) {
  const todo = findTodoById(todoId)
  if (!todo) return
  if (isCompleting(todoId)) return

  if (todo.completedAt && isArmed(todoId)) {
    clearMorphState(todoId)
    void todoStore.completeTodo(todoId)
    return
  }

  toggleDetailsRaw(todoId)
}

function todoCardClass(todo: TodoItem): Record<string, boolean> {
  return {
    is_completed: isVisuallyCompleted(todo),
    is_today_due: todo.doAt === todayKey.value,
  }
}

function morphSymbol(todo: TodoItem): string {
  const completed = isVisuallyCompleted(todo)
  return completed && isArmed(todo.id) ? '×' : '○'
}

async function onMorphAction(todo: TodoItem, event: Event) {
  if (isCompleting(todo.id)) return

  if (!todo.completedAt) {
    const button = event.currentTarget as HTMLElement | null
    const row = button?.closest('.title_row') as HTMLElement | null
    const rowWidth = row?.clientWidth ?? 0
    const buttonWidth = button?.offsetWidth ?? 20

    morphShiftPx.value[todo.id] = Math.max(0, rowWidth - buttonWidth)
    morphArmed.value[todo.id] = true
    morphReady.value[todo.id] = false
    completingTodo.value[todo.id] = true

    try {
      await waitNextFrame()
      await waitMs(MORPH_GUARD_MS)
      await todoStore.completeTodo(todo.id)
      if (isArmed(todo.id)) morphReady.value[todo.id] = true
    }
    catch {
      clearMorphState(todo.id)
    }
    finally {
      delete completingTodo.value[todo.id]
    }
    return
  }

  if (!isArmed(todo.id)) {
    const button = event.currentTarget as HTMLElement | null
    const row = button?.closest('.title_row') as HTMLElement | null
    const rowWidth = row?.clientWidth ?? 0
    const buttonWidth = button?.offsetWidth ?? 20

    morphShiftPx.value[todo.id] = Math.max(0, rowWidth - buttonWidth)
    morphArmed.value[todo.id] = true
    morphReady.value[todo.id] = true
    return
  }

  if (!isDeleteReady(todo.id)) return

  await todoStore.deleteTodo(todo.id)
  clearMorphState(todo.id)
  delete completingTodo.value[todo.id]
}

function sortBadgeText(): string {
  const keyLabel = sortKey.value === 'date' ? '予定日' : 'タイトル'
  const directionLabel = sortDirection.value === 'asc' ? '↑' : '↓'
  return `${keyLabel} ${directionLabel}`
}

function closeSortPanel() {
  sortPanelOpen.value = false
}

function toggleSortPanel() {
  sortPanelOpen.value = !sortPanelOpen.value
}

function setSortKey(value: 'date' | 'title') {
  sortKey.value = value
}

function setSortDirection(value: 'asc' | 'desc') {
  sortDirection.value = value
}

function isAddFormOpen(categoryId: number): boolean {
  return !!addFormOpened.value[categoryId]
}

function titleDatalistId(categoryId: number): string {
  return `title-history-${categoryId}`
}

function openAddForm(category: TodoCategory) {
  addFormOpened.value[category.id] = true
  addFormError.value[category.id] = ''
  if (isDatedCategory(category) && !(addDateInput.value[category.id] ?? '').trim()) {
    addDateInput.value[category.id] = todayKey.value
  }
}

function closeAddForm(categoryId: number) {
  addFormOpened.value[categoryId] = false
  addFormError.value[categoryId] = ''
}

function toggleAddForm(category: TodoCategory) {
  if (isAddFormOpen(category.id)) {
    closeAddForm(category.id)
    return
  }
  openAddForm(category)
}

function titleSuggestions(categoryId: number): string[] {
  return titleSuggestionsByCategory.value[categoryId] ?? []
}

async function updateTitleSuggestions(categoryId: number) {
  const keyword = (addTitleInput.value[categoryId] ?? '').trim()
  if (!keyword) {
    titleSuggestionsByCategory.value[categoryId] = []
    return
  }

  const suggestions = await todoStore.fetchTitleSuggestions(keyword, MAX_TITLE_SUGGESTIONS)
  titleSuggestionsByCategory.value[categoryId] = suggestions
}

async function submitAddForm(category: TodoCategory) {
  const title = (addTitleInput.value[category.id] ?? '').trim()
  const detail = (addDetailInput.value[category.id] ?? '').trim()
  const doAtRaw = (addDateInput.value[category.id] ?? '').trim()
  const doAt = isDatedCategory(category) ? doAtRaw || null : null

  addFormError.value[category.id] = ''
  if (!title) {
    addFormError.value[category.id] = 'タイトルは必須です。'
    return
  }
  if (isDatedCategory(category) && !doAt) {
    addFormError.value[category.id] = '日付ありカテゴリでは予定日が必須です。'
    return
  }

  try {
    await todoStore.addTodo(category.id, title, detail, doAt)
    addTitleInput.value[category.id] = ''
    addDetailInput.value[category.id] = ''
    titleSuggestionsByCategory.value[category.id] = []
    if (isDatedCategory(category)) {
      addDateInput.value[category.id] = todayKey.value
    }
  }
  catch (error) {
    addFormError.value[category.id] = error instanceof Error ? error.message : '追加に失敗しました。'
  }
}

function onAddFormKeydown(category: TodoCategory, event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeAddForm(category.id)
  }
  if (event.key === 'Enter' && event.ctrlKey) {
    event.preventDefault()
    void submitAddForm(category)
  }
}

function onResizePointerMove(event: PointerEvent) {
  const state = resizeState.value
  if (!state) return

  const delta = event.clientX - state.startX
  columnWidths.value[state.categoryId] = Math.max(MIN_COLUMN_WIDTH, state.startWidth + delta)
}

function endResize() {
  const wasResizing = resizeState.value !== null
  resizeState.value = null
  window.removeEventListener('pointermove', onResizePointerMove)
  window.removeEventListener('pointerup', endResize)
  window.removeEventListener('pointercancel', endResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  if (wasResizing) persistColumnWidths()
}

function startResize(categoryId: number, event: PointerEvent) {
  resizeState.value = {
    categoryId,
    startX: event.clientX,
    startWidth: columnWidth(categoryId),
  }

  window.addEventListener('pointermove', onResizePointerMove)
  window.addEventListener('pointerup', endResize)
  window.addEventListener('pointercancel', endResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}
</script>

<template>
  <section class="board_shell">
    <div class="board_tools">
      <div class="sort_box">
        <button class="sort_toggle_btn" type="button" @click="toggleSortPanel">並び替え</button>
        <span class="sort_badge">{{ sortBadgeText() }}</span>

        <div v-if="sortPanelOpen" class="sort_panel">
          <div class="sort_group">
            <p>キー</p>
            <div class="sort_options">
              <button
                class="sort_option_btn"
                :class="{ active: sortKey === 'date' }"
                type="button"
                @click="setSortKey('date')"
              >
                予定日
              </button>
              <button
                class="sort_option_btn"
                :class="{ active: sortKey === 'title' }"
                type="button"
                @click="setSortKey('title')"
              >
                タイトル
              </button>
            </div>
          </div>

          <div class="sort_group">
            <p>順序</p>
            <div class="sort_options">
              <button
                class="sort_option_btn"
                :class="{ active: sortDirection === 'asc' }"
                type="button"
                @click="setSortDirection('asc')"
              >
                昇順
              </button>
              <button
                class="sort_option_btn"
                :class="{ active: sortDirection === 'desc' }"
                type="button"
                @click="setSortDirection('desc')"
              >
                降順
              </button>
            </div>
          </div>

          <p class="sort_note">日付なしカテゴリはタイトル順で並びます。</p>
          <button class="sort_close_btn" type="button" @click="closeSortPanel">閉じる</button>
        </div>
      </div>
    </div>

    <div ref="listColumnsRef" class="list_columns">
      <template v-for="(category, index) in categories" :key="category.id">
        <article
          class="category_column"
          :style="{ '--accent': categoryAccent(index), width: `${columnWidth(category.id)}px` }"
        >
          <header class="column_header">
            <h3>{{ category.name }}</h3>
            <div class="header_actions">
              <button
                class="add_toggle_btn"
                type="button"
                :title="isAddFormOpen(category.id) ? '入力欄を閉じる' : 'タスクを追加する'"
                @click="toggleAddForm(category)"
              >
                {{ isAddFormOpen(category.id) ? '−' : '+' }}
              </button>
              <span class="type_chip">{{ categoryTypeLabel(category) }}</span>
            </div>
          </header>

          <div class="column_body">
            <form
              v-if="isAddFormOpen(category.id)"
              class="add_form"
              @submit.prevent="submitAddForm(category)"
              @keydown="onAddFormKeydown(category, $event)"
            >
              <label class="add_field">
                <span>タイトル</span>
                <input
                  v-model="addTitleInput[category.id]"
                  class="add_input"
                  type="text"
                  :list="titleDatalistId(category.id)"
                  placeholder="タスク名を入力"
                  autocomplete="off"
                  required
                  @input="updateTitleSuggestions(category.id)"
                />
                <datalist :id="titleDatalistId(category.id)">
                  <option
                    v-for="titleOption in titleSuggestions(category.id)"
                    :key="`hint-${category.id}-${titleOption}`"
                    :value="titleOption"
                  />
                </datalist>
              </label>

              <label class="add_field">
                <span>詳細</span>
                <textarea
                  v-model="addDetailInput[category.id]"
                  class="add_detail"
                  rows="2"
                  placeholder="詳細を入力（任意）"
                />
              </label>

              <label v-if="isDatedCategory(category)" class="add_field">
                <span>予定日</span>
                <input
                  v-model="addDateInput[category.id]"
                  class="add_date"
                  type="date"
                  required
                />
              </label>

              <p v-if="addFormError[category.id]" class="add_error">{{ addFormError[category.id] }}</p>

              <div class="add_actions">
                <button class="add_submit" type="submit">追加</button>
                <button class="add_cancel" type="button" @click="closeAddForm(category.id)">閉じる</button>
              </div>
            </form>

            <TransitionGroup name="todo-collapse" tag="div" class="todo_list">
              <div
                v-for="todo in listItems(category.id)"
                :key="todo.id"
                class="todo_card"
                :class="todoCardClass(todo)"
                tabindex="0"
                :aria-expanded="isOpen(todo.id) ? 'true' : 'false'"
                @click="onCardSurface(todo.id)"
                @keydown.enter.prevent="onCardSurface(todo.id)"
                @keydown.space.prevent="onCardSurface(todo.id)"
              >
                <div
                  class="title_row"
                  :class="{ armed: isArmed(todo.id), ready: isDeleteReady(todo.id) }"
                  :style="{ '--morph-shift-px': `${morphShift(todo.id)}px` }"
                >
                  <button
                    class="inline_btn morph_btn"
                    :class="{ armed: isArmed(todo.id), ready: isDeleteReady(todo.id) }"
                    :title="isArmed(todo.id) ? (isDeleteReady(todo.id) ? '削除する' : '削除準備中') : '完了にする'"
                    @click.stop="onMorphAction(todo, $event)"
                  >
                    {{ morphSymbol(todo) }}
                  </button>

                  <div class="morph_body">
                    <span
                      v-if="isDatedCategory(category) && todo.doAt"
                      class="date_chip"
                      :class="dateToneClass(todo.doAt)"
                    >
                      {{ formatDateLabel(todo.doAt) }}
                    </span>

                    <span class="title_wrap">
                      <span class="title_text">{{ todo.title }}</span>
                      <span class="strike_line" />
                    </span>
                  </div>
                </div>

                <Transition name="detail-soft">
                  <p v-if="isOpen(todo.id)" class="detail_text">{{ todo.detail }}</p>
                </Transition>
              </div>

              <p v-if="listItems(category.id).length === 0" :key="`empty-${category.id}`" class="empty">タスクがありません</p>
            </TransitionGroup>
          </div>
        </article>

        <div
          class="column_splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="列幅を調整"
          @pointerdown.prevent="startResize(category.id, $event)"
        />
      </template>
    </div>
  </section>
</template>

<style scoped>
.board_shell {
  overflow: hidden;
  height: 100%;
  min-height: 0;
  margin: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  display: flex;
  flex-direction: column;
}

.board_tools {
  padding: 4px 4px 0;
  display: flex;
  justify-content: flex-end;
}

.sort_box {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.sort_toggle_btn {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-surface);
  color: var(--ui-text);
  font-size: 12px;
  padding: 5px 10px;
  cursor: pointer;
}

.sort_badge {
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  background: var(--ui-surface);
  color: var(--ui-muted);
  font-size: 11px;
  padding: 3px 8px;
}

.sort_panel {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 20;
  width: 220px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius, 10px);
  background: var(--ui-surface);
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.08);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sort_group p {
  margin: 0 0 4px;
  font-size: 10px;
  color: var(--ui-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.sort_options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.sort_option_btn {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-surface);
  color: var(--ui-text);
  font-size: 12px;
  padding: 5px 7px;
  cursor: pointer;
}

.sort_option_btn.active {
  border-color: #94a3b8;
  background: var(--ui-accent-soft);
  color: var(--ui-text);
  font-weight: 700;
}

.sort_note {
  margin: 0;
  font-size: 11px;
  color: var(--ui-muted);
}

.sort_close_btn {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-surface);
  color: var(--ui-text);
  font-size: 11px;
  padding: 5px 8px;
  cursor: pointer;
  align-self: flex-end;
}

.list_columns {
  display: flex;
  gap: 8px;
  align-items: stretch;
  overflow-x: auto;
  overflow-y: hidden;
  height: 100%;
  min-height: 0;
  padding: 4px;
}

.category_column {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius, 10px);
  background: var(--ui-surface);
  flex: 0 0 auto;
  min-width: 220px;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.column_header {
  padding: 8px 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--ui-text);
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-accent-soft);
  background: color-mix(in srgb, var(--accent) 22%, var(--ui-accent-soft));
}

.column_header h3 {
  margin: 0;
  font-size: 14px;
}

.header_actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.add_toggle_btn {
  border: 1px solid var(--ui-border);
  border-radius: 7px;
  width: 22px;
  height: 22px;
  background: var(--ui-surface);
  color: var(--ui-text);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.type_chip {
  display: none;
}

.column_body {
  padding: 7px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--ui-surface);
}

.add_form {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-surface-muted);
  padding: 7px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.add_field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.add_field span {
  font-size: 10px;
  color: var(--ui-muted);
  letter-spacing: 0.02em;
}

.add_input,
.add_detail,
.add_date {
  width: 100%;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  background: var(--ui-surface);
  color: var(--ui-text);
  padding: 6px 7px;
  font-size: 12px;
}

.add_input:focus,
.add_detail:focus,
.add_date:focus {
  outline: 2px solid #93c5fd;
  outline-offset: 1px;
}

.add_detail {
  min-height: 54px;
  resize: vertical;
}

.add_error {
  margin: 0;
  color: #b91c1c;
  font-size: 11px;
}

.add_actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.add_submit,
.add_cancel {
  border: 1px solid var(--ui-border);
  border-radius: 7px;
  background: var(--ui-surface);
  color: var(--ui-text);
  font-size: 11px;
  padding: 5px 9px;
  cursor: pointer;
}

.add_submit {
  border-color: #94a3b8;
  background: var(--ui-accent-soft);
  color: var(--ui-text);
  font-weight: 700;
}

.todo_list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}

.todo_card {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 6px;
  background: var(--ui-surface);
  overflow: hidden;
  max-height: 320px;
  transform-origin: top center;
  transition: border-color 0.2s ease, background-color 0.2s ease;
  cursor: pointer;
}

.todo_card:hover {
  border-color: color-mix(in srgb, var(--ui-border) 70%, #94a3b8);
}

.todo_card:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}

.is_today_due {
  border-color: #5b9bff;
  background: #dbeafe;
}

.is_today_due .title_text {
  color: #1e3a8a;
}

.title_row {
  --morph-sync-duration: 0.34s;
  --morph-sync-ease: cubic-bezier(0.22, 1, 0.36, 1);
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  min-height: 20px;
}

.morph_body {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  padding-left: 26px;
  padding-right: 26px;
}

.date_chip {
  font-size: 10px;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  padding: 1px 6px;
  background: var(--ui-surface-muted);
  color: var(--ui-muted);
  flex-shrink: 0;
  white-space: nowrap;
}

.date_chip.is_saturday {
  color: #1d4ed8;
  background: #eef4ff;
  border-color: #bfd4ff;
}

.date_chip.is_sunday {
  color: #b91c1c;
  background: #fff1f1;
  border-color: #fecaca;
}

.title_wrap {
  position: relative;
  flex: 1;
  min-width: 0;
}

.title_text {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 700;
  color: var(--ui-text);
  transition: color 0.22s ease;
}

.strike_line {
  position: absolute;
  left: 0;
  top: 50%;
  width: 100%;
  height: 2px;
  background: #64748b;
  opacity: 0.14;
  transform: translateY(-50%) scaleX(0);
  transform-origin: left center;
  transition:
    transform var(--morph-sync-duration) var(--morph-sync-ease),
    opacity 0.2s ease;
  transition-delay: 0.03s, 0s;
}

.inline_btn {
  border: 1px solid var(--ui-border);
  border-radius: 7px;
  background: var(--ui-surface);
  color: var(--ui-text);
  font-size: 12px;
  line-height: 1;
  width: 20px;
  height: 20px;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
}

.morph_btn {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translate(var(--morph-shift-px, 0px), -50%);
  transition:
    transform var(--morph-sync-duration) var(--morph-sync-ease),
    border-color 0.16s ease,
    background-color 0.16s ease,
    color 0.16s ease,
    opacity 0.16s ease;
  z-index: 1;
}

.title_row.armed .morph_btn:not(.ready) {
  opacity: 0.62;
}

.morph_btn.armed {
  border-color: #fca5a5;
  color: #b91c1c;
}

.morph_btn.ready {
  background: #fff7f7;
}

.detail_text {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--ui-muted);
  white-space: pre-wrap;
}

.is_completed {
  border-color: color-mix(in srgb, #16a34a 28%, var(--ui-border));
  background: color-mix(in srgb, #ecfdf5 38%, #ffffff);
}

.is_completed .title_text {
  color: #4b5563;
}

.is_completed .strike_line {
  opacity: 0.65;
  transform: translateY(-50%) scaleX(1);
}

.empty {
  color: var(--ui-muted);
  font-size: 12px;
  text-align: center;
}

.column_splitter {
  width: 10px;
  min-width: 10px;
  cursor: col-resize;
  position: relative;
  border-radius: 6px;
  touch-action: none;
}

.column_splitter::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 6px;
  bottom: 6px;
  width: 2px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-border) 70%, #94a3b8);
}

.todo-collapse-enter-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.todo-collapse-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.todo-collapse-leave-active {
  transition:
    max-height 0.3s ease,
    opacity 0.24s ease,
    transform 0.24s ease,
    margin 0.24s ease,
    padding 0.24s ease,
    border-width 0.24s ease;
  overflow: hidden;
}

.todo-collapse-leave-from {
  max-height: 320px;
  opacity: 1;
  transform: scaleY(1);
}

.todo-collapse-leave-to {
  max-height: 0;
  opacity: 0;
  transform: scaleY(0.9);
  margin-top: 0;
  margin-bottom: 0;
  padding-top: 0;
  padding-bottom: 0;
  border-width: 0;
}

.detail-soft-enter-active,
.detail-soft-leave-active {
  transition: transform 0.22s ease, opacity 0.2s ease, filter 0.22s ease;
  transform-origin: top center;
}

.detail-soft-enter-from,
.detail-soft-leave-to {
  opacity: 0;
  transform: scale(0.96);
  filter: blur(2px);
}
</style>

