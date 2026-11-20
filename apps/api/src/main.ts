import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

dotenv.config({ path: resolve(__dirname, '../../..', '.env') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use(helmet({ contentSecurityPolicy: false }));
  if (process.env.NODE_ENV !== 'production') {
    app.enableCors({ origin: process.env.WEB_ORIGIN?.split(',').map((value) => value.trim()) ?? true, credentials: true });
  }
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const webDist = resolve(__dirname, '../../web/dist');
  if (existsSync(join(webDist, 'index.html'))) {
    app.useStaticAssets(webDist, { index: false, maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0 });
    app.use((req: any, res: any, next: any) => {
      if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.includes('.')) return res.sendFile(join(webDist, 'index.html'));
      next();
    });
  }
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`Review Center API listening on http://0.0.0.0:${port}`);
}

bootstrap();
