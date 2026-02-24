<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { CATEGORY_TYPE, type CategoryType } from '@/scripts/const'
import { useTodoStore } from '@/stores/todo'

const todoStore = useTodoStore()

const DEFAULT_ACCENT_COLOR = '#4f46e5'
const ACCENT_COLORS = ['#4f46e5', '#0f766e', '#0369a1', '#b45309', '#6d28d9', '#166534']

const selectedCategoryId = ref<number | null>(null)
const newName = ref('')
const newCategoryType = ref<CategoryType>(CATEGORY_TYPE.DATED)
const draftTypeMap = reactive<Record<number, CategoryType>>({})
const message = ref('')
const messageTone = ref<'info' | 'error'>('info')
const draggingCategoryId = ref<number | null>(null)
const dragOverCategoryId = ref<number | null>(null)
const dragOverPosition = ref<'before' | 'after' | null>(null)
const isReordering = ref(false)

onMounted(async () => {
  if (todoStore.listCategory.length === 0) {
    await todoStore.init()
  }
})

watch(
  () => todoStore.listCategory,
  (categories) => {
    for (const category of categories) {
      if (!draftTypeMap[category.id]) {
        draftTypeMap[category.id] = category.categoryType
      }
    }

    if (categories.length === 0) {
      selectedCategoryId.value = null
      return
    }

    const exists = categories.some((category) => category.id === selectedCategoryId.value)
    if (!exists) {
      selectedCategoryId.value = categories[0]?.id ?? null
    }
  },
  { immediate: true, deep: true },
)

const categoryRows = computed(() =>
  todoStore.listCategory.map((category, index) => {
    const todos = todoStore.currentTodo[category.id] ?? []
    const active = todos.filter((todo) => !todo.completedAt).length
    return {
      ...category,
      active,
      total: todos.length,
      color: ACCENT_COLORS[index % ACCENT_COLORS.length] ?? DEFAULT_ACCENT_COLOR,
    }
  }),
)

const selectedCategory = computed(() =>
  todoStore.listCategory.find((category) => category.id === selectedCategoryId.value),
)

function typeLabel(type: CategoryType): string {
  return type === CATEGORY_TYPE.DATED ? '日付あり' : '日付なし'
}

function setMessage(text: string, tone: 'info' | 'error' = 'info') {
  message.value = text
  messageTone.value = tone
}

async function addCategory() {
  const normalizedName = newName.value.trim()
  if (!normalizedName) {
    setMessage('カテゴリ名を入力してください', 'error')
    return
  }

  await todoStore.addCategory(normalizedName, newCategoryType.value)
  newName.value = ''
  newCategoryType.value = CATEGORY_TYPE.DATED
  selectedCategoryId.value = todoStore.listCategory[todoStore.listCategory.length - 1]?.id ?? null
  setMessage('カテゴリを追加しました')
}

async function updateSelectedCategoryType() {
  const category = selectedCategory.value
  if (!category) return

  const draftType = draftTypeMap[category.id]
  if (!draftType) return

  await todoStore.updateCategoryType(category.id, draftType)
  setMessage('カテゴリ種別を更新しました')
}

async function removeSelectedCategory() {
  const category = selectedCategory.value
  if (!category) return

  const ok = window.confirm(`カテゴリ「${category.name}」を削除しますか？`)
  if (!ok) return

  await todoStore.deleteCategory(category.id)
  setMessage('カテゴリを削除しました')
}
function clearDragState() {
  draggingCategoryId.value = null
  dragOverCategoryId.value = null
  dragOverPosition.value = null
}

function createReorderedCategoryIds(
  sourceCategoryId: number,
  targetCategoryId: number,
  insertAfter: boolean,
): number[] | null {
  const ids = categoryRows.value.map((row) => row.id)
  const sourceIndex = ids.indexOf(sourceCategoryId)
  const targetIndex = ids.indexOf(targetCategoryId)
  if (sourceIndex < 0 || targetIndex < 0) return null

  ids.splice(sourceIndex, 1)
  const nextTargetIndex = ids.indexOf(targetCategoryId)
  if (nextTargetIndex < 0) return null

  const insertIndex = insertAfter ? nextTargetIndex + 1 : nextTargetIndex
  ids.splice(insertIndex, 0, sourceCategoryId)
  return ids
}

