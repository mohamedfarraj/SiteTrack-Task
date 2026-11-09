import {
  Controller,
  Delete,
  HttpException,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';

@Controller('uploads')
@ApiTags('Uploads')
@UseGuards(AuthGuard('jwt'))
export class UploadsController {
  constructor() {}

  @Post('file')
  @ApiCreatedResponse({
    description: 'The record has been successfully created.',
  })
  @ApiBody({})
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, callback) => {
          const filename: string = uuidv4();
          const extension: string = path.extname(file.originalname);
          callback(null, `${filename}${extension}`);
        },
      }),
      fileFilter: (req, file, callback) => {
        if (file.mimetype.match(/\/(jpg|jpeg|png|gif)$/)) {
          callback(null, true);
        } else {
          callback(
            new HttpException('Unsupported file type.', HttpStatus.BAD_REQUEST),
            false,
          );
        }
      },
    }),
  )
  async file(@UploadedFile() file: Express.Multer.File) {
    try {
      return file.originalname;
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.METHOD_NOT_ALLOWED);
    }
  }

  @Post('files')
  @ApiCreatedResponse({
    description: 'The record has been successfully created.',
  })
  @ApiBody({})
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, callback) => {
          const filename: string = uuidv4();
          const extension: string = path.extname(file.originalname);
          callback(null, `${filename}${extension}`);
        },
      }),
      fileFilter: (req, file, callback) => {
        if (file.mimetype.match(/\/(jpg|jpeg|png|gif)$/)) {
          callback(null, true);
        } else {
          callback(
            new HttpException('Unsupported file type.', HttpStatus.BAD_REQUEST),
            false,
          );
        }
      },
    }),
  )
  async files(@UploadedFiles() files: Express.Multer.File[]) {
    try {
      return files.map((el) => {
        return { filename: el.filename, originalname: el.originalname };
      });
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.METHOD_NOT_ALLOWED);
    }
  }

  @ApiParam({
    name: 'filename',
    required: true,
    description: 'Name of the file to delete',
  })
  @ApiResponse({ status: 200, description: 'File deleted successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @Delete(':filename')
  async deleteFile(@Param('filename') filename: string) {
    try {
      const sanitizedFilename = path.basename(filename);
      const filePath = path.join(
        'uploads',
        sanitizedFilename,
      );

      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
      const fileExtension = path.extname(sanitizedFilename).toLowerCase();

      if (!allowedExtensions.includes(fileExtension)) {
        throw new HttpException('Invalid file type', HttpStatus.BAD_REQUEST);
      }
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return {
          message: 'File deleted successfully',
          filename: sanitizedFilename,
        };
      } else {
        throw new HttpException('File not found', HttpStatus.NOT_FOUND);
      }
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
