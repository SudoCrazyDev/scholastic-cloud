import Role from '#models/role'
import User from '#models/user'
import { DateTime } from 'luxon'

export default class SuperAdminSeeder {
  public async run() {
    // Create SUPER ADMINISTRATOR role if not exists
    let role = await Role.findBy('slug', 'super-administrator')
    if (!role) {
      role = await Role.create({
        title: 'SUPER ADMINISTRATOR',
        slug: 'super-administrator',
      })
      console.log('SUPER ADMINISTRATOR role created')
    } else {
      console.log('SUPER ADMINISTRATOR role already exists')
    }

    // Create super user if not exists
    const email = 'superadmin@scholasticcloud.local'
    let user = await User.findBy('email', email)
    if (!user) {
      user = await User.create({
        first_name: 'Super',
        last_name: 'Admin',
        middle_name: null,
        ext_name: null,
        gender: 'other',
        birthdate: DateTime.fromISO('1990-01-01'),
        email,
        password: 'SuperSecurePassword123!',
        is_new: false,
        is_active: true,
        role_id: role.id,
      })
      console.log('Super admin user created:')
      console.log('Email:', email)
      console.log('Password: SuperSecurePassword123!')
    } else {
      console.log('Super admin user already exists:', email)
    }
  }
} 