function onRowDragStart(categoryId: number, event: DragEvent) {
  if (isReordering.value) {
    event.preventDefault()
    return
  }

  draggingCategoryId.value = categoryId
  dragOverCategoryId.value = null
  dragOverPosition.value = null

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(categoryId))
  }
}

function onRowDragOver(categoryId: number, event: DragEvent) {
  if (draggingCategoryId.value === null) return
  if (draggingCategoryId.value === categoryId) return

  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'

  const target = event.currentTarget as HTMLElement | null
  if (!target) return
  const rect = target.getBoundingClientRect()
  const isBefore = event.clientY < rect.top + rect.height / 2

  dragOverCategoryId.value = categoryId
  dragOverPosition.value = isBefore ? 'before' : 'after'
}

async function onRowDrop(categoryId: number, event: DragEvent) {
  event.preventDefault()
  const sourceCategoryId = draggingCategoryId.value
  if (sourceCategoryId === null) return

  if (sourceCategoryId === categoryId) {
    clearDragState()
    return
  }

  const insertAfter = dragOverPosition.value === 'after'
  const reorderedIds = createReorderedCategoryIds(sourceCategoryId, categoryId, insertAfter)
  clearDragState()
  if (!reorderedIds) return
  if (isReordering.value) return

  isReordering.value = true
  try {
    await todoStore.reorderCategories(reorderedIds)
    selectedCategoryId.value = sourceCategoryId
    setMessage('Category order updated.')
  }
  catch (error) {
    setMessage(error instanceof Error ? error.message : 'Failed to reorder categories.', 'error')
  }
  finally {
    isReordering.value = false
  }
}

function onRowDragEnd() {
  clearDragState()
}
</script>

<template>
  <section class="category_editor">
    <section class="editor_list">
      <header class="panel_head">
        <h2>カテゴリ一覧</h2>
        <span>{{ categoryRows.length }} 件</span>
      </header>

      <div class="rows">
        <button
          v-for="row in categoryRows"
          :key="row.id"
          :class="[
            'row',
            {
              active: selectedCategoryId === row.id,
              dragging: draggingCategoryId === row.id,
              drag_over_before: dragOverCategoryId === row.id && dragOverPosition === 'before',
              drag_over_after: dragOverCategoryId === row.id && dragOverPosition === 'after',
            },
          ]"
          type="button"
          draggable="true"
          @click="selectedCategoryId = row.id"
          @dragstart="onRowDragStart(row.id, $event)"
          @dragover="onRowDragOver(row.id, $event)"
          @drop="onRowDrop(row.id, $event)"
          @dragend="onRowDragEnd"
        >
          <span class="swatch" :style="{ background: row.color }" />
          <span class="name">{{ row.name }}</span>
          <span class="type">{{ typeLabel(row.categoryType) }}</span>
          <span class="count">{{ row.active }}/{{ row.total }}</span>
        </button>

        <p v-if="categoryRows.length === 0" class="empty">カテゴリがありません</p>
      </div>
    </section>

    <section class="editor_form">
      <header class="panel_head">
        <h2>カテゴリ設定</h2>
        <span>追加 / 種別変更 / 削除</span>
      </header>

      <div class="form_body">
        <section class="sub_panel">
          <h3>新規追加</h3>
          <label class="field">
            <span>カテゴリ名</span>
            <input v-model="newName" type="text" placeholder="カテゴリ名を入力" />
          </label>

          <div class="field">
            <span>種別</span>
            <div class="segmented">
              <button
                :class="{ active: newCategoryType === CATEGORY_TYPE.DATED }"
                type="button"
                @click="newCategoryType = CATEGORY_TYPE.DATED"
              >
                日付あり
              </button>
              <button
                :class="{ active: newCategoryType === CATEGORY_TYPE.PLAIN }"
                type="button"
                @click="newCategoryType = CATEGORY_TYPE.PLAIN"
              >
                日付なし
              </button>
            </div>
          </div>

          <div class="actions">
            <button class="primary" type="button" @click="addCategory">カテゴリを追加</button>
          </div>
        </section>

        <section v-if="selectedCategory" class="sub_panel">
          <h3>選択中のカテゴリ</h3>

          <label class="field">
            <span>カテゴリ名</span>
            <input :value="selectedCategory.name" type="text" disabled />
          </label>

          <div class="field">
            <span>種別</span>
            <div class="segmented">
              <button
                :class="{ active: draftTypeMap[selectedCategory.id] === CATEGORY_TYPE.DATED }"
                type="button"
                @click="draftTypeMap[selectedCategory.id] = CATEGORY_TYPE.DATED"
              >
                日付あり
              </button>
              <button
                :class="{ active: draftTypeMap[selectedCategory.id] === CATEGORY_TYPE.PLAIN }"
                type="button"
                @click="draftTypeMap[selectedCategory.id] = CATEGORY_TYPE.PLAIN"
              >
                日付なし
              </button>
            </div>
          </div>

          <div class="actions">
            <button class="secondary" type="button" @click="updateSelectedCategoryType">
              種別を保存
            </button>
            <button class="danger" type="button" @click="removeSelectedCategory">カテゴリを削除</button>
          </div>
        </section>

        <p v-else class="empty">カテゴリを追加してください</p>

        <p v-if="message" :class="['message', messageTone]">{{ message }}</p>
      </div>
    </section>
  </section>
