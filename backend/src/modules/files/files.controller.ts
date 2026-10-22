import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { AuthContext, CompanyAccess } from '../../common/request-context';
import { MAX_FILE_SIZE_BYTES, contentDisposition } from './file-rules';
import { FileListViewDto, FileViewDto } from './dto/files-responses.dto';
import { UploadFileDto } from './dto/upload-file.dto';
import { FilesService } from './files.service';

@ApiTags('files')
@ApiParam({ name: 'id', description: 'Identificador del espacio (empresa)' })
@Controller()
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('companies/:id/orders/:orderId/files')
  @UseGuards(CompanyAccessGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'orderId', description: 'Identificador de la orden' })
  @ApiOperation({ summary: 'Sube un archivo (foto/documento) a la orden (§7.6)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Archivo guardado', type: FileViewDto })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sin permiso sobre la orden (403)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Orden inexistente o fuera de alcance (404)' })
  @ApiResponse({ status: HttpStatus.UNSUPPORTED_MEDIA_TYPE, description: 'Tipo fuera de la allowlist (415)' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Tamaño, campos o archivo inválidos (422)' })
  uploadToOrder(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('orderId') orderId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
  ) {
    return this.filesService.uploadToOrder(access, auth, orderId, file, dto.kind);
  }

  @Post('companies/:id/jobs/:jobId/files')
  @UseGuards(CompanyAccessGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'jobId', description: 'Identificador del trabajo' })
  @ApiOperation({ summary: 'Sube evidencia (foto/documento) al trabajo (§7.1)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Archivo guardado', type: FileViewDto })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sin permiso sobre el trabajo (403)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Trabajo inexistente o fuera de alcance (404)' })
  @ApiResponse({ status: HttpStatus.UNSUPPORTED_MEDIA_TYPE, description: 'Tipo fuera de la allowlist (415)' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Tamaño, campos o archivo inválidos (422)' })
  uploadToJob(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('jobId') jobId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
  ) {
    return this.filesService.uploadToJob(access, auth, jobId, file, dto.kind);
  }

  @Get('companies/:id/orders/:orderId/files')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'orderId', description: 'Identificador de la orden' })
  @ApiOperation({ summary: 'Lista la metadata visible de los archivos de la orden (§4.4)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Metadata de archivos (los borrados con deleted_at)', type: FileListViewDto })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sin permiso sobre la orden (403)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Orden inexistente o fuera de alcance (404)' })
  listOrderFiles(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('orderId') orderId: string,
  ) {
    return this.filesService.listOrderFiles(access, auth, orderId);
  }

  @Get('companies/:id/files/:fileId')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'fileId', description: 'Identificador del archivo' })
  @ApiOperation({ summary: 'Descarga los bytes del archivo como stream (§4.4)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Bytes del archivo' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Archivo inexistente, borrado o fuera de alcance (404)' })
  @ApiResponse({ status: HttpStatus.SERVICE_UNAVAILABLE, description: 'Fallo del storage (503, §11)' })
  async download(
    @CurrentUser() auth: AuthContext,
    @Param('fileId') fileId: string,
  ): Promise<StreamableFile> {
    const { buffer, contentType, filename } = await this.filesService.download(auth, fileId);
    return new StreamableFile(buffer, {
      type: contentType,
      disposition: contentDisposition(filename),
    });
  }

  @Delete('companies/:id/files/:fileId')
  @UseGuards(CompanyAccessGuard)
  @ApiParam({ name: 'fileId', description: 'Identificador del archivo' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Borrado lógico del archivo con entrada en audit (§1.1.8)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Archivo borrado (lógicamente)' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'No es tu empresa ni lo subiste tú (403)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Archivo inexistente o fuera de alcance (404)' })
  async remove(
    @CurrentCompany() access: CompanyAccess,
    @CurrentUser() auth: AuthContext,
    @Param('fileId') fileId: string,
  ): Promise<void> {
    await this.filesService.remove(access, auth, fileId);
  }
}
