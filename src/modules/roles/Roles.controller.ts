import { Controller, Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RolesService } from './Roles.service';
import { AuthGuard } from 'src/middleware/jwt.guard';

@ApiTags('roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  // Was public. It existed to populate the self-registration role dropdown,
  // which let a caller pick any of the six seeded roles (including
  // rector/coordinator) as roleId on POST /user/create — see Task 11
  // report, fix round 5. That dropdown is going away; this at least stops
  // an unauthenticated caller from enumerating role uids in the meantime.
  @Get()
  @ApiOperation({ summary: 'Obtener todos los roles' })
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async getAllRoles() {
    return this.rolesService.getAllRoles();
  }
}
