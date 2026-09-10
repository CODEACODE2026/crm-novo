import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';

type JwtExpiresIn = '15m' | '1h' | '8h' | '1d' | '7d';

function getJwtExpiresIn(config: ConfigService): JwtExpiresIn {
  const configured = config.get<string>('JWT_EXPIRES_IN', '8h');
  const allowed: readonly JwtExpiresIn[] = ['15m', '1h', '8h', '1d', '7d'];

  return allowed.includes(configured as JwtExpiresIn) ? (configured as JwtExpiresIn) : '8h';
}

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        return {
          secret: config.getOrThrow<string>('JWT_SECRET'),
          signOptions: { expiresIn: getJwtExpiresIn(config) },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
