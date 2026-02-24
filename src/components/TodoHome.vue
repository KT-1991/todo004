<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { CATEGORY_TYPE } from '@/scripts/const'
import { toDateKey } from '@/scripts/utils'
import { useTodoStore, type TodoCategory, type TodoItem } from '@/stores/todo'

type TaskGroup = {
  category: TodoCategory
  todos: TodoItem[]
}

const todoStore = useTodoStore()

const DEFAULT_ACCENT_COLOR = '#4f46e5'
const ACCENT_COLORS = ['#4f46e5', '#0f766e', '#0369a1', '#b45309', '#6d28d9', '#166534']

onMounted(async () => {
  if (todoStore.listCategory.length === 0) {
    await todoStore.init()
  }
})

const categories = computed(() => todoStore.listCategory)
const todayKey = computed(() => toDateKey(new Date()))

const categoryIndexById = computed(() => {
  const indexMap: Record<number, number> = {}
  categories.value.forEach((category, index) => {
    indexMap[category.id] = index
  })
  return indexMap
})

function categoryColor(categoryId: number): string {
  const index = categoryIndexById.value[categoryId] ?? 0
  return ACCENT_COLORS[index % ACCENT_COLORS.length] ?? DEFAULT_ACCENT_COLOR
}

function toDayText(dateKey: string): string {
  const [yearText, monthText, dayText] = dateKey.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  if (!year || !month || !day) return dateKey

  const date = new Date(year, month - 1, day)
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'] as const
  return `${year}/${month}/${day} (${weekdays[date.getDay()] ?? '?'})`
}

const todayDateText = computed(() => toDayText(todayKey.value))

function sortedByTitle(items: TodoItem[]): TodoItem[] {
  return [...items].sort((a, b) => a.title.localeCompare(b.title, 'ja'))
}

function sortedByDateThenTitle(items: TodoItem[]): TodoItem[] {
  return [...items].sort((a, b) => {
    const dateOrder = (a.doAt ?? '').localeCompare(b.doAt ?? '')
    if (dateOrder !== 0) return dateOrder
    return a.title.localeCompare(b.title, 'ja')
  })
}

const todayTasks = computed(() => {
  const rows: TodoItem[] = []

  for (const category of categories.value) {
    if (category.categoryType !== CATEGORY_TYPE.DATED) continue
    const todos = todoStore.currentTodo[category.id] ?? []
    for (const todo of todos) {
      if (todo.completedAt) continue
      if (todo.doAt !== todayKey.value) continue
      rows.push(todo)
    }
  }

  return sortedByTitle(rows)
})

const overdueTasks = computed(() => {
  const rows: TodoItem[] = []

  for (const category of categories.value) {
    if (category.categoryType !== CATEGORY_TYPE.DATED) continue
    const todos = todoStore.currentTodo[category.id] ?? []
    for (const todo of todos) {
      if (todo.completedAt) continue
      if (!todo.doAt) continue
      if (todo.doAt >= todayKey.value) continue
      rows.push(todo)
    }
  }

  return sortedByDateThenTitle(rows)
})

const completedTodayTasks = computed(() => {
  const rows: TodoItem[] = []

  for (const category of categories.value) {
    const todos = todoStore.todayCompletedTodo[category.id] ?? []
    for (const todo of todos) {
      rows.push(todo)
    }
  }

  return sortedByTitle(rows)
})

function countByCategory(tasks: TodoItem[]): Record<number, number> {
  const countMap: Record<number, number> = {}
  for (const category of categories.value) {
    countMap[category.id] = 0
  }
  for (const task of tasks) {
    countMap[task.idCategory] = (countMap[task.idCategory] ?? 0) + 1
  }
  return countMap
}

function groupByCategory(tasks: TodoItem[]): TaskGroup[] {
  const taskMap = new Map<number, TodoItem[]>()
  for (const task of tasks) {
    const list = taskMap.get(task.idCategory) ?? []
    list.push(task)
    taskMap.set(task.idCategory, list)
  }

  const groups: TaskGroup[] = []
  for (const category of categories.value) {
    const todos = taskMap.get(category.id) ?? []
    if (todos.length === 0) continue
    groups.push({ category, todos })
  }
  return groups
}

