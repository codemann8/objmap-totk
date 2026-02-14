import Vue from 'vue';
import Router from 'vue-router';

import AppMap from '@/components/AppMap.vue';
import ChecklistOverlay from '@/components/ChecklistOverlay.vue';

Vue.use(Router);

export default new Router({
  // mode: 'history',
  routes: [
    { path: '/map', redirect: '/map/zx,0,0' },
    {
      path: '/map/z:zoom,:x,:z,:layer',
      name: 'map',
      component: AppMap,
    },
    {
      path: '/map/z:zoom,:x,:z',
      name: 'map',
      component: AppMap,
    },
    {
      path: '/tracker',
      name: 'tracker',
      component: ChecklistOverlay,
    },
    { path: '*', redirect: '/map' },
  ],
});
