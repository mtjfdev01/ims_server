import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { AuthContextService } from './auth-context.service';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, AuthContextService],
  exports: [AuthContextService],
})
export class AuthModule {}
