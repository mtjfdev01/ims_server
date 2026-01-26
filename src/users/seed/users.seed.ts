import { DataSource } from 'typeorm';
import { User } from '../entities/user.entity';
import * as bcrypt from 'bcrypt';

export async function seedUsers(dataSource: DataSource): Promise<void> {
  const userRepository = dataSource.getRepository(User);

  // Check if users already exist
  const existingUsers = await userRepository.count();
  if (existingUsers > 0) {
    console.log('Users already exist, skipping seed...');
    return;
  }

  const users = [
    {
      email: 'admin@example.com',
      name: 'Admin User',
      password: await bcrypt.hash('admin123', 10),
    },
    {
      email: 'user@example.com',
      name: 'Regular User',
      password: await bcrypt.hash('user123', 10),
    },
  ];

  for (const userData of users) {
    const user = userRepository.create(userData);
    await userRepository.save(user);
    console.log(`Created user: ${user.email}`);
  }

  console.log('Users seeded successfully!');
}
