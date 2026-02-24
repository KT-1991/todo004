<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useColorStore } from '@/stores/color'
import { useTodoStore } from '@/stores/todo'

const colorStore = useColorStore()
const todoStore = useTodoStore()
const route = useRoute()

const navItems = [
  { to: '/', name: 'home', label: 'ホーム' },
  { to: '/list', name: 'list', label: 'リスト' },
  { to: '/calendar', name: 'calendar', label: 'カレンダー' },
  { to: '/category', name: 'category', label: 'カテゴリー' },
  { to: '/log', name: 'log', label: 'ログ' },
  { to: '/setting', name: 'setting', label: '設定' },
]

const currentLabel = computed(
  () => navItems.find((item) => item.name === route.name)?.label ?? 'ホーム',
)

colorStore.init()

onMounted(async () => {
  await todoStore.init()
})
</script>

<template>
  <div class="app_shell">
    <header class="top_menu">
      <div class="brand">
        <h1>TaskBoard</h1>
      </div>

      <nav class="nav_group" :aria-label="`現在の画面: ${currentLabel}`">
        <RouterLink
          v-for="item in navItems"
          :key="item.name"
          :to="item.to"
          class="nav_link"
        >
          {{ item.label }}
        </RouterLink>
      </nav>
    </header>

    <main class="shell_main">
      <section class="main_stage">
        <RouterView />
      </section>
    </main>
  </div>
</template>

<style scoped>
.app_shell {
  --ui-bg: #edf1f6;
  --ui-surface: #ffffff;
  --ui-surface-muted: #f6f8fb;
  --ui-border: #cfd8e3;
  --ui-text: #0f172a;
  --ui-muted: #5b677c;
  --ui-accent: #1f2937;
  --ui-accent-soft: #e8edf4;
  --ui-radius: 10px;
  --ui-shadow: 0 10px 28px rgba(15, 23, 42, 0.1);

  min-height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.top_menu {
  border-bottom: 1px solid var(--ui-border);
  padding: 10px 12px;
  background: linear-gradient(120deg, #f9fbff, #eef3f9);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.brand h1 {
  margin: 0;
  font-size: 19px;
  line-height: 1.2;
  font-weight: 700;
}

.nav_group {
  display: flex;
  gap: 6px;
  padding: 4px;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  background: var(--ui-surface-muted);
}

.nav_link {
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: #334155;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-decoration: none;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;
}

.nav_link:hover {
  background: #ffffff;
  border-color: color-mix(in srgb, var(--ui-border) 70%, #94a3b8);
}

.nav_link.router-link-active {
  background: #ffffff;
  color: #0f172a;
  border-color: #b9c7d8;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}

.shell_main {
  min-height: 0;
  padding: 12px;
  display: flex;
}

.main_stage {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow);
  padding: 10px;
  overflow: hidden;
}

.main_stage :deep(.view_base) {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.main_stage :deep(.type_chip) {
  display: none;
}

.main_stage :deep(.category_column) {
  border-color: var(--ui-border);
  border-radius: var(--ui-radius);
  min-height: 0;
}

.main_stage :deep(.column_header),
.main_stage :deep(.calendar_table th.cat_head .th_inner) {
  background: var(--ui-accent-soft);
  background: color-mix(in srgb, var(--accent) 22%, var(--ui-accent-soft));
  color: var(--ui-text);
  border-bottom: 1px solid var(--ui-border);
}

.main_stage :deep(.todo_card),
.main_stage :deep(.mini_card),
.main_stage :deep(.calendar_wrap) {
  border-color: var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
}

.main_stage :deep(.todo_card.is_today_due),
.main_stage :deep(.mini_card.is_today_due) {
  border-color: #5b9bff;
  background: #dbeafe;
}

.main_stage :deep(.is_today_due .title_text) {
  color: #1e3a8a;
}

.main_stage :deep(.date_chip) {
  background: var(--ui-surface-muted);
  color: var(--ui-muted);
}

.main_stage :deep(.column_splitter::before) {
  background: var(--ui-border);
  background: color-mix(in srgb, var(--ui-border) 70%, #94a3b8);
}

@media (max-width: 980px) {
  .top_menu {
    flex-direction: column;
    align-items: flex-start;
  }

  .nav_group {
    width: 100%;
    flex-wrap: wrap;
  }

  .nav_link {
    flex: 1;
    min-width: 120px;
    text-align: center;
  }
}
</style>
