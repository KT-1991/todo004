<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useTodoStore, type TodoItem } from '@/stores/todo'

const todoStore = useTodoStore()

const LIMIT_ROW = 100
const rowOffset = ref(0)
const message = ref('')

onMounted(async () => {
  await refreshLog()
})

const completedRows = computed(() => {
  const rows: Array<{ categoryName: string; item: TodoItem }> = []

  for (const category of todoStore.listCategory) {
    for (const item of todoStore.completedTodo[category.id] ?? []) {
      rows.push({ categoryName: category.name, item })
    }
  }

  rows.sort((a, b) => {
    const aTime = a.item.completedAt ?? ''
    const bTime = b.item.completedAt ?? ''
    if (aTime > bTime) return -1
    if (aTime < bTime) return 1
    return b.item.id - a.item.id
  })

  return rows
})

function rowStatus(item: TodoItem): string {
  return item.deletedAt ? 'Deleted' : 'Completed'
}

async function refreshLog() {
  await todoStore.initWithCompletedData(LIMIT_ROW, rowOffset.value)
}

async function moveOffset(next: boolean) {
  if (next) {
    rowOffset.value += LIMIT_ROW
  }
  else {
    rowOffset.value = Math.max(0, rowOffset.value - LIMIT_ROW)
  }
  await refreshLog()
}

async function runImport() {
  message.value = ''
  try {
    await todoStore.import()
    await refreshLog()
    message.value = 'Import completed.'
  }
  catch (error) {
    message.value = error instanceof Error ? error.message : 'Import failed.'
  }
}

async function runExport() {
  message.value = ''
  try {
    await todoStore.export()
    message.value = 'Export started.'
  }
  catch (error) {
    message.value = error instanceof Error ? error.message : 'Export failed.'
  }
}

async function undoComplete(itemId: number) {
  await todoStore.cancelDeleteTodo(itemId)
  await refreshLog()
}
</script>

<template>
  <section class="log_shell">
    <header class="shell_head">
      <h2>ログ</h2>
      <p>{{ rowOffset }} - {{ rowOffset + LIMIT_ROW }}</p>
    </header>

    <div class="toolbar">
      <button class="tool_btn" type="button" @click="runImport">Import (replace DB)</button>
      <button class="tool_btn" type="button" @click="runExport">Export</button>
      <button class="tool_btn" type="button" @click="refreshLog">Reload</button>
      <button class="tool_btn" type="button" @click="moveOffset(false)">Prev</button>
      <button class="tool_btn" type="button" @click="moveOffset(true)">Next</button>
    </div>

    <p v-if="message" class="message">{{ message }}</p>

    <div class="table_wrap">
      <table class="log_table">
        <thead>
          <tr>
            <th>Completed At</th>
            <th>Status</th>
            <th>Category</th>
            <th>Title</th>
            <th>Detail</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in completedRows" :key="row.item.id">
            <td>{{ row.item.completedAt ?? '-' }}</td>
            <td>{{ rowStatus(row.item) }}</td>
            <td>{{ row.categoryName }}</td>
            <td>{{ row.item.title }}</td>
            <td>{{ row.item.detail }}</td>
            <td>
              <button class="row_btn" type="button" @click="undoComplete(row.item.id)">
                {{ row.item.deletedAt ? 'Restore' : 'Undo Complete' }}
              </button>
            </td>
          </tr>

          <tr v-if="completedRows.length === 0">
            <td colspan="6" class="empty">No completed todo.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.log_shell {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto auto auto 1fr;
  gap: 8px;
}

.shell_head {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-surface-muted);
  padding: 8px 10px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.shell_head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.shell_head p {
  margin: 0;
  font-size: 12px;
  color: var(--ui-muted);
}

.toolbar {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
  padding: 8px;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.tool_btn,
.row_btn {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-surface);
  color: var(--ui-text);
  font-size: 12px;
  padding: 5px 9px;
  cursor: pointer;
}

.tool_btn:hover,
.row_btn:hover {
  background: var(--ui-accent-soft);
}

.message {
  margin: 0;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
  color: var(--ui-muted);
  padding: 7px 10px;
  font-size: 12px;
}

.table_wrap {
  min-height: 0;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
  overflow: auto;
}

.log_table {
  width: 100%;
  border-collapse: collapse;
}

.log_table th,
.log_table td {
  border: 1px solid var(--ui-border);
  padding: 7px 8px;
  vertical-align: top;
  font-size: 12px;
}

.log_table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--ui-surface-muted);
  color: var(--ui-text);
  font-weight: 700;
}

.empty {
  text-align: center;
  color: var(--ui-muted);
}
</style>
