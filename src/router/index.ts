import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import ListView from '@/views/ListView.vue'
import CalendarView from '@/views/CalendarView.vue'
import CategoryView from '@/views/CategoryView.vue'
import LogView from '@/views/LogView.vue'
import SettingView from '@/views/SettingView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { title: 'todo004 - Home' },
    },
    {
      path: '/list',
      name: 'list',
      component: ListView,
      meta: { title: 'todo004 - List' },
    },
    {
      path: '/calendar',
      name: 'calendar',
      component: CalendarView,
      meta: { title: 'todo004 - Calendar' },
    },
    {
      path: '/category',
      name: 'category',
      component: CategoryView,
      meta: { title: 'todo004 - Category' },
    },
    {
      path: '/log',
      name: 'log',
      component: LogView,
      meta: { title: 'todo004 - Log' },
    },
    {
      path: '/setting',
      name: 'setting',
      component: SettingView,
      meta: { title: 'todo004 - Setting' },
    },
  ],
})

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : 'todo004'
  document.title = title
})

export default router
