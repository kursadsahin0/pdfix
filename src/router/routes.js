const routes = [
  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    children: [{ path: '', component: () => import('@/pages/HomePage.vue') }],
  },
  {
    path: '/editor',
    component: () => import('@/pages/EditorPage.vue'),
  },
  {
    path: '/:catchAll(.*)*',
    component: () => import('@/pages/ErrorNotFound.vue'),
  },
]

export default routes
