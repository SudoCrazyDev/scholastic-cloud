/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import JwtMiddleware from '#middleware/jwt_middleware'

// Create middleware function
const jwtMiddleware = async (ctx: any, next: any) => {
  const middleware = new JwtMiddleware()
  return middleware.handle(ctx, next)
}

// Auth routes
router.post('/api/login', '#controllers/auth_controller.login')

// All other routes require JWT authentication
router.group(() => {
  // User routes
  router.group(() => {
    router.get('/', '#controllers/users_controller.index')
    router.post('/', '#controllers/users_controller.store')
    router.get('/:id', '#controllers/users_controller.show')
    router.put('/:id', '#controllers/users_controller.update')
    router.delete('/:id', '#controllers/users_controller.destroy')
  }).prefix('/users')

  // Role routes
  router.group(() => {
    router.get('/', '#controllers/roles_controller.index')
    router.post('/', '#controllers/roles_controller.store')
    router.get('/:id', '#controllers/roles_controller.show')
    router.put('/:id', '#controllers/roles_controller.update')
    router.delete('/:id', '#controllers/roles_controller.destroy')
  }).prefix('/roles')

  // Institution routes
  router.group(() => {
    router.get('/', '#controllers/institutions_controller.index')
    router.post('/', '#controllers/institutions_controller.store')
    router.get('/:id', '#controllers/institutions_controller.show')
    router.put('/:id', '#controllers/institutions_controller.update')
    router.delete('/:id', '#controllers/institutions_controller.destroy')
  }).prefix('/institutions')

  // Subscription routes
  router.group(() => {
    router.get('/', '#controllers/subscriptions_controller.index')
    router.post('/', '#controllers/subscriptions_controller.store')
    router.get('/:id', '#controllers/subscriptions_controller.show')
    router.put('/:id', '#controllers/subscriptions_controller.update')
    router.delete('/:id', '#controllers/subscriptions_controller.destroy')
  }).prefix('/subscriptions')

  // Institution subscription routes
  router.group(() => {
    router.get('/', '#controllers/institution_subscriptions_controller.show')
    router.post('/', '#controllers/institution_subscriptions_controller.store')
    router.put('/', '#controllers/institution_subscriptions_controller.update')
    router.delete('/', '#controllers/institution_subscriptions_controller.destroy')
    router.get('/expiration', '#controllers/institution_subscriptions_controller.checkExpiration')
  }).prefix('/institutions/:institutionId/subscription')

  // User institution routes
  router.group(() => {
    router.get('/', '#controllers/user_institutions_controller.getUserInstitutions')
    router.get('/default', '#controllers/user_institutions_controller.getUserDefaultInstitution')
    router.post('/:institutionId', '#controllers/user_institutions_controller.assignUserToInstitution')
    router.put('/:institutionId', '#controllers/user_institutions_controller.updateUserInstitution')
    router.delete('/:institutionId', '#controllers/user_institutions_controller.removeUserFromInstitution')
    router.put('/:institutionId/default', '#controllers/user_institutions_controller.setDefaultInstitution')
    router.get('/:institutionId/check', '#controllers/user_institutions_controller.checkUserAssignment')
  }).prefix('/users/:userId/institutions')

  // Institution users routes
  router.group(() => {
    router.get('/', '#controllers/user_institutions_controller.getInstitutionUsers')
  }).prefix('/institutions/:institutionId/users')
}).prefix('/api')
