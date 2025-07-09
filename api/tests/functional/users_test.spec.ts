import { test } from '@japa/runner'
import { faker } from '@faker-js/faker'
import User from '#models/user'

test.group('Users', (group) => {
  // group.each.setup(async () => {
  //   await User.query().delete()
  // })

  test('should create a new user', async ({ client, assert }) => {
    for(let i = 0; i < 10; i++) {
      const userData = {
          first_name: faker.person.firstName(),
          middle_name: faker.person.middleName(),
          last_name: faker.person.lastName(),
          ext_name: faker.helpers.arrayElement(['Jr.', 'Sr.', 'III', 'IV']),
          gender: faker.helpers.arrayElement(['male', 'female']),
          birthdate: faker.date.past({ years: 30 }).toISOString().split('T')[0],
          email: faker.internet.email(),
          password: faker.internet.password({ length: 12 }),
        }
        const response = await client.post('/api/users').json(userData)
        console.log(response);
      response.assertStatus(201)
      assert.deepInclude(response.body(), {
        first_name: userData.first_name,
          last_name: userData.last_name,
          email: userData.email,
          gender: userData.gender,
          is_new: true,
          is_active: true,
      })
    };
  })

  // test('should not create user with duplicate email', async ({ client }) => {
  //   const email = faker.internet.email()
  //   const userData = {
  //     first_name: faker.person.firstName(),
  //     last_name: faker.person.lastName(),
  //     gender: 'male',
  //     birthdate: faker.date.past({ years: 30 }).toISOString().split('T')[0],
  //     email,
  //     password: faker.internet.password({ length: 12 }),
  //   }

  //   // Create first user
  //   await client.post('/api/users').json(userData)

  //   // Try to create second user with same email
  //   const response = await client.post('/api/users').json(userData)

  //   response.assertStatus(409)
  //   response.assertBodyContains({
  //     message: 'Email already exists',
  //   })
  // })

  // test('should validate required fields', async ({ client }) => {
  //   const response = await client.post('/api/users').json({})

  //   response.assertStatus(400)
  //   response.assertBodyContains({
  //     message: 'Validation failed',
  //   })
  // })

  // test('should get a list of users with pagination', async ({ client, assert }) => {
  //   // Create multiple users
  //   const users = []
  //   for (let i = 0; i < 5; i++) {
  //     const userData = {
  //       first_name: faker.person.firstName(),
  //       last_name: faker.person.lastName(),
  //       gender: faker.helpers.arrayElement(['male', 'female', 'other']),
  //       birthdate: faker.date.past({ years: 30 }).toISOString().split('T')[0],
  //       email: faker.internet.email(),
  //       password: faker.internet.password({ length: 12 }),
  //     }
  //     users.push(userData)
  //     await client.post('/api/users').json(userData)
  //   }

  //   const response = await client.get('/api/users?page=1&limit=3')
    
  //   response.assertStatus(200)
  //   assert.deepInclude(response.body(), {
  //     data: response.body().data,
  //   })
  // })

  // test('should filter users by search term', async ({ client }) => {
  //   const searchName = 'John'
  //   const userData = {
  //     first_name: searchName,
  //     last_name: faker.person.lastName(),
  //     gender: 'male',
  //     birthdate: faker.date.past({ years: 30 }).toISOString().split('T')[0],
  //     email: faker.internet.email(),
  //     password: faker.internet.password({ length: 12 }),
  //   }

  //   await client.post('/api/users').json(userData)

  //   const response = await client.get(`/api/users?search=${searchName}`)

  //   response.assertStatus(200)
  //   response.assertBodyContains({
  //     data: response.body().data,
  //   })
  //   response.assertBodyContains({
  //     data: [
  //       {
  //         first_name: searchName,
  //       },
  //     ],
  //   })
  // })

  // test('should filter users by gender', async ({ client }) => {
  //   const maleUser = {
  //     first_name: faker.person.firstName(),
  //     last_name: faker.person.lastName(),
  //     gender: 'male',
  //     birthdate: faker.date.past({ years: 30 }).toISOString().split('T')[0],
  //     email: faker.internet.email(),
  //     password: faker.internet.password({ length: 12 }),
  //   }

  //   const femaleUser = {
  //     first_name: faker.person.firstName(),
  //     last_name: faker.person.lastName(),
  //     gender: 'female',
  //     birthdate: faker.date.past({ years: 30 }).toISOString().split('T')[0],
  //     email: faker.internet.email(),
  //     password: faker.internet.password({ length: 12 }),
  //   }

  //   await client.post('/api/users').json(maleUser)
  //   await client.post('/api/users').json(femaleUser)

  //   const response = await client.get('/api/users?gender=male')

  //   response.assertStatus(200)
  //   response.assertBodyContains({
  //     data: [
  //       {
  //         gender: 'male',
  //       },
  //     ],
  //   })
  // })

  // test('should get a single user by ID', async ({ client, assert }) => {
  //   const userData = {
  //     first_name: faker.person.firstName(),
  //     last_name: faker.person.lastName(),
  //     gender: 'male',
  //     birthdate: faker.date.past({ years: 30 }).toISOString().split('T')[0],
  //     email: faker.internet.email(),
  //     password: faker.internet.password({ length: 12 }),
  //   }

  //   const createResponse = await client.post('/api/users').json(userData)
  //   const userId = createResponse.body().id

  //   const response = await client.get(`/api/users/${userId}`)

  //   response.assertStatus(200)
  //   assert.deepInclude(response.body(), {
  //     id: userId,
  //     first_name: userData.first_name,
  //     last_name: userData.last_name,
  //     email: userData.email,
  //   })
  // })

  // test('should return 404 for non-existent user', async ({ client }) => {
  //   const fakeId = faker.string.uuid()
  //   const response = await client.get(`/api/users/${fakeId}`)

  //   response.assertStatus(404)
  //   response.assertBodyContains({
  //     message: 'User not found',
  //   })
  // })

  // test('should update a user', async ({ client }) => {
  //   const userData = {
  //     first_name: faker.person.firstName(),
  //     last_name: faker.person.lastName(),
  //     gender: 'male',
  //     birthdate: faker.date.past({ years: 30 }).toISOString().split('T')[0],
  //     email: faker.internet.email(),
  //     password: faker.internet.password({ length: 12 }),
  //   }

  //   const createResponse = await client.post('/api/users').json(userData)
  //   const userId = createResponse.body().id

  //   const updateData = {
  //     first_name: 'Updated Name',
  //     is_active: false,
  //   }

  //   const response = await client.put(`/api/users/${userId}`).json(updateData)

  //   response.assertStatus(200)
  //   response.assertBodyContains({
  //     id: userId,
  //     first_name: 'Updated Name',
  //     is_active: false,
  //   })
  // })

  // test('should not update user with duplicate email', async ({ client }) => {
  //   const user1Data = {
  //     first_name: faker.person.firstName(),
  //     last_name: faker.person.lastName(),
  //     gender: 'male',
  //     birthdate: faker.date.past({ years: 30 }).toISOString().split('T')[0],
  //     email: faker.internet.email(),
  //     password: faker.internet.password({ length: 12 }),
  //   }

  //   const user2Data = {
  //     first_name: faker.person.firstName(),
  //     last_name: faker.person.lastName(),
  //     gender: 'female',
  //     birthdate: faker.date.past({ years: 30 }).toISOString().split('T')[0],
  //     email: faker.internet.email(),
  //     password: faker.internet.password({ length: 12 }),
  //   }

  //   await client.post('/api/users').json(user1Data)
  //   const user2Response = await client.post('/api/users').json(user2Data)
  //   const user2Id = user2Response.body().id

  //   const updateData = {
  //     email: user1Data.email,
  //   }

  //   const response = await client.put(`/api/users/${user2Id}`).json(updateData)

  //   response.assertStatus(409)
  //   response.assertBodyContains({
  //     message: 'Email already exists',
  //   })
  // })

  // test('should delete a user', async ({ client }) => {
  //   const userData = {
  //     first_name: faker.person.firstName(),
  //     last_name: faker.person.lastName(),
  //     gender: 'male',
  //     birthdate: faker.date.past({ years: 30 }).toISOString().split('T')[0],
  //     email: faker.internet.email(),
  //     password: faker.internet.password({ length: 12 }),
  //   }

  //   const createResponse = await client.post('/api/users').json(userData)
  //   const userId = createResponse.body().id

  //   const response = await client.delete(`/api/users/${userId}`)

  //   response.assertStatus(204)

  //   // Verify user is deleted
  //   const getResponse = await client.get(`/api/users/${userId}`)
  //   getResponse.assertStatus(404)
  // })

  // test('should return 404 when deleting non-existent user', async ({ client }) => {
  //   const fakeId = faker.string.uuid()
  //   const response = await client.delete(`/api/users/${fakeId}`)

  //   response.assertStatus(404)
  //   response.assertBodyContains({
  //     message: 'User not found',
  //   })
  // })

  // test('should validate birthdate is in the past', async ({ client }) => {
  //   const userData = {
  //     first_name: faker.person.firstName(),
  //     last_name: faker.person.lastName(),
  //     gender: 'male',
  //     birthdate: faker.date.future().toISOString().split('T')[0], // Future date
  //     email: faker.internet.email(),
  //     password: faker.internet.password({ length: 12 }),
  //   }

  //   const response = await client.post('/api/users').json(userData)

  //   response.assertStatus(400)
  //   response.assertBodyContains({
  //     message: 'Validation failed',
  //   })
  // })

  // test('should validate password length', async ({ client }) => {
  //   const userData = {
  //     first_name: faker.person.firstName(),
  //     last_name: faker.person.lastName(),
  //     gender: 'male',
  //     birthdate: faker.date.past({ years: 30 }).toISOString().split('T')[0],
  //     email: faker.internet.email(),
  //     password: 'short', // Too short password
  //   }

  //   const response = await client.post('/api/users').json(userData)

  //   response.assertStatus(400)
  //   response.assertBodyContains({
  //     message: 'Validation failed',
  //   })
  // })
}) 