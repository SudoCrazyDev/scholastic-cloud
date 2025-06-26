/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

// User routes
router.group(() => {
  router.group(() => {
    router.get('/', '#controllers/users_controller.index')
    router.post('/', '#controllers/users_controller.store')
    router.get('/:id', '#controllers/users_controller.show')
    router.put('/:id', '#controllers/users_controller.update')
    router.delete('/:id', '#controllers/users_controller.destroy')
  }).prefix('/users')
}).prefix('/api')
