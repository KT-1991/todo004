import { defineStore } from 'pinia'
import { COLOR_INFO, LOCAL_STORAGE } from '@/scripts/const'

const DEFAULT_THEME_ID = 'sky'

export const useColorStore = defineStore('color', {
  state: () => ({
    colorFormat: DEFAULT_THEME_ID as string,
  }),

  actions: {
    init() {
      const savedColor = localStorage.getItem(LOCAL_STORAGE.COLOR)
      if (!savedColor || !COLOR_INFO[savedColor]) {
        this.colorFormat = DEFAULT_THEME_ID
        localStorage.setItem(LOCAL_STORAGE.COLOR, DEFAULT_THEME_ID)
        return
      }
      this.colorFormat = savedColor
    },

    getColorBy(id: string): string {
      const theme = (COLOR_INFO as any)[this.colorFormat]
      return theme?.color?.[id] ?? '#000000'
    },

    changeColorFormat(newId: string) {
      if (!COLOR_INFO[newId]) return
      this.colorFormat = newId
      localStorage.setItem(LOCAL_STORAGE.COLOR, newId)
    },
  },
})
