import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { UserPermissionsService } from './user-permissions.service';
import { SetUserPermissionsDto } from './dto/set-user-permissions.dto';

@Controller('user-permissions')
export class UserPermissionsController {
  constructor(private readonly userPermissionsService: UserPermissionsService) {}

  @Get('modules')
  listModules() {
    return this.userPermissionsService.listCatalog();
  }

  @Get()
  listUsers(@Query('tenantId') tenantId?: string) {
    return this.userPermissionsService.listOrganizationUsers(tenantId ? +tenantId : undefined);
  }

  @Put(':userId')
  setUserModules(@Param('userId') userId: string, @Body() body: SetUserPermissionsDto) {
    return this.userPermissionsService.setUserModules(+userId, body.modules || []);
  }
}
