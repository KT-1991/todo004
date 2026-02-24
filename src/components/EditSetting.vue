<script setup lang="ts">
import { computed } from 'vue'
import { COLOR_INFO, LOCAL_STORAGE } from '@/scripts/const'
import { useColorStore } from '@/stores/color'

const colorStore = useColorStore()

const selectedColor = computed({
  get: () => colorStore.colorFormat,
  set: (value: string) => {
    colorStore.changeColorFormat(value)
  },
})

if (!localStorage.getItem(LOCAL_STORAGE.COLOR)) {
  colorStore.changeColorFormat('sky')
}
</script>

<template>
  <section class="setting_shell">
    <header class="shell_head">
      <h2>設定</h2>
      <p>表示テーマ</p>
    </header>

    <section class="panel">
      <div class="row">
        <label class="field_label" for="theme-select">Theme</label>
        <select id="theme-select" v-model="selectedColor" class="setting_select">
          <option v-for="item in COLOR_INFO" :key="item.id" :value="item.id">
            {{ item.name }}
          </option>
        </select>
      </div>
    </section>
  </section>
</template>

<style scoped>
.setting_shell {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto 1fr;
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

.panel {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-surface);
  padding: 10px;
}

.row {
  max-width: 420px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-surface-muted);
  padding: 8px;
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 8px;
  align-items: center;
}

.field_label {
  font-size: 12px;
  color: var(--ui-muted);
}

.setting_select {
  width: 100%;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-surface);
  color: var(--ui-text);
  padding: 7px 8px;
  min-width: 180px;
}

@media (max-width: 720px) {
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
