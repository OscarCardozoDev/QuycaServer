import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/jwt.guard';
import { TenantGuard } from 'src/tenant/tenant.guard';
import { ContextRoleGuard } from 'src/guards/context-role.guard';
import { RequireContextRole } from 'src/decorators/context-role.decorator';
import { Institution } from 'src/decorators/institution.decorator';
import { CurrentUser } from 'src/decorators/currentUser';
import type { ActiveInstitution } from 'src/interface/jwtPayload';
import { ProductService } from './Product.service';
import {
  CreateProductDto,
  ApproveManyDto,
  UpdateProductStatusDto,
  UpdateProductDto,
  GetProductsDto,
  ProductParamsDto,
} from './Product.dto';

@ApiTags('products')
@Controller('products')
export class ProductController {
  constructor(private readonly productsService: ProductService) {}

  // ─── CREATE ───────────────────────────────────────────────────────────────

  @Post('create')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('student', 'institutional')
  @ApiOperation({ summary: 'Crear una obra' })
  async create(
    @Body() body: CreateProductDto,
    @Institution() institution: ActiveInstitution,
  ) {
    return this.productsService.createProductUseCase({
      product: {
        name: body.name,
        description: body.description,
        price: body.price,
        madeAt: new Date(body.madeAt),
        groupId: body.groupId,
        isSold: body.isSold,
      },
      authors: body.authors,
      styles: body.styles,
      images: body.images,
      institutionId: institution.uid,
    });
  }

  // ─── READ ─────────────────────────────────────────────────────────────────
  // Público: alimenta la galería sin sesión. Se resuelve en Task 13.

  @Get('getAll')
  @ApiOperation({ summary: 'Obtener todos los productos paginadas' })
  async getAll(@Query() query: GetProductsDto) {
    return this.productsService.getAll(query);
  }

  @Get('getGalleryHome')
  @ApiOperation({ summary: 'Obtener obras para galería home' })
  async getGalleryHome(@Query() query: GetProductsDto) {
    return this.productsService.getGalleryHome(query);
  }

  @Get('getGroup/:uid')
  @ApiOperation({ summary: 'Obtener obras por grupo' })
  async getAllByGroup(
    @Param('uid') groupId: string,
    @Query() query: GetProductsDto,
  ) {
    return this.productsService.getAllByGroup(groupId, query);
  }

  @Get('group/:uid')
  @UseGuards(AuthGuard, TenantGuard)
  @ApiOperation({
    summary: 'Obras del grupo, acotadas a la institución activa',
  })
  async getGroupPrivate(
    @Param('uid') groupId: string,
    @Query() query: GetProductsDto,
  ) {
    return this.productsService.getAllByGroupPrivate(groupId, query);
  }

  // No lleva ':uid' en el path, así que no hay riesgo de que una ruta con
  // parámetro la capture primero — pero va declarada antes de 'getAuthor/:uid'
  // y 'get/:uid' de todas formas, por si alguna migra a un prefijo compartido.
  @Get('mine')
  @UseGuards(AuthGuard, TenantGuard)
  @ApiOperation({ summary: 'Mis obras, en todos los estados' })
  async getMine(
    @CurrentUser('uid') uid: string,
    @Query() query: GetProductsDto,
  ) {
    return this.productsService.getMine(uid, query);
  }

  @Get('getAuthor/:uid')
  @ApiOperation({ summary: 'Obtener obras por autor' })
  async getAllByAuthor(
    @Param('uid') authorId: string,
    @Query() query: GetProductsDto,
  ) {
    return this.productsService.getAllByAuthor(authorId, query);
  }

  @Get('get/:uid')
  @ApiOperation({ summary: 'Obtener obra por ID' })
  async getById(@Param() params: ProductParamsDto) {
    const product = await this.productsService.getById(params.uid);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────

  @Put('approveMany')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('institutional')
  @ApiOperation({ summary: 'Aprobar varias obras seleccionadas a la vez' })
  approveManyProducts(@Body() dto: ApproveManyDto) {
    return this.productsService.approveMany(dto.productIds);
  }

  @Patch('status/:uid')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('institutional')
  @ApiOperation({ summary: 'Aprobar o negar una obra individual' })
  updateProductStatus(
    @Param('uid', new ParseUUIDPipe()) uid: string,
    @Body() dto: UpdateProductStatusDto,
  ) {
    return this.productsService.updateStatus({
      uid,
      status: dto.status,
      feedback: dto.feedback,
    });
  }

  @Put('update/:uid')
  @UseGuards(AuthGuard, TenantGuard, ContextRoleGuard)
  @RequireContextRole('student', 'institutional')
  @ApiOperation({ summary: 'Actualizar una obra' })
  async update(
    @Param() params: ProductParamsDto,
    @Body() body: UpdateProductDto,
  ) {
    return this.productsService.updateProductUseCase({
      productId: params.uid,
      data: {
        name: body.name,
        description: body.description,
        price: body.price,
        madeAt: body.madeAt ? new Date(body.madeAt) : undefined,
        isSold: body.isSold,
      },
      authors: body.authors,
      styles: body.styles,
      images: body.images,
    });
  }
}
