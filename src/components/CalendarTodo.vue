<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CATEGORY_TYPE } from '@/scripts/const'
import { useTodoStore, type TodoItem } from '@/stores/todo'
import { toDateKey } from '@/scripts/utils'

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
const todayKey = computed(() => toDateKey(new Date()))

const categoryWidths = ref<Record<number, number>>({})
const dateColumnWidth = ref(140)
const MIN_DATE_COLUMN_WIDTH = 120
const MIN_CATEGORY_COLUMN_WIDTH = 180
const DEFAULT_CATEGORY_COLUMN_WIDTH = 240
const CALENDAR_WIDTH_STORAGE_KEY = 'taskboard:calendar-column-widths:v1'
const hasInitializedCalendarWidths = ref(false)

type ResizeTarget = { kind: 'date' } | { kind: 'category'; categoryId: number }

type ResizeState = {
  target: ResizeTarget
  startX: number
  startWidth: number
}

const resizeState = ref<ResizeState | null>(null)

onMounted(async () => {
  if (todoStore.listCategory.length === 0) {
    await todoStore.init()
  }
  syncCalendarWidths()
})

onBeforeUnmount(() => {
  persistCalendarWidths()
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

const datedCategories = computed(() =>
  todoStore.listCategory.filter((category) => category.categoryType === CATEGORY_TYPE.DATED),
)

watch(
  () => datedCategories.value.map((category) => category.id).join(','),
  () => {
    syncCalendarWidths()
  },
)

function isValidDateColumnWidth(width: unknown): width is number {
  return typeof width === 'number' && Number.isFinite(width) && width >= MIN_DATE_COLUMN_WIDTH
}

function isValidCategoryColumnWidth(width: unknown): width is number {
  return typeof width === 'number' && Number.isFinite(width) && width >= MIN_CATEGORY_COLUMN_WIDTH
}

type PersistedCalendarWidths = {
  dateWidth?: number
  categoryWidths?: Record<string, unknown>
}

function loadPersistedCalendarWidths(): { dateWidth?: number; categoryWidths: Record<number, number> } {
  try {
    const raw = window.localStorage.getItem(CALENDAR_WIDTH_STORAGE_KEY)
    if (!raw) return { categoryWidths: {} }

    const parsed = JSON.parse(raw) as PersistedCalendarWidths
    if (!parsed || typeof parsed !== 'object') return { categoryWidths: {} }

    const restoredCategoryWidths: Record<number, number> = {}
    const categoryWidthsLike = parsed.categoryWidths
    if (categoryWidthsLike && typeof categoryWidthsLike === 'object') {
      for (const [idText, widthLike] of Object.entries(categoryWidthsLike)) {
        const id = Number(idText)
        const width = Number(widthLike)
        if (!Number.isInteger(id) || !isValidCategoryColumnWidth(width)) continue
        restoredCategoryWidths[id] = Math.round(width)
      }
    }

    const dateWidth = Number(parsed.dateWidth)
    return {
      dateWidth: isValidDateColumnWidth(dateWidth) ? Math.round(dateWidth) : undefined,
      categoryWidths: restoredCategoryWidths,
    }
  }
  catch {
    return { categoryWidths: {} }
  }
}

function persistCalendarWidths() {
  try {
    const payload: { dateWidth: number; categoryWidths: Record<string, number> } = {
      dateWidth: Math.round(dateColumnWidth.value),
      categoryWidths: {},
    }

    for (const category of datedCategories.value) {
      const width = categoryWidths.value[category.id]
      if (!isValidCategoryColumnWidth(width)) continue
      payload.categoryWidths[String(category.id)] = Math.round(width)
    }

    window.localStorage.setItem(CALENDAR_WIDTH_STORAGE_KEY, JSON.stringify(payload))
  }
  catch {
    // Ignore persistence errors (e.g. private mode or storage quota)
  }
}

function syncCalendarWidths() {
  const categoryIds = datedCategories.value.map((category) => category.id)

  if (!hasInitializedCalendarWidths.value) {
    const restored = loadPersistedCalendarWidths()
    if (isValidDateColumnWidth(restored.dateWidth)) {
      dateColumnWidth.value = restored.dateWidth
    }

    const merged: Record<number, number> = {}
    let hasRestoredCategoryWidth = false
    for (const id of categoryIds) {
      const restoredWidth = restored.categoryWidths[id]
      if (isValidCategoryColumnWidth(restoredWidth)) {
        merged[id] = restoredWidth
        hasRestoredCategoryWidth = true
      }
      else {
        merged[id] = DEFAULT_CATEGORY_COLUMN_WIDTH
      }
    }

    categoryWidths.value = merged
    hasInitializedCalendarWidths.value = true
    if (!hasRestoredCategoryWidth) persistCalendarWidths()
    return
  }

  const nextWidths: Record<number, number> = {}
  let changed = Object.keys(categoryWidths.value).length !== categoryIds.length
  for (const id of categoryIds) {
    const width = categoryWidths.value[id]
    if (isValidCategoryColumnWidth(width)) {
      nextWidths[id] = Math.round(width)
    }
    else {
      nextWidths[id] = DEFAULT_CATEGORY_COLUMN_WIDTH
      changed = true
    }
  }

  if (changed) {
    categoryWidths.value = nextWidths
    persistCalendarWidths()
  }
}

function showDate(dateText: string): string {
  const [yearText, monthText, dayText] = dateText.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  if (!year || !month || !day) return dateText

  const date = new Date(year, month - 1, day)
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'] as const
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${mm}-${dd} (${weekdays[date.getDay()] ?? '?'})`
}

function holidayClass(dateText: string): string {
  const day = new Date(`${dateText}T00:00:00`).getDay()
  if (day === 0) return 'sunday'
  if (day === 6) return 'saturday'
  return ''
}

function categoryAccent(index: number): string {
  const accents = ['#4f46e5', '#0f766e', '#0369a1', '#b45309', '#6d28d9', '#166534']
  return accents[index % accents.length] ?? '#4f46e5'
}

function todosOn(date: string, categoryId: number): TodoItem[] {
  return todoStore.calendarTodo[date]?.[categoryId] ?? []
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
  for (const category of todoStore.listCategory) {
    if ((todoStore.currentTodo[category.id] ?? []).some((todo) => todo.id === todoId)) {
      return true
    }
  }
  return false
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

function onCardSurface(todo: TodoItem) {
  if (isCompleting(todo.id)) return

  if (todo.completedAt && isArmed(todo.id)) {
    clearMorphState(todo.id)
    void todoStore.completeTodo(todo.id)
    return
  }

  toggleDetailsRaw(todo.id)
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

function dateWidth(): number {
  return dateColumnWidth.value
}

function categoryWidth(categoryId: number): number {
  return categoryWidths.value[categoryId] ?? DEFAULT_CATEGORY_COLUMN_WIDTH
}

function onResizePointerMove(event: PointerEvent) {
  const state = resizeState.value
  if (!state) return

  const delta = event.clientX - state.startX
  const nextWidth = state.startWidth + delta

  if (state.target.kind === 'date') {
    dateColumnWidth.value = Math.max(MIN_DATE_COLUMN_WIDTH, nextWidth)
    return
  }

  categoryWidths.value[state.target.categoryId] = Math.max(MIN_CATEGORY_COLUMN_WIDTH, nextWidth)
}

function endResize() {
  const wasResizing = resizeState.value !== null
  resizeState.value = null
  window.removeEventListener('pointermove', onResizePointerMove)
  window.removeEventListener('pointerup', endResize)
  window.removeEventListener('pointercancel', endResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  if (wasResizing) persistCalendarWidths()
}

function startResize(target: ResizeTarget, startWidth: number, event: PointerEvent) {
  resizeState.value = {
    target,
    startX: event.clientX,
    startWidth,
  }

  window.addEventListener('pointermove', onResizePointerMove)
  window.addEventListener('pointerup', endResize)
  window.addEventListener('pointercancel', endResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function startDateResize(event: PointerEvent) {
  startResize({ kind: 'date' }, dateWidth(), event)
}

function startCategoryResize(categoryId: number, event: PointerEvent) {
  startResize({ kind: 'category', categoryId }, categoryWidth(categoryId), event)
}
</script>

<template>
  <section class="board_shell">
    <div class="calendar_wrap">
      <table class="calendar_table">
        <colgroup>
          <col :style="{ width: `${dateWidth()}px` }" />
          <col v-for="category in datedCategories" :key="`col-${category.id}`" :style="{ width: `${categoryWidth(category.id)}px` }" />
        </colgroup>

        <thead>
          <tr>
            <th class="date_col_head" :style="{ width: `${dateWidth()}px` }">
              <div class="th_inner">
                <span>日付</span>
                <button
                  class="th_resizer"
                  title="列幅を調整"
                  aria-label="日付列の幅を調整"
                  @pointerdown.prevent="startDateResize($event)"
                />
              </div>
            </th>

            <th
              v-for="(category, index) in datedCategories"
              :key="category.id"
              class="cat_head"
              :style="{ '--accent': categoryAccent(index), width: `${categoryWidth(category.id)}px` }"
            >
              <div class="th_inner">
                <span>{{ category.name }}</span>
                <button
                  class="th_resizer"
                  title="列幅を調整"
                  :aria-label="`${category.name} 列の幅を調整`"
                  @pointerdown.prevent="startCategoryResize(category.id, $event)"
                />
              </div>
            </th>
          </tr>
        </thead>

        <tbody>
          <tr v-for="date in todoStore.dateSpan" :key="date">
            <td class="date_head" :class="holidayClass(date)">{{ showDate(date) }}</td>
            <td v-for="category in datedCategories" :key="`${date}-${category.id}`">
              <TransitionGroup name="todo-collapse" tag="div" class="cell_stack">
                <div
                  v-for="item in todosOn(date, category.id)"
                  :key="item.id"
                  class="mini_card"
                  :class="todoCardClass(item)"
                  tabindex="0"
                  :aria-expanded="isOpen(item.id) ? 'true' : 'false'"
                  @click="onCardSurface(item)"
                  @keydown.enter.prevent="onCardSurface(item)"
                  @keydown.space.prevent="onCardSurface(item)"
                >
                  <div
                    class="title_row"
                    :class="{ armed: isArmed(item.id), ready: isDeleteReady(item.id) }"
                    :style="{ '--morph-shift-px': `${morphShift(item.id)}px` }"
                  >
                    <button
                      class="inline_btn morph_btn"
                      :class="{ armed: isArmed(item.id), ready: isDeleteReady(item.id) }"
                      :title="isArmed(item.id) ? (isDeleteReady(item.id) ? '削除する' : '削除準備中') : '完了にする'"
                      @click.stop="onMorphAction(item, $event)"
                    >
                      {{ morphSymbol(item) }}
                    </button>

                    <div class="morph_body">
                      <span class="title_wrap">
                        <span class="title_text">{{ item.title }}</span>
                        <span class="strike_line" />
                      </span>
                    </div>
                  </div>

                  <Transition name="detail-soft">
                    <p v-if="isOpen(item.id)" class="detail_text">{{ item.detail }}</p>
                  </Transition>
                </div>
              </TransitionGroup>
            </td>
          </tr>

          <tr v-if="todoStore.dateSpan.length === 0">
            <td class="empty" :colspan="Math.max(1, datedCategories.length + 1)">No dated todos.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.board_shell {
  height: 100%;
  min-height: 0;
  margin: 0;
  border: none;
  border-radius: 0;
  overflow: hidden;
  background: transparent;
  display: flex;
  flex-direction: column;
}

.calendar_wrap {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius, 10px);
  background: var(--ui-surface);
  overflow: auto;
}

.calendar_table {
  width: 100%;
  min-width: 860px;
  border-collapse: collapse;
}

.calendar_table th,
.calendar_table td {
  border: 1px solid var(--ui-border);
  padding: 6px;
  vertical-align: top;
}

.calendar_table th {
  position: sticky;
  top: 0;
  z-index: 1;
  font-size: 12px;
  background: transparent;
}

.calendar_table th.date_col_head,
.calendar_table th.cat_head {
  padding: 0;
}

.th_inner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 32px;
  padding: 6px 12px 6px 8px;
}

.calendar_table th.date_col_head .th_inner {
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.calendar_table th.cat_head .th_inner {
  background: var(--ui-accent-soft);
  background: color-mix(in srgb, var(--accent) 22%, var(--ui-accent-soft));
  color: var(--ui-text);
  border-bottom: 1px solid var(--ui-border);
}

.th_resizer {
  width: 10px;
  min-width: 10px;
  height: calc(100% - 8px);
  position: absolute;
  right: -5px;
  top: 4px;
  border: none;
  background: transparent;
  cursor: col-resize;
  touch-action: none;
  padding: 0;
  z-index: 2;
}

.th_resizer::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 2px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-border) 70%, #94a3b8);
}

.calendar_table th.date_col_head .th_resizer::before {
  background: color-mix(in srgb, var(--ui-border) 70%, #94a3b8);
}

.date_head {
  font-size: 12px;
  font-weight: 700;
  color: var(--ui-text);
  background: var(--ui-surface-muted);
  min-width: 120px;
  white-space: nowrap;
}

.cell_stack {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.mini_card {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 6px;
  background: var(--ui-surface);
  overflow: hidden;
  max-height: 280px;
  transform-origin: top center;
  transition: border-color 0.2s ease, background-color 0.2s ease;
  cursor: pointer;
}

.is_today_due {
  border-color: #5b9bff;
  background: #dbeafe;
}

.is_today_due .title_text {
  color: #1e3a8a;
}

.mini_card:hover {
  border-color: color-mix(in srgb, var(--ui-border) 70%, #94a3b8);
}

.mini_card:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
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

.saturday {
  color: #1565c0;
}

.sunday {
  color: #c62828;
}

.empty {
  text-align: center;
  color: var(--ui-muted);
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
  max-height: 280px;
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

