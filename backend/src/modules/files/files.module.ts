import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

/**
 * Photos and documents (spec etapa-3.md §4.4, §6, §7.6). Storage and audit are
 * global modules; nothing else is imported.
 */
@Module({
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
