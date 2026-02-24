<script setup lang="ts">
import { computed, ref, type Ref } from 'vue'
import { CATEGORY_TYPE, COLOR_TYPE } from '@/scripts/const'
import { useColorStore } from '@/stores/color'
import { useTodoStore } from '@/stores/todo'

const colorStore = useColorStore()
const todoStore = useTodoStore()

const selectedCategoryId: Ref<string> = ref('')
const title = ref('')
const detail = ref('')
const doAt = ref('')
const showDetail = ref(true)
const errorMessage = ref('')

const selectedCategory = computed(() => {
  const numericId = Number(selectedCategoryId.value)
  if (!Number.isFinite(numericId)) return null
  return todoStore.listCategory.find((item) => item.id === numericId) ?? null
})

const isDateCategory = computed(() => selectedCategory.value?.categoryType === CATEGORY_TYPE.DATED)

async function submit() {
  errorMessage.value = ''
  try {
    if (!selectedCategory.value) {
      throw new Error('Category is required.')
    }

    if (!title.value.trim()) {
      throw new Error('Title is required.')
    }

    if (isDateCategory.value && !doAt.value) {
      throw new Error('Date is required for dated category.')
    }

    await todoStore.addTodo(
      selectedCategory.value.id,
      title.value,
      detail.value,
      isDateCategory.value ? doAt.value : null,
    )

    title.value = ''
    detail.value = ''
    doAt.value = ''
    await todoStore.makeSuggestions('')
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to add todo.'
  }
}

function fillSuggestion(word: string) {
  title.value = word
}

async function onTitleInput() {
  await todoStore.makeSuggestions(title.value)
}
</script>

<template>
  <section class="base_input_form">
    <button class="input_title" @click="showDetail = !showDetail">
      {{ showDetail ? 'Hide Input' : 'Show Input' }}
    </button>

    <div v-if="showDetail" class="input_content">
      <div class="row">
        <label>Category</label>
        <select v-model="selectedCategoryId" class="input_item">
          <option disabled value="">Select category</option>
          <option v-for="item in todoStore.listCategory" :key="item.id" :value="String(item.id)">
            {{ item.name }} ({{ item.categoryType }})
          </option>
        </select>
      </div>

      <div class="row">
        <label>Title</label>
        <input
          v-model="title"
          type="text"
          class="input_item"
          placeholder="Todo title"
          @input="onTitleInput"
        />
      </div>

      <div class="row" v-if="todoStore.suggestions.length > 0">
        <label>Suggestions</label>
        <div class="suggestions">
          <button
            v-for="value in todoStore.suggestions"
            :key="value"
            class="suggestion_button"
            @click="fillSuggestion(value)"
          >
            {{ value }}
          </button>
        </div>
      </div>

      <div class="row">
        <label>Detail</label>
        <textarea v-model="detail" class="input_item" placeholder="Detail"></textarea>
      </div>

      <div class="row" v-if="isDateCategory">
        <label>Date</label>
        <input v-model="doAt" type="date" class="input_item" />
      </div>

      <p v-if="errorMessage" class="error_text">{{ errorMessage }}</p>

      <button class="add_button" @click="submit">Add Todo</button>
    </div>
  </section>
</template>

<style scoped>
.base_input_form {
  margin: 10px;
  border: 1px solid #9e9e9e;
  background-color: v-bind(colorStore.getColorBy(COLOR_TYPE.secondary));
}

.input_title {
  width: 100%;
  padding: 8px 12px;
  border: none;
  text-align: left;
  cursor: pointer;
  color: v-bind(colorStore.getColorBy(COLOR_TYPE.onSecondaryHeavy));
  background-color: v-bind(colorStore.getColorBy(COLOR_TYPE.secondaryHeavy));
}

.input_content {
  padding: 10px;
}

.row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.input_item {
  padding: 6px 8px;
  border: 1px solid #9e9e9e;
  color: v-bind(colorStore.getColorBy(COLOR_TYPE.onSecondaryHeavy));
  background-color: v-bind(colorStore.getColorBy(COLOR_TYPE.background));
}

.suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.suggestion_button {
  padding: 4px 8px;
  border: 1px solid #90a4ae;
  border-radius: 4px;
  cursor: pointer;
  color: v-bind(colorStore.getColorBy(COLOR_TYPE.onSecondary));
  background-color: v-bind(colorStore.getColorBy(COLOR_TYPE.secondaryHeavy));
}

.add_button {
  padding: 8px 14px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: v-bind(colorStore.getColorBy(COLOR_TYPE.onPrimary));
  background-color: v-bind(colorStore.getColorBy(COLOR_TYPE.primary));
}

.error_text {
  margin: 4px 0 10px;
  color: v-bind(colorStore.getColorBy(COLOR_TYPE.error));
}
</style>
