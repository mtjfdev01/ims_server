import { DataSource } from 'typeorm';
import { User } from '../entities/user.entity';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../../common/request-context';

export async function seedUsers(dataSource: DataSource): Promise<void> {
  const userRepository = dataSource.getRepository(User);
  const existingUsers = await userRepository.count();
  if (existingUsers > 0) {
    console.log('Users already exist, skipping seed...');
    return;
  }

  const superEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@example.com';
  const superPassword = process.env.SUPER_ADMIN_PASSWORD || 'admin123';

  const superAdmin = userRepository.create({
    email: superEmail,
    name: 'Super Admin',
    password: await bcrypt.hash(superPassword, 10),
    visiblePassword: superPassword,
    role: UserRole.SUPER_ADMIN,
  });
  await userRepository.save(superAdmin);
  console.log(`Created super admin: ${superAdmin.email}`);
}
