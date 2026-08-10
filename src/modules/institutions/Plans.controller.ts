import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InstitutionService } from './Institution.service';

@ApiTags('subscription-plans')
@Controller('subscription-plans')
export class PlansController {
  constructor(private readonly institutionService: InstitutionService) {}

  // Público: el formulario de alta y la pantalla de planes lo consumen sin
  // sesión. Antes los tres planes estaban hardcodeados en el frontend.
  @Get()
  @ApiOperation({ summary: 'Listar los planes de suscripción activos' })
  @HttpCode(HttpStatus.OK)
  async list() {
    return this.institutionService.listPlans();
  }
}
