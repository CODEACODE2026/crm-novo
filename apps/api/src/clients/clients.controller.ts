import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { ClientsService } from './clients.service';
import { CreateClientReferenceDto } from './dto/create-client-reference.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { ListClientOptionsDto } from './dto/list-client-options.dto';
import { ListClientsDto } from './dto/list-clients.dto';
import { UpdateClientReferenceStatusDto } from './dto/update-client-reference-status.dto';
import { UpdateClientReferenceDto } from './dto/update-client-reference.dto';
import { UpdateClientStatusDto } from './dto/update-client-status.dto';
import { UpdateClientDto } from './dto/update-client.dto';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@UseGuards(JwtAuthGuard)
@Controller('clients')
export class ClientsController {
  constructor(@Inject(ClientsService) private readonly clientsService: ClientsService) {}

  @Get()
  list(@Query() query: ListClientsDto) {
    return this.clientsService.list(query);
  }

  @Get('options')
  options(@Query() query: ListClientOptionsDto) {
    return this.clientsService.options(query);
  }

  @Get('references/:referenceId')
  getReference(@Param('referenceId') referenceId: string) {
    return this.clientsService.getReference(referenceId);
  }

  @Patch('references/:referenceId')
  updateReference(
    @Param('referenceId') referenceId: string,
    @Body() dto: UpdateClientReferenceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.clientsService.updateReference(referenceId, dto, request.user.id);
  }

  @Post('references/:referenceId/status')
  updateReferenceStatus(
    @Param('referenceId') referenceId: string,
    @Body() dto: UpdateClientReferenceStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.clientsService.updateReferenceStatus(referenceId, dto, request.user.id);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.clientsService.get(id);
  }

  @Get(':id/references')
  listReferences(@Param('id') id: string) {
    return this.clientsService.listReferences(id);
  }

  @Post(':id/references')
  createReference(
    @Param('id') id: string,
    @Body() dto: CreateClientReferenceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.clientsService.createReference(id, dto, request.user.id);
  }

  @Post()
  create(@Body() dto: CreateClientDto, @Req() request: AuthenticatedRequest) {
    return this.clientsService.create(dto, request.user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.clientsService.update(id, dto, request.user.id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateClientStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.clientsService.updateStatus(id, dto, request.user.id);
  }
}
