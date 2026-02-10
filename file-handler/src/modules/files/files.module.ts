import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { FileValidationService } from './services/file-validation.service';
import { FileUploadService } from './services/file-upload.service';
import { FileSecurityService } from './services/file-security.service';
import { ClamavModule } from '../clamav/clamav.module';
import { StorageModule } from '../storage/storage.module';
import { DatabaseModule } from '../database/database.module';
import { memoryStorage } from 'multer';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
      limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE || '524288000'), // 500MB default
        files: 1,
      },
    }),
    ClamavModule,
    StorageModule,
    DatabaseModule,
  ],
  controllers: [FilesController],
  providers: [FilesService, FileValidationService, FileUploadService, FileSecurityService],
  exports: [FilesService],
})
export class FilesModule {}