const todayCounts = computed(() => countByCategory(todayTasks.value))
const overdueCounts = computed(() => countByCategory(overdueTasks.value))
const completedTodayCounts = computed(() => countByCategory(completedTodayTasks.value))

const todayGroups = computed(() => groupByCategory(todayTasks.value))
const overdueGroups = computed(() => groupByCategory(overdueTasks.value))
const completedTodayGroups = computed(() => groupByCategory(completedTodayTasks.value))

function shortDate(dateKey: string | null): string {
  if (!dateKey) return ''
  const [yearText, monthText, dayText] = dateKey.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  if (!year || !month || !day) return dateKey

  const date = new Date(year, month - 1, day)
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'] as const
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${mm}-${dd} (${weekdays[date.getDay()] ?? '?'})`
}
</script>

<template>
  <section class="dashboard">
    <section class="summary_panel">
      <header class="summary_head">
        <h2>ダッシュボード</h2>
        <p>{{ todayDateText }}</p>
      </header>

      <div class="summary_table_wrap">
        <table class="summary_table">
          <thead>
            <tr>
              <th class="row_label">区分</th>
              <th v-for="category in categories" :key="`head-${category.id}`">
                <span class="th_inner">
                  <span class="cat_dot" :style="{ background: categoryColor(category.id) }" />
                  <span class="th_text">{{ category.name }}</span>
                </span>
              </th>
              <th class="total_head">合計</th>
            </tr>
          </thead>
          <tbody>
            <tr class="summary_row today_line">
              <th class="row_label">本日</th>
              <td v-for="category in categories" :key="`today-${category.id}`">
                {{ todayCounts[category.id] ?? 0 }}
              </td>
              <td class="total_cell today_total">{{ todayTasks.length }}</td>
            </tr>

            <tr class="summary_row overdue_line">
              <th class="row_label">昨日まで</th>
              <td v-for="category in categories" :key="`overdue-${category.id}`">
                {{ overdueCounts[category.id] ?? 0 }}
              </td>
              <td class="total_cell overdue_total">{{ overdueTasks.length }}</td>
            </tr>

            <tr class="summary_row done_line">
              <th class="row_label">本日完了</th>
              <td v-for="category in categories" :key="`done-${category.id}`">
                {{ completedTodayCounts[category.id] ?? 0 }}
              </td>
              <td class="total_cell done_total">{{ completedTodayTasks.length }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="list_grid">
      <article class="panel">
        <header class="panel_head">
          <h3>本日のタスク</h3>
        </header>

        <div class="group_list">
          <section
            v-for="group in todayGroups"
            :key="`today-group-${group.category.id}`"
            class="category_group"
            :style="{ '--accent': categoryColor(group.category.id) }"
          >
            <header class="group_head">
              <span class="group_dot" :style="{ background: categoryColor(group.category.id) }" />
              <h4>{{ group.category.name }}</h4>
            </header>

            <div class="task_list">
              <div v-for="todo in group.todos" :key="todo.id" class="task_row">
                <span class="task_title">{{ todo.title }}</span>
              </div>
            </div>
          </section>

          <p v-if="todayGroups.length === 0" class="empty">本日のタスクはありません</p>
        </div>
      </article>

      <article class="panel">
        <header class="panel_head">
          <h3>昨日までの未完了</h3>
        </header>

        <div class="group_list">
          <section
            v-for="group in overdueGroups"
            :key="`overdue-group-${group.category.id}`"
            class="category_group"
            :style="{ '--accent': categoryColor(group.category.id) }"
          >
            <header class="group_head">
              <span class="group_dot" :style="{ background: categoryColor(group.category.id) }" />
              <h4>{{ group.category.name }}</h4>
            </header>

            <div class="task_list">
              <div v-for="todo in group.todos" :key="todo.id" class="task_row">
                <span class="task_date">{{ shortDate(todo.doAt) }}</span>
                <span class="task_title">{{ todo.title }}</span>
              </div>
            </div>
          </section>

          <p v-if="overdueGroups.length === 0" class="empty">期限超過タスクはありません</p>
        </div>
      </article>

      <article class="panel">
        <header class="panel_head">
          <h3>本日完了</h3>
        </header>

        <div class="group_list">
          <section
            v-for="group in completedTodayGroups"
            :key="`done-group-${group.category.id}`"
            class="category_group done_group"
            :style="{ '--accent': categoryColor(group.category.id) }"
          >
            <header class="group_head">
              <span class="group_dot" :style="{ background: categoryColor(group.category.id) }" />
              <h4>{{ group.category.name }}</h4>
            </header>

            <div class="task_list">
              <div v-for="todo in group.todos" :key="todo.id" class="task_row done_row">
                <span class="task_title">{{ todo.title }}</span>
              </div>
            </div>
          </section>

          <p v-if="completedTodayGroups.length === 0" class="empty">本日完了したタスクはありません</p>
        </div>
      </article>
    </section>
  </section>
</template>

<style scoped>
.dashboard {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 10px;
}

.summary_panel {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
  overflow: hidden;
}

.summary_head {
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-surface-muted);
  padding: 8px 10px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}

.summary_head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.summary_head p {
  margin: 0;
  font-size: 12px;
  color: var(--ui-muted);
}

.summary_table_wrap {
  overflow-x: auto;
}

.summary_table {
  width: max-content;
  min-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  border-top: 1px solid var(--ui-border);
  border-bottom: 1px solid var(--ui-border);
}

.summary_table th,
.summary_table td {
  border: none;
  padding: 8px 16px;
  text-align: center;
  font-size: 12px;
  white-space: nowrap;
}

.summary_table thead th {
  border-bottom: 1px solid var(--ui-border);
  background: color-mix(in srgb, var(--ui-surface-muted) 82%, #ffffff);
  color: var(--ui-text);
  font-weight: 700;
}

.row_label {
  min-width: 88px;
}

.th_inner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.th_text {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cat_dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.total_head {
  min-width: 70px;
}

.summary_row.today_line {
  background: color-mix(in srgb, var(--ui-accent-soft) 44%, #ffffff);
}

.summary_row.overdue_line {
  background: color-mix(in srgb, #fee2e2 40%, #ffffff);
}

.summary_row.done_line {
  background: color-mix(in srgb, #dcfce7 42%, #ffffff);
}

.total_cell {
  font-size: 22px !important;
  font-weight: 800;
  line-height: 1;
}

.today_total {
  color: color-mix(in srgb, var(--ui-accent) 78%, #0f172a);
}

.overdue_total {
  color: #b91c1c;
}

.done_total {
  color: #166534;
}

.list_grid {
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.panel {
  min-height: 0;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
  overflow: hidden;
  display: grid;
  grid-template-rows: auto 1fr;
}

.panel_head {
  padding: 8px 10px;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-surface-muted);
}

.panel_head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
}

.group_list {
  min-height: 0;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: auto;
}

.category_group {
  --accent: #64748b;
  border: 1px solid color-mix(in srgb, var(--accent) 34%, var(--ui-border));
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
  overflow: hidden;
}

.group_head {
  padding: 6px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 28%, var(--ui-border));
  background: color-mix(in srgb, var(--accent) 18%, var(--ui-surface-muted));
  display: flex;
  align-items: center;
  gap: 7px;
}

.group_dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

.group_head h4 {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task_list {
  padding: 7px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.task_row {
  border: 1px solid color-mix(in srgb, var(--accent) 26%, var(--ui-border));
  border-radius: var(--ui-radius);
  padding: 6px 8px;
  background: var(--ui-surface);
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px;
  align-items: center;
}

.done_group {
  border-color: color-mix(in srgb, #16a34a 34%, var(--ui-border));
}

.done_group .group_head {
  border-bottom-color: color-mix(in srgb, #16a34a 28%, var(--ui-border));
  background: color-mix(in srgb, #dcfce7 52%, var(--ui-surface-muted));
}

.done_row {
  border-color: color-mix(in srgb, #16a34a 30%, var(--ui-border));
  background: color-mix(in srgb, #ecfdf5 44%, #ffffff);
}

.done_row .task_title {
  color: #4b5563;
  text-decoration: line-through;
  text-decoration-thickness: 1.5px;
}

.task_date {
  font-size: 11px;
  color: #b91c1c;
}

.task_title {
  font-size: 13px;
  font-weight: 700;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--ui-muted);
}

@media (max-width: 980px) {
  .list_grid {
    grid-template-columns: 1fr 1fr;
  }

  .task_row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .list_grid {
    grid-template-columns: 1fr;
  }
}
</style>
