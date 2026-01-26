import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private usersService: UsersService) {}

  async login(loginDto: LoginDto): Promise<{ user: { id: number; email: string; name: string; shops: any[] } }> {
    const user = await this.usersService.findByEmail(loginDto.email);
    
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await this.usersService.validatePassword(user, loginDto.password);
    
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Return user data without password, including shops
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        shops: user.shops ? user.shops.map(shop => ({ id: shop.id, name: shop.name })) : [],
      },
    };
  }
}
