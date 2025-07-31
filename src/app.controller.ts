import { Controller, Get, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import * as path from 'path';
import { AppService } from './app.service';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('download')
  downloadResults(@Res() res: Response): void {
    const filePath = path.join(
      __dirname,
      '..',
      'data',
      'evaluation-results.csv',
    );
    res.download(filePath, 'evaluation-results.csv', (err?: Error) => {
      if (err) {
        this.logger.error('Error downloading file:', err.message);
        if (!res.headersSent) {
          res.status(404).json({ error: 'File not found' });
        }
      }
    });
  }
}