</template>

<style scoped>
.category_editor {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1.3fr;
  gap: 10px;
}

.editor_list,
.editor_form {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
  overflow: hidden;
  min-height: 0;
  display: grid;
  grid-template-rows: auto 1fr;
}

.panel_head {
  padding: 8px 10px;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-surface-muted);
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}

.panel_head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.panel_head span {
  color: var(--ui-muted);
  font-size: 11px;
}

.rows {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: auto;
}

.row {
  width: 100%;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
  color: var(--ui-text);
  padding: 7px 8px;
  display: grid;
  grid-template-columns: 14px 1fr auto auto;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  text-align: left;
}

.row.active {
  border-color: var(--ui-accent);
  background: var(--ui-accent-soft);
}

.row.dragging {
  opacity: 0.55;
}

.row.drag_over_before {
  box-shadow: inset 0 2px 0 var(--ui-accent);
}

.row.drag_over_after {
  box-shadow: inset 0 -2px 0 var(--ui-accent);
}

.swatch {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.2);
}

.name {
  font-size: 13px;
  font-weight: 700;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.type {
  font-size: 11px;
  color: var(--ui-muted);
}

.count {
  font-size: 11px;
  color: var(--ui-muted);
}

.form_body {
  min-height: 0;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
}

.sub_panel {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-surface-muted);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sub_panel h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field span {
  font-size: 12px;
  color: var(--ui-muted);
}

input {
  width: 100%;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
  color: var(--ui-text);
  padding: 8px;
}

input:disabled {
  color: var(--ui-muted);
  background: #f8fafc;
}

.segmented {
  display: inline-flex;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  overflow: hidden;
}

.segmented button {
  border: none;
  background: var(--ui-surface);
  color: var(--ui-text);
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
}

.segmented button.active {
  background: var(--ui-accent-soft);
  color: var(--ui-text);
  font-weight: 700;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.primary,
.secondary,
.danger {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
  color: var(--ui-text);
  padding: 7px 12px;
  font-size: 12px;
  cursor: pointer;
}

.primary {
  border-color: var(--ui-accent);
  background: var(--ui-accent-soft);
  color: var(--ui-text);
  font-weight: 700;
}

.secondary {
  border-color: var(--ui-border);
  background: var(--ui-surface);
  color: var(--ui-text);
}

.danger {
  border-color: #ef4444;
  background: #fef2f2;
  color: #b91c1c;
}

.message {
  margin: 0;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  padding: 8px 10px;
  font-size: 12px;
}

.message.info {
  border-color: #93c5fd;
  background: #eff6ff;
  color: #1e40af;
}

.message.error {
  border-color: #fca5a5;
  background: #fef2f2;
  color: #b91c1c;
}

.empty {
  margin: 0;
  color: var(--ui-muted);
  font-size: 12px;
}

@media (max-width: 980px) {
  .category_editor {
    grid-template-columns: 1fr;
  }
}
</style>